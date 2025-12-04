import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, ImageRun, WidthType, BorderStyle, PageBreak, Footer, Header, PageNumber } from 'docx';
import saveAs from 'file-saver';
import { StructuredDocument, ElementType } from '../types';

/**
 * Crops an image from the source file based on Gemini 0-1000 normalized coordinates.
 * Adds padding to ensure the full element is captured.
 */
async function cropImageFromSource(sourceBlob: Blob, bbox: number[]): Promise<{ dataUrl: string, width: number, height: number, originalPageWidth: number } | null> {
  if (!bbox || bbox.length !== 4) return null;
  
  return new Promise((resolve) => {
    // Create a temporary URL for the source blob
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Gemini bbox: [ymin, xmin, ymax, xmax]
      let [ymin, xmin, ymax, xmax] = bbox;

      // Add 1.5% padding to the bounding box to prevent cutting off edges
      const padding = 15; // 15/1000 = 1.5%
      ymin = Math.max(0, ymin - padding);
      xmin = Math.max(0, xmin - padding);
      ymax = Math.min(1000, ymax + padding);
      xmax = Math.min(1000, xmax + padding);
      
      const realX = (xmin / 1000) * img.width;
      const realY = (ymin / 1000) * img.height;
      const realW = ((xmax - xmin) / 1000) * img.width;
      const realH = ((ymax - ymin) / 1000) * img.height;
      
      if (realW <= 0 || realH <= 0) {
          URL.revokeObjectURL(sourceUrl); // Cleanup
          resolve(null);
          return;
      }

      canvas.width = realW;
      canvas.height = realH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(sourceUrl); // Cleanup
        resolve(null);
        return;
      }
      
      ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
      
      const dataUrl = canvas.toDataURL('image/png');
      
      // Clean up memory immediately after processing
      URL.revokeObjectURL(sourceUrl); 
      
      resolve({
        dataUrl: dataUrl,
        width: realW,
        height: realH,
        originalPageWidth: img.width
      });
    };

    img.onerror = () => {
        URL.revokeObjectURL(sourceUrl); // Cleanup on error
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

  // Sort pages by number to be safe
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
      // Safe color access
      const colorRaw = element.style?.color || '000000';
      const color = colorRaw.replace('#', '');
      
      const size = (element.style?.font_size || 11) * 2; // DOCX uses half-points. Default to 11pt if missing.

      // Apply robust styling based on Gemini's analysis
      const textRun = new TextRun({
        text: element.content || '',
        bold: element.style?.bold || false,
        italics: element.style?.italic || false,
        color: color !== '000000' ? color : undefined, // Only apply color if not black to save file size/complexity
        size: size,
        font: element.style?.font_name || 'Arial', // Fallback to Arial which is standard
      });

      if (element.type === ElementType.TABLE && element.data?.rows) {
        const rows = element.data.rows.map(rowContent => 
          new TableRow({
            children: rowContent.map(cellText => 
              new TableCell({
                children: [new Paragraph({ 
                    children: [new TextRun({ text: cellText || '', size: 20 })], // Default table font 10pt
                })],
                width: { size: 100 / rowContent.length, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                }
              })
            )
          })
        );
        children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        children.push(new Paragraph({ text: "" })); // Spacer
      } 
      else if ((element.type === ElementType.IMAGE || element.type === ElementType.SIGNATURE || element.type === ElementType.STAMP) && source && element.bbox) {
        // Attempt to crop the image
        try {
          const croppedImage = await cropImageFromSource(source, element.bbox);
          
          if (croppedImage) {
              // Calculate proportional size for DOCX
              // Standard A4 printable width is approx 480-500pt (with margins)
              const DOCX_PAGE_WIDTH = 500; 
              
              // Calculate what percentage of the original page width this image occupied
              const widthRatio = croppedImage.width / croppedImage.originalPageWidth;
              const targetWidth = Math.min(DOCX_PAGE_WIDTH, DOCX_PAGE_WIDTH * widthRatio * 1.2); // 1.2 boost for readability
              const aspectRatio = croppedImage.height / croppedImage.width;
              const targetHeight = targetWidth * aspectRatio;

              // DOCX library expects pure base64 string, not data URI
              const cleanBase64 = croppedImage.dataUrl.split(',')[1];

              children.push(new Paragraph({
                  children: [
                      new ImageRun({
                          data: cleanBase64,
                          transformation: { width: targetWidth, height: targetHeight },
                          type: "png"
                      } as any) // Type cast to avoid TS errors in some versions
                  ],
                  alignment: align,
                  spacing: { before: 100, after: 100 }
              }));
          } else {
              children.push(new Paragraph({
                  children: [
                      new TextRun({ text: `[${element.type}]`, italics: true, color: "888888" })
                  ],
                  alignment: align
              }));
          }
        } catch (e) {
          console.error("Failed to process image element", e);
        }
      }
      else {
        // Text based elements
        let headingLevel: any; // Using any to avoid strict enum mismatches
        if (element.type === ElementType.HEADING_1) headingLevel = HeadingLevel.HEADING_1;
        if (element.type === ElementType.HEADING_2) headingLevel = HeadingLevel.HEADING_2;
        if (element.type === ElementType.HEADING_3) headingLevel = HeadingLevel.HEADING_3;

        children.push(new Paragraph({
          children: [textRun],
          heading: headingLevel,
          alignment: align,
          spacing: { after: 120, line: 276 } // 1.15 line spacing (240 * 1.15)
        }));
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
      headers: {
         default: new Header({
             children: []
         })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Page ",
                  color: "999999",
                  size: 18,
                  font: "Arial"
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  color: "999999",
                  size: 18,
                  font: "Arial"
                }),
                new TextRun({
                  text: " of ",
                  color: "999999",
                  size: 18,
                  font: "Arial"
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  color: "999999",
                  size: 18,
                  font: "Arial"
                }),
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