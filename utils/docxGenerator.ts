import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, ImageRun, WidthType, BorderStyle, PageBreak, Footer, Header, PageNumber, TableLayoutType, FrameAnchorType, HorizontalPositionAlign, VerticalPositionAlign, HeightRule } from 'docx';
import saveAs from 'file-saver';
import { StructuredDocument, ElementType } from '../types';

// Re-implement crop here to be safe if imports are tricky
async function cropImage(sourceBlob: Blob, bbox: number[]): Promise<string | null> {
  if (!bbox || bbox.length !== 4) return null;
  return new Promise((resolve) => {
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let [ymin, xmin, ymax, xmax] = bbox;
      // Normalize
      if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
      if (xmin > xmax) [xmin, xmax] = [xmax, xmin];

      const w = Math.abs(xmax - xmin);
      const h = Math.abs(ymax - ymin);
      
      if (w < 10 || h < 10) { resolve(null); return; }

      const realW = (w / 1000) * img.width;
      const realH = (h / 1000) * img.height;
      const realX = (xmin / 1000) * img.width;
      const realY = (ymin / 1000) * img.height;

      canvas.width = realW;
      canvas.height = realH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, realW, realH);
        ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      } else {
        resolve(null);
      }
      URL.revokeObjectURL(sourceUrl);
    };
    img.onerror = () => resolve(null);
    img.src = sourceUrl;
  });
}

export interface PageResult {
  data: StructuredDocument;
  source: Blob;
  pageNumber: number;
}

export const downloadDocx = async (pages: PageResult[], originalFilename: string) => {
  if (!pages || pages.length === 0) return;

  const children: any[] = [];
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  // A4 Page Dimensions in Twips (approx)
  // Width: 11906 twips (210mm)
  // Height: 16838 twips (297mm)
  const PAGE_WIDTH_TWIPS = 11906;
  const PAGE_HEIGHT_TWIPS = 16838;

  for (let i = 0; i < sortedPages.length; i++) {
    const page = sortedPages[i];
    const { data, source } = page;

    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    if (!data.elements) continue;

    // Filter out empty elements
    const validElements = data.elements.filter(e => e.bbox && e.bbox.length === 4);

    for (const element of validElements) {
      // Coordinate conversions
      // Gemini: 0-1000 range.
      // Docx Frame: Twips relative to page/margin.
      const [ymin, xmin, ymax, xmax] = element.bbox;
      
      // Calculate Width/Height in Twips
      const widthPercent = Math.abs(xmax - xmin) / 1000;
      const heightPercent = Math.abs(ymax - ymin) / 1000;
      
      const widthTwips = Math.floor(widthPercent * PAGE_WIDTH_TWIPS);
      // const heightTwips = Math.floor(heightPercent * PAGE_HEIGHT_TWIPS);
      
      const xTwips = Math.floor((xmin / 1000) * PAGE_WIDTH_TWIPS);
      const yTwips = Math.floor((ymin / 1000) * PAGE_HEIGHT_TWIPS);

      const alignmentMap = {
        'l': AlignmentType.LEFT,
        'c': AlignmentType.CENTER,
        'r': AlignmentType.RIGHT,
        'j': AlignmentType.JUSTIFIED,
        'left': AlignmentType.LEFT,
        'center': AlignmentType.CENTER,
        'right': AlignmentType.RIGHT,
        'justify': AlignmentType.JUSTIFIED,
      };
      
      const align = alignmentMap[element.style?.alignment as any] || AlignmentType.LEFT;
      
      // Force Black unless specifically Red (Blue/header often hallucinates)
      let color = "000000";
      if (element.style?.color && element.style.color.toLowerCase().includes("ff0000")) {
          color = "FF0000";
      }

      const fontSize = (element.style?.font_size || 10) * 2; // Half-points

      // 1. Handle Tables (Tables are hard to absolute position perfectly, usually flow is better, but we can indent)
      if (element.type === ElementType.TABLE && element.data?.rows) {
         // Create table
         const rows = element.data.rows.map(r => new TableRow({
             children: r.map(c => new TableCell({
                 children: [new Paragraph({ children: [new TextRun({ text: c, size: 16 })] })],
                 width: { size: 100/r.length, type: WidthType.PERCENTAGE },
                 borders: {
                    top: { style: BorderStyle.SINGLE, size: 1 },
                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                    left: { style: BorderStyle.SINGLE, size: 1 },
                    right: { style: BorderStyle.SINGLE, size: 1 },
                 }
             }))
         }));
         
         // Add table with some indent to simulate X position
         children.push(new Table({
             rows,
             width: { size: widthTwips, type: WidthType.DXA },
             indent: { size: xTwips, type: WidthType.DXA }
         }));
         children.push(new Paragraph({text: ""})); // Spacer
         continue;
      }

      // 2. Handle Images
      if ([ElementType.IMAGE, ElementType.SIGNATURE, ElementType.STAMP].includes(element.type)) {
          try {
              const b64 = await cropImage(source, element.bbox);
              if (b64) {
                  children.push(new Paragraph({
                      frame: {
                          type: "absolute",
                          position: { x: xTwips, y: yTwips },
                          width: widthTwips,
                          height: 0, // Auto height
                          anchor: {
                              horizontal: FrameAnchorType.PAGE,
                              vertical: FrameAnchorType.PAGE
                          }
                      },
                      children: [
                          new ImageRun({
                              data: b64,
                              transformation: { width: widthTwips / 20, height: (widthTwips / 20) * 0.75 }, // Approx px conv
                              type: "png"
                          })
                      ]
                  }));
              }
          } catch(e) { console.error("Img error", e); }
          continue;
      }

      // 3. Handle Text (Paragraphs, Headings) using FRAMES for Layout Fidelity
      const textRun = new TextRun({
          text: element.content,
          bold: element.style?.bold,
          italics: element.style?.italic,
          size: fontSize,
          color: color,
          font: "Arial"
      });

      children.push(new Paragraph({
          children: [textRun],
          alignment: align,
          frame: {
              type: "absolute",
              position: {
                  x: xTwips,
                  y: yTwips
              },
              width: widthTwips,
              height: 0, // Auto-grow
              anchor: {
                  horizontal: FrameAnchorType.PAGE,
                  vertical: FrameAnchorType.PAGE 
              },
          }
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
          page: {
              margin: { top: 0, right: 0, bottom: 0, left: 0 } // Zero margins because we use absolute positioning
          }
      },
      children: children,
    }],
  });

  const docName = (originalFilename || 'document').replace(/\.[^/.]+$/, "") + ".docx";
  const blob = await Packer.toBlob(doc);
  saveAs(blob, docName);
};