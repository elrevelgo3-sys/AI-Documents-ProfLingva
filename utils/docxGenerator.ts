
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, ImageRun, WidthType, BorderStyle, PageBreak, Footer, Header, PageNumber, TableLayoutType } from 'docx';
import saveAs from 'file-saver';
import { StructuredDocument, ElementType } from '../types';

/**
 * Crops an image from the source file based on Gemini 0-1000 normalized coordinates.
 * Adds padding to ensure the full element is captured.
 */
export async function cropImageFromSource(sourceBlob: Blob, bbox: number[]): Promise<{ dataUrl: string, width: number, height: number, originalPageWidth: number } | null> {
  if (!bbox || bbox.length !== 4) return null;
  
  return new Promise((resolve) => {
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      
      let [c1, c2, c3, c4] = bbox;
      
      // Safety check for weird coordinates from Gemini Flash
      let ymin = Math.min(c1, c3);
      let xmin = Math.min(c2, c4);
      let ymax = Math.max(c1, c3);
      let xmax = Math.max(c2, c4);
      
      // If box is invalid/too small, assume full page width fallback or skip
      if (xmax - xmin < 10 || ymax - ymin < 10) {
           URL.revokeObjectURL(sourceUrl);
           resolve(null);
           return;
      }

      const padding = 10; 
      ymin = Math.max(0, ymin - padding);
      xmin = Math.max(0, xmin - padding);
      ymax = Math.min(1000, ymax + padding);
      xmax = Math.min(1000, xmax + padding);
      
      const realX = (xmin / 1000) * img.width;
      const realY = (ymin / 1000) * img.height;
      const realW = ((xmax - xmin) / 1000) * img.width;
      const realH = ((ymax - ymin) / 1000) * img.height;
      
      canvas.width = realW;
      canvas.height = realH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(sourceUrl);
        resolve(null);
        return;
      }
      
      // White background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, realW, realH);
      
      ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
      
      const dataUrl = canvas.toDataURL('image/png');
      URL.revokeObjectURL(sourceUrl); 
      
      resolve({
        dataUrl: dataUrl,
        width: realW,
        height: realH,
        originalPageWidth: img.width
      });
    };

    img.onerror = () => {
        URL.revokeObjectURL(sourceUrl);
        resolve(null);
    };

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

  for (let i = 0; i < sortedPages.length; i++) {
    const page = sortedPages[i];
    const { data, source } = page;

    if (i > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    if (!data.elements) continue;

    for (const element of data.elements) {
      const alignmentMap = {
        'left': AlignmentType.LEFT,
        'center': AlignmentType.CENTER,
        'right': AlignmentType.RIGHT,
        'justify': AlignmentType.JUSTIFIED,
      };
      
      const align = alignmentMap[element.style?.alignment] || AlignmentType.LEFT;
      
      // FORCE BLACK COLOR LOGIC
      // Gemini Flash often hallucinates white color or transparent. We force black unless it's distinctly red/blue.
      let colorRaw = (element.style?.color || '000000').toLowerCase().replace(/#/g, '');
      
      // If color is white or invalid hex, force black
      if (colorRaw === 'ffffff' || colorRaw === 'fff' || !/^[0-9a-f]{6}$/.test(colorRaw)) {
          colorRaw = '000000';
      }
      
      const size = (element.style?.font_size || 11) * 2; 

      const textRun = new TextRun({
        text: element.content || '',
        bold: element.style?.bold || false,
        italics: element.style?.italic || false,
        color: colorRaw, 
        size: size,
        font: element.style?.font_name || 'Arial', 
      });

      if (element.type === ElementType.TABLE && element.data?.rows) {
        const rows = element.data.rows.map(rowContent => 
          new TableRow({
            children: rowContent.map(cellText => 
              new TableCell({
                children: [new Paragraph({ 
                    children: [new TextRun({ 
                        text: cellText || '', 
                        size: 18, 
                        color: "000000", // Force black in tables
                        font: "Arial"
                    })],
                })],
                width: { size: 100 / rowContent.length, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                }
              })
            )
          })
        );
        
        children.push(new Table({ 
            rows, 
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.AUTOFIT 
        }));
        children.push(new Paragraph({ text: "" })); 
      } 
      else if ((element.type === ElementType.IMAGE || element.type === ElementType.SIGNATURE || element.type === ElementType.STAMP) && source && element.bbox) {
        try {
          const croppedImage = await cropImageFromSource(source, element.bbox);
          
          if (croppedImage) {
              const DOCX_PAGE_WIDTH = 500; 
              const widthRatio = croppedImage.width / croppedImage.originalPageWidth;
              const targetWidth = Math.min(DOCX_PAGE_WIDTH, DOCX_PAGE_WIDTH * widthRatio * 1.2); 
              const aspectRatio = croppedImage.height / croppedImage.width;
              const targetHeight = targetWidth * aspectRatio;

              const cleanBase64 = croppedImage.dataUrl.split(',')[1];

              children.push(new Paragraph({
                  children: [
                      new ImageRun({
                          data: cleanBase64,
                          transformation: { width: targetWidth, height: targetHeight },
                          type: "png"
                      } as any)
                  ],
                  alignment: align,
                  spacing: { before: 100, after: 100 }
              }));
          }
        } catch (e) {
          console.error("Failed to process image element", e);
        }
      }
      else {
        let headingLevel: any;
        if (element.type === ElementType.HEADING_1) headingLevel = HeadingLevel.HEADING_1;
        if (element.type === ElementType.HEADING_2) headingLevel = HeadingLevel.HEADING_2;
        if (element.type === ElementType.HEADING_3) headingLevel = HeadingLevel.HEADING_3;

        children.push(new Paragraph({
          children: [textRun],
          heading: headingLevel,
          alignment: align,
          spacing: { after: 120, line: 276 }
        }));
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
      headers: {
         default: new Header({ children: [] })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Page ", color: "999999", size: 18, font: "Arial" }),
                new TextRun({ children: [PageNumber.CURRENT], color: "999999", size: 18, font: "Arial" }),
                new TextRun({ text: " of ", color: "999999", size: 18, font: "Arial" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "999999", size: 18, font: "Arial" }),
              ],
            }),
          ],
        }),
      },
    }],
  });

  const docName = (originalFilename || 'document').replace(/\.[^/.]+$/, "") + ".docx";
  const blob = await Packer.toBlob(doc);
  saveAs(blob, docName);
};
