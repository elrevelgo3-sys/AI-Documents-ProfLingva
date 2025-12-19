
import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun, PageBreak, Footer, Header, Table, TableRow, TableCell, BorderStyle, WidthType, ImageRun } from 'docx';
import saveAs from 'file-saver';

// Ensure worker is set correctly
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

interface TextItem {
  str: string;
  dir: string;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
  width: number;
  height: number;
  hasEOL: boolean;
  type: 'text';
}

interface ImageItem {
  type: 'image';
  data: Uint8Array;
  width: number;
  height: number;
  transform: number[]; // [scaleX, skewY, skewX, scaleY, tx, ty]
}

type DocItem = TextItem | ImageItem;

interface ProcessedLine {
  y: number;
  items: DocItem[];
  isHeader: boolean;
  isFooter: boolean;
  height: number;
}

export const convertNativePdfToDocx = async (file: File, updateProgress?: (msg: string) => void) => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    
    const sections: any[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (updateProgress) updateProgress(`Extracting content page ${pageNum}/${numPages}...`);
      
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageHeight = viewport.height;
      
      // 1. Get Text Content
      const textContent = await page.getTextContent();
      const textItems = textContent.items.map((item: any) => ({
          ...item,
          type: 'text'
      })) as TextItem[];

      // 2. Get Images via Operator List (Advanced)
      const ops = await page.getOperatorList();
      const imageItems: ImageItem[] = [];
      
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        
        // Check for PaintImageXObject (Image drawing command)
        if (fn === pdfjsLib.OPS.paintImageXObject) {
            const imgName = ops.argsArray[i][0];
            
            try {
                // Retrieve image data from page objects
                const imgObj = await page.objs.get(imgName);
                if (imgObj && imgObj.data) {
                    // Find the transformation matrix applied right before this image paint
                    // We look backwards in the ops list for the last 'dependency' or 'transform'
                    // For simplicity in this "Instant" mode, we'll try to match it with the current transform state.
                    // Note: PDF.js flattens this, but finding the exact coordinate of an image without rendering is tricky.
                    // We will approximate using the page size or simple flow if exact coords fail.
                    
                    // However, we can use a simpler trick: Render the page to a canvas, then crop? 
                    // No, that's what Gemini mode does. 
                    // Let's create a valid image item. 
                    
                    // In PDF, images are often 1x1 unit squares scaled up by the CTM (Current Transformation Matrix).
                    // We'd need to track the CTM. This is too complex for a single file script.
                    
                    // ALTERNATIVE: We just collect the image data. 
                    // For positioning, we will push it as a paragraph.
                    
                    imageItems.push({
                        type: 'image',
                        data: imgObj.data,
                        width: imgObj.width,
                        height: imgObj.height,
                        transform: [imgObj.width, 0, 0, imgObj.height, 0, 0] // Dummy transform, we'll just flow it
                    });
                }
            } catch (err) {
                console.warn("Failed to extract image", imgName, err);
            }
        }
      }

      // Combine Text and Images
      // Since we can't easily get exact Y for images without a full PDF parser, 
      // we will append images at the end of the section or try to interleave if possible.
      // *Correction*: To make it robust without 1000 lines of matrix math, we will handle images as attachments 
      // or if we really want layout, we'd need the CTM. 
      // For this implementation, we will focus on *Text Layout Stability* and just append images to avoid breaking text.
      
      const allItems: DocItem[] = [...textItems]; // We focus on text layout primarily for "Native"

      // 3. Sort by Y (Top to Bottom)
      allItems.sort((a, b) => {
        // transform[5] is Translate Y. In PDF, 0 is bottom. So higher Y is higher on page.
        // We want Top to Bottom, so we sort descending Y.
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff; 
        return a.transform[4] - b.transform[4]; // Left to Right
      });

      // 4. Group into Lines
      let currentLineY = -1;
      let currentLineItems: DocItem[] = [];
      const lines: ProcessedLine[] = [];

      for (const item of allItems) {
        if (item.type === 'text' && !item.str.trim()) continue;

        const y = item.transform[5];
        // Height estimation
        const h = item.type === 'text' ? Math.sqrt(item.transform[0]**2 + item.transform[1]**2) : item.height;

        if (currentLineY === -1 || Math.abs(currentLineY - y) < (h * 0.5)) { // Dynamic tolerance
          currentLineItems.push(item);
          currentLineY = y;
        } else {
          // Sort items in line X-wise
          currentLineItems.sort((a,b) => a.transform[4] - b.transform[4]);
          lines.push({
            y: currentLineY,
            items: currentLineItems,
            isHeader: false,
            isFooter: false,
            height: h
          });
          currentLineItems = [item];
          currentLineY = y;
        }
      }
      if (currentLineItems.length > 0) {
        currentLineItems.sort((a,b) => a.transform[4] - b.transform[4]);
        lines.push({ y: currentLineY, items: currentLineItems, isHeader: false, isFooter: false, height: 12 });
      }

      // 5. Header/Footer Detection
      const headerThreshold = pageHeight * 0.90;
      const footerThreshold = pageHeight * 0.10;

      lines.forEach(line => {
        if (line.y > headerThreshold) line.isHeader = true;
        if (line.y < footerThreshold) line.isFooter = true;
      });

      // 6. Intelligent Column Detection
      const processLinesToChildren = (targetLines: ProcessedLine[]) => {
          const docxChildren: any[] = [];
          
          for (const line of targetLines) {
              const items = line.items as TextItem[]; // Focusing on text for layout
              
              // Detect gaps to identify columns
              // We look for gaps significantly larger than a normal space width
              const columns: TextItem[][] = [];
              let currentColumn: TextItem[] = [items[0]];
              
              for (let i = 1; i < items.length; i++) {
                  const prev = items[i-1];
                  const curr = items[i];
                  
                  // Estimate character width based on font size (approximate)
                  const fontSize = Math.sqrt(prev.transform[0]**2 + prev.transform[1]**2);
                  const charWidth = prev.width > 0 ? (prev.width / prev.str.length) : (fontSize * 0.5);
                  
                  const prevEnd = prev.transform[4] + (prev.width || (prev.str.length * charWidth));
                  const currStart = curr.transform[4];
                  const gap = currStart - prevEnd;

                  // Threshold: 3 spaces worth of gap usually means a new column
                  const gapThreshold = charWidth * 3; 

                  if (gap > gapThreshold) {
                      columns.push(currentColumn);
                      currentColumn = [];
                  }
                  currentColumn.push(curr);
              }
              columns.push(currentColumn);

              // Render
              if (columns.length > 1) {
                  // MULTI-COLUMN -> Invisible Table
                  const cellWidthPercent = 100 / columns.length;
                  
                  const cells = columns.map(colItems => {
                      const text = colItems.map(it => it.str).join(' '); // Simple join
                      const fSize = Math.sqrt(colItems[0].transform[0]**2 + colItems[0].transform[1]**2);
                      
                      return new TableCell({
                          children: [new Paragraph({
                              children: [new TextRun({
                                  text: text,
                                  size: Math.max(16, Math.round(fSize * 1.5)), // Adjust scaling
                                  font: "Arial"
                              })]
                          })],
                          width: { size: cellWidthPercent, type: WidthType.PERCENTAGE },
                          borders: {
                              top: { style: BorderStyle.NONE, size: 0 },
                              bottom: { style: BorderStyle.NONE, size: 0 },
                              left: { style: BorderStyle.NONE, size: 0 },
                              right: { style: BorderStyle.NONE, size: 0 },
                          }
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
                          insideVertical: { style: BorderStyle.NONE, size: 0 },
                      }
                  }));

              } else {
                  // SINGLE COLUMN -> Paragraph with indent
                  const colItems = columns[0];
                  let fullText = "";
                  let lastX = -1;
                  
                  colItems.forEach((it, idx) => {
                      if (idx > 0 && lastX !== -1) {
                           const gap = it.transform[4] - lastX;
                           if (gap > 2) fullText += " "; 
                      }
                      fullText += it.str;
                      lastX = it.transform[4] + (it.width || 0);
                  });

                  // Simple Indent Logic: 
                  // Map X coordinate (0-595 typically) to Twips (1/20 pt).
                  // Page width ~600pt. Word width ~12000 twips.
                  // Factor ~20.
                  const startX = colItems[0].transform[4];
                  const indentLeft = Math.round(startX * 15); // Approximate visual match

                  const fSize = Math.sqrt(colItems[0].transform[0]**2 + colItems[0].transform[1]**2);

                  docxChildren.push(new Paragraph({
                      children: [new TextRun({
                          text: fullText,
                          size: Math.max(16, Math.round(fSize * 1.5)),
                          font: "Arial"
                      })],
                      indent: { left: indentLeft },
                      spacing: { after: 100 }
                  }));
              }
          }
          return docxChildren;
      };

      const bodyParams = processLinesToChildren(lines.filter(l => !l.isHeader && !l.isFooter));
      const headerParams = processLinesToChildren(lines.filter(l => l.isHeader));
      const footerParams = processLinesToChildren(lines.filter(l => l.isFooter));

      // 7. Inject Extracted Images (At end of page - safest place for Native mode)
      if (imageItems.length > 0) {
          imageItems.forEach(img => {
              // Convert Uint8Array to Base64 for Docx
              let binary = '';
              const len = img.data.byteLength;
              for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(img.data[i]);
              }
              const b64 = btoa(binary);

              bodyParams.push(new Paragraph({
                  children: [
                      new ImageRun({
                          data: b64,
                          transformation: { width: 300, height: (300 * img.height / img.width) }, // Auto-scale to fit nicely
                          type: "png" // Assume PNG/JPEG generic handling
                      })
                  ],
                  spacing: { before: 200, after: 200 }
              }));
          });
      }

      if (pageNum > 1) {
         bodyParams.unshift(new Paragraph({ children: [new PageBreak()] }));
      }

      sections.push({
        properties: {
             page: {
                 margin: { top: 720, bottom: 720, left: 720, right: 720 }
             }
        },
        children: bodyParams,
        headers: { default: new Header({ children: headerParams }) },
        footers: { default: new Footer({ children: footerParams }) }
      });
    }

    if (updateProgress) updateProgress('Packing DOCX...');
    const doc = new Document({ sections: sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, file.name.replace(/\.pdf$/i, '') + '.docx');

  } catch (e) {
    console.error("Native PDF conversion failed", e);
    throw e;
  }
};
