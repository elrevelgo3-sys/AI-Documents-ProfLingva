import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun, PageBreak, Footer, Header, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx';
import saveAs from 'file-saver';

// Ensure worker is set
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

interface TextItem {
  str: string;
  dir: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

interface ProcessedLine {
  y: number;
  items: TextItem[];
  isHeader: boolean;
  isFooter: boolean;
}

export const convertNativePdfToDocx = async (file: File, updateProgress?: (msg: string) => void) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    
    const sections: any[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (updateProgress) updateProgress(`Reconstructing layout page ${pageNum}/${numPages}...`);
      
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 }); // 1pt = 1px at scale 1
      const pageHeight = viewport.height;
      
      const textContent = await page.getTextContent();
      const items = textContent.items as TextItem[];

      // 1. Group items by Y coordinate (Lines)
      items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // Sort Top to Bottom
        if (Math.abs(yDiff) > 4) return yDiff; // Stricter tolerance for "same line"
        return a.transform[4] - b.transform[4]; // Sort Left to Right
      });

      let currentLineY = -1;
      let currentLineItems: TextItem[] = [];
      const lines: ProcessedLine[] = [];

      for (const item of items) {
        if (!item.str.trim()) continue; // Skip empty whitespace items

        const y = item.transform[5];
        if (currentLineY === -1 || Math.abs(currentLineY - y) < 4) {
          currentLineItems.push(item);
          currentLineY = y;
        } else {
          // Sort items in the finished line by X coordinate
          currentLineItems.sort((a,b) => a.transform[4] - b.transform[4]);
          lines.push({
            y: currentLineY,
            items: currentLineItems,
            isHeader: false,
            isFooter: false
          });
          currentLineItems = [item];
          currentLineY = y;
        }
      }
      if (currentLineItems.length > 0) {
        currentLineItems.sort((a,b) => a.transform[4] - b.transform[4]);
        lines.push({ y: currentLineY, items: currentLineItems, isHeader: false, isFooter: false });
      }

      // 2. Identify Headers and Footers based on thresholds
      const headerThreshold = pageHeight * 0.92;
      const footerThreshold = pageHeight * 0.08;

      lines.forEach(line => {
        if (line.y > headerThreshold) line.isHeader = true;
        if (line.y < footerThreshold) line.isFooter = true;
      });

      // 3. Process Lines into Tables or Paragraphs (Adaptive Grid)
      const GAP_THRESHOLD = 25; 

      const processLinesToChildren = (targetLines: ProcessedLine[]) => {
          const docxChildren: any[] = [];
          
          for (const line of targetLines) {
              // Analyze gaps to detect columns
              const columns: TextItem[][] = [];
              let currentColumn: TextItem[] = [line.items[0]];
              
              for (let i = 1; i < line.items.length; i++) {
                  const prev = line.items[i-1];
                  const curr = line.items[i];
                  
                  // Calculate gap
                  const prevWidth = prev.width > 0 ? prev.width : (prev.str.length * 4.5);
                  const prevEndX = prev.transform[4] + prevWidth; 
                  const currStartX = curr.transform[4];
                  const gap = currStartX - prevEndX;

                  if (gap > GAP_THRESHOLD) {
                      columns.push(currentColumn);
                      currentColumn = [];
                  }
                  currentColumn.push(curr);
              }
              columns.push(currentColumn);

              if (columns.length > 1) {
                  // --- CASE A: Multi-column line (Use Invisible Table) ---
                  // Calculate relative widths
                  const totalWidthEstimate = viewport.width * 0.9; // Assume content uses ~90% of width
                  
                  const cells = columns.map(colItems => {
                      const text = colItems.map(it => it.str).join(''); 
                      const fontSize = Math.sqrt((colItems[0].transform[0] ** 2) + (colItems[0].transform[1] ** 2));
                      
                      return new TableCell({
                          children: [new Paragraph({
                              children: [new TextRun({
                                  text: text,
                                  size: Math.round(fontSize * 2) || 20,
                                  font: "Arial"
                              })]
                          })],
                          width: {
                              size: 100 / columns.length, // Distribute evenly
                              type: WidthType.PERCENTAGE
                          },
                          borders: {
                              top: { style: BorderStyle.NONE, size: 0 },
                              bottom: { style: BorderStyle.NONE, size: 0 },
                              left: { style: BorderStyle.NONE, size: 0 },
                              right: { style: BorderStyle.NONE, size: 0 },
                          },
                      });
                  });

                  docxChildren.push(new Table({
                      rows: [new TableRow({ children: cells })],
                      width: { size: 100, type: WidthType.PERCENTAGE },
                      borders: {
                          top: { style: BorderStyle.NONE, size: 0 },
                          bottom: { style: BorderStyle.NONE, size: 0 },
                          left: { style: BorderStyle.NONE, size: 0 },
                          right: { style: BorderStyle.NONE, size: 0 },
                          insideHorizontal: { style: BorderStyle.NONE, size: 0 },
                          insideVertical: { style: BorderStyle.NONE, size: 0 },
                      }
                  }));

              } else {
                  // --- CASE B: Single column line (Use Paragraph with Indent) ---
                  const colItems = columns[0];
                  let fullText = "";
                  let lastX = -1;
                  
                  colItems.forEach((it, idx) => {
                      if (idx > 0 && lastX !== -1) {
                           const gap = it.transform[4] - lastX;
                           // Add space if gap is small (word break)
                           if (gap > 2) fullText += " "; 
                      }
                      fullText += it.str;
                      lastX = it.transform[4] + (it.width || (it.str.length * 4.5));
                  });

                  const firstItem = colItems[0];
                  const startX = firstItem.transform[4];
                  const fontSize = Math.sqrt((firstItem.transform[0] ** 2) + (firstItem.transform[1] ** 2));

                  // Indentation logic: 1pt = 20 Twips.
                  // We map PDF x-coordinate directly to Word Indentation.
                  // Default margins in Word are typically ~1 inch (72pt / 1440 twips).
                  // Our Doc definition sets margins to 720 (0.5 inch).
                  // So we map coordinate X to indentation relative to margin.
                  // PDF coordinate 0 starts at edge of paper.
                  // Word body starts at margin.
                  // If PDF text is at X=50, and margin is 36 (0.5 inch approx), relative indent is 14.
                  
                  // Simplified: Just multiply by 15 to approximate visual position without negative indents.
                  const indentLeft = Math.max(0, Math.round(startX * 15)); 

                  docxChildren.push(new Paragraph({
                      children: [new TextRun({
                          text: fullText,
                          size: Math.round(fontSize * 2) || 22,
                          font: "Arial"
                      })],
                      indent: { left: indentLeft },
                      spacing: { after: 80 } 
                  }));
              }
          }
          return docxChildren;
      };

      const bodyParams = processLinesToChildren(lines.filter(l => !l.isHeader && !l.isFooter));
      const headerParams = processLinesToChildren(lines.filter(l => l.isHeader));
      const footerParams = processLinesToChildren(lines.filter(l => l.isFooter));

      if (pageNum > 1) {
         bodyParams.unshift(new Paragraph({ children: [new PageBreak()] }));
      }

      sections.push({
        properties: {
             page: {
                 margin: {
                     top: 720,
                     bottom: 720,
                     left: 720, 
                     right: 720
                 }
             }
        },
        children: bodyParams,
        headers: {
            default: new Header({ children: headerParams })
        },
        footers: {
            default: new Footer({ children: footerParams })
        }
      });
    }

    if (updateProgress) updateProgress('Packing DOCX...');
    
    const doc = new Document({
      sections: sections
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, file.name.replace(/\.pdf$/i, '') + '.docx');

  } catch (e) {
    console.error("Native PDF conversion failed", e);
    throw e;
  }
};