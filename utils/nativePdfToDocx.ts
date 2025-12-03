import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak, Footer, Header, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx';
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
      const pageWidth = viewport.width;
      
      const textContent = await page.getTextContent();
      const items = textContent.items as TextItem[];

      // 1. Group items by Y coordinate (Lines)
      items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5]; // Sort Top to Bottom
        if (Math.abs(yDiff) > 5) return yDiff; // Tolerance for "same line"
        return a.transform[4] - b.transform[4]; // Sort Left to Right
      });

      let currentLineY = -1;
      let currentLineItems: TextItem[] = [];
      const lines: ProcessedLine[] = [];

      for (const item of items) {
        if (!item.str.trim()) continue; // Skip empty whitespace items

        const y = item.transform[5];
        if (currentLineY === -1 || Math.abs(currentLineY - y) < 5) {
          currentLineItems.push(item);
          currentLineY = y;
        } else {
          // Sort items in the finished line by X coordinate to be sure
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

      // 3. Process Lines into Tables or Paragraphs
      // The "Adaptive Grid" logic: If a line has large gaps, use an Invisible Table.
      
      const GAP_THRESHOLD = 25; // Points. If gap > 25pt, treat as separate column.

      const processLinesToChildren = (targetLines: ProcessedLine[]) => {
          const docxChildren: any[] = [];
          
          for (const line of targetLines) {
              // Analyze gaps
              const columns: TextItem[][] = [];
              let currentColumn: TextItem[] = [line.items[0]];
              
              for (let i = 1; i < line.items.length; i++) {
                  const prev = line.items[i-1];
                  const curr = line.items[i];
                  
                  // Estimate previous item end X (approximate width calculation if width is missing or weird)
                  const prevEndX = prev.transform[4] + (prev.width || (prev.str.length * 4)); 
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
                  const cells = columns.map(colItems => {
                      // Merge text in the column
                      const text = colItems.map(it => it.str).join('');
                      // Get font size from first item
                      const fontSize = Math.sqrt((colItems[0].transform[0] ** 2) + (colItems[0].transform[1] ** 2));
                      
                      return new TableCell({
                          children: [new Paragraph({
                              children: [new TextRun({
                                  text: text,
                                  size: Math.round(fontSize * 2) || 20, // Half-points
                                  font: "Arial"
                              })]
                          })],
                          borders: {
                              top: { style: BorderStyle.NONE, size: 0 },
                              bottom: { style: BorderStyle.NONE, size: 0 },
                              left: { style: BorderStyle.NONE, size: 0 },
                              right: { style: BorderStyle.NONE, size: 0 },
                          },
                          // We let Word auto-distribute width, or could calculate percentages based on X pos
                          // For simplicity in this lightweight native converter, auto-width often works best for alignment
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
                  // Merge text carefully considering small spaces
                  let fullText = "";
                  let lastX = -1;
                  
                  colItems.forEach((it, idx) => {
                      if (idx > 0 && lastX !== -1) {
                           const gap = it.transform[4] - lastX;
                           if (gap > 2) fullText += " "; // Add space if small gap
                      }
                      fullText += it.str;
                      lastX = it.transform[4] + (it.width || 0);
                  });

                  const firstItem = colItems[0];
                  const startX = firstItem.transform[4];
                  const fontSize = Math.sqrt((firstItem.transform[0] ** 2) + (firstItem.transform[1] ** 2));

                  // Calculate indentation (Twips: 1pt = 20twips)
                  // Subtracting a small margin to align with standard page margins
                  const indentLeft = Math.max(0, Math.round(startX * 15)); 

                  docxChildren.push(new Paragraph({
                      children: [new TextRun({
                          text: fullText,
                          size: Math.round(fontSize * 2) || 22,
                          font: "Arial"
                      })],
                      indent: { left: indentLeft },
                      spacing: { after: 120 } // Slight spacing
                  }));
              }
          }
          return docxChildren;
      };

      const bodyParams = processLinesToChildren(lines.filter(l => !l.isHeader && !l.isFooter));
      const headerParams = processLinesToChildren(lines.filter(l => l.isHeader));
      const footerParams = processLinesToChildren(lines.filter(l => l.isFooter));

      // Add Page Break if not first page
      if (pageNum > 1) {
         // Insert page break at the start of body
         bodyParams.unshift(new Paragraph({ children: [new PageBreak()] }));
      }

      sections.push({
        properties: {
             page: {
                 margin: {
                     top: 720, // 0.5 inch
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