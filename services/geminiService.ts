
import { StructuredDocument, DocElement, ElementType } from '../types';

// SWITCHED TO OPENAI GPT-4o-MINI AS REQUESTED.
// It is reliable, cheap (almost free), supports vision perfectly, and has no geo-blocking issues via OpenRouter.
const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const TRANSLATION_MODEL = "openai/gpt-4o-mini";

/**
 * Helper to call the internal proxy which forwards to OpenRouter.
 * This prevents CORS issues and Geo-blocking.
 */
async function callOpenRouter(messages: any[], model: string = OPENROUTER_MODEL, jsonMode: boolean = false): Promise<string> {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            // GPT-4o supports json_object response format
            response_format: jsonMode ? { type: "json_object" } : undefined
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter Proxy Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

/**
 * Tries to repair a truncated JSON string.
 */
function repairJson(jsonStr: string): string {
    let repaired = jsonStr.trim();
    if (repaired.endsWith(']}')) return repaired;
    const stack = [];
    for (const char of repaired) {
        if (char === '{') stack.push('}');
        if (char === '[') stack.push(']');
        if (char === '}' || char === ']') {
            const last = stack[stack.length - 1];
            if (last === char) stack.pop();
        }
    }
    if (!['}', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'e', 'l', 's', '"'].includes(repaired.slice(-1))) {
         repaired += '"'; 
    }
    while (stack.length > 0) {
        repaired += stack.pop();
    }
    return repaired;
}

export const analyzeBatch = async (images: Blob[]): Promise<StructuredDocument[]> => {
  const base64Images = await Promise.all(images.map(img => optimizeImageForAI(img)));
  
  const systemPrompt = `You are a Layout-Preserving PDF Digitizer.
  TASK: Convert the image into a Minified JSON Structure.
  OUTPUT FORMAT: JSON Object with key "e" (elements), containing an ARRAY of arrays: [TYPE, CONTENT, BBOX, STYLE].
  TYPES: "p", "h1", "h2", "tbl", "img".
  RULES:
  1. Accurate BBOX [ymin, xmin, ymax, xmax] (0-1000) is required.
  2. Tables ("tbl"): CONTENT is a string "TABLE_PLACEHOLDER".
  3. Performance: Use array format to save tokens.
  `;

  // Construct standard OpenAI-compatible message format
  const contentArray: any[] = [
      { type: "text", text: "Digitize these pages." }
  ];

  base64Images.forEach(b64 => {
      contentArray.push({
          type: "image_url",
          image_url: {
              url: `data:image/jpeg;base64,${b64}`
          }
      });
  });

  const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: contentArray }
  ];

  const content = await callOpenRouter(messages, OPENROUTER_MODEL, true);
  
  const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsed: any;
  try {
      parsed = JSON.parse(cleanContent);
  } catch (e) {
      const fixed = repairJson(cleanContent);
      try { parsed = JSON.parse(fixed); } catch (e2) { throw new Error("Layout complex, try fewer pages."); }
  }

  const results: StructuredDocument[] = [];
  const rawElements = parsed.e || parsed.elements || [];

  const docElements: DocElement[] = rawElements.map((item: any) => {
      const [rawType, rawContent, rawBbox, rawStyle] = item;
      let type = rawType as ElementType;
      // Normalization
      if (rawType === 'paragraph') type = ElementType.PARAGRAPH;
      if (rawType === 'table') type = ElementType.TABLE;
      if (rawType === 'image') type = ElementType.IMAGE;

      return {
          id: Math.random().toString(36).substr(2, 9),
          type: type,
          content: rawContent || '',
          bbox: (Array.isArray(rawBbox) && rawBbox.length === 4 ? rawBbox : [0,0,0,0]) as [number, number, number, number],
          style: {
              bold: !!rawStyle?.b,
              italic: !!rawStyle?.i,
              font_size: rawStyle?.sz || 11,
              color: rawStyle?.c || '#000000',
              alignment: rawStyle?.a === 'c' ? 'center' : rawStyle?.a === 'r' ? 'right' : rawStyle?.a === 'j' ? 'justify' : 'left'
          }
      };
  });

  results.push({ elements: docElements });
  return results;
};

export const analyzeDocument = async (fileOrBlob: File | Blob): Promise<StructuredDocument> => {
    const results = await analyzeBatch([fileOrBlob]);
    return results[0];
};

export interface TableExtractionResult {
    html: string;
    rows: string[][];
}

function parseHtmlToRows(html: string): string[][] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return [];

    const rows: string[][] = [];
    const trs = table.querySelectorAll('tr');
    
    trs.forEach(tr => {
        const rowData: string[] = [];
        const cells = tr.querySelectorAll('td, th');
        cells.forEach(cell => {
            rowData.push(cell.textContent?.trim() || '');
        });
        rows.push(rowData);
    });

    return rows;
}

export const extractTableFromImage = async (imageBlob: Blob): Promise<TableExtractionResult> => {
    const b64 = await optimizeImageForAI(imageBlob);
    
    // UPDATED PROMPT: Force LEGACY HTML attributes.
    // MS Word/Excel paste works BEST with <table border="1"> not css borders.
    const systemPrompt = `You are a Table Extraction Specialist.
    
    TASK: Output RAW HTML code for the table in the image.
    
    RULES:
    1. **LEGACY FORMAT**: Use old-school HTML attributes which are best for MS Word copy-paste.
       - Start with: <table border="1" cellspacing="0" cellpadding="5" width="100%">
       - Use 'colspan' and 'rowspan' correctly for merged headers.
       - Do NOT rely on <style> tags for borders. Use the 'border' attribute on the table.
    2. **CONTENT**: Copy text exactly. 
    3. **CLEAN OUTPUT**: Return ONLY the HTML string. No markdown code blocks. No JSON.
    
    Input: Image.
    Output: HTML.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { 
            role: "user", 
            content: [
                { type: "text", text: "Extract table to HTML." },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${b64}`
                    }
                }
            ]
        }
    ];

    let html = await callOpenRouter(messages);
    
    html = html.replace(/```html/g, '').replace(/```/g, '').trim();
    
    const tableStart = html.indexOf('<table');
    const tableEnd = html.lastIndexOf('</table>');
    if (tableStart !== -1 && tableEnd !== -1) {
        html = html.substring(tableStart, tableEnd + 8);
    }

    if (!html.includes('<table')) {
        throw new Error("No table detected");
    }

    const rows = parseHtmlToRows(html);

    return { html, rows };
};

export const translateText = async (text: string, options: any): Promise<string> => {
  let glossaryInstruction = "";
  if (options.glossary && options.glossary.length > 0) {
      glossaryInstruction = `GLOSSARY:\n${options.glossary.map((g: any) => `${g.term}=${g.translation}`).join('\n')}`;
  }

  const systemPrompt = `Translate from ${options.sourceLang || 'auto'} to ${options.targetLang}. 
  Domain: ${options.domain || 'General'}. 
  Tone: ${options.tone || 'Professional'}. 
  ${glossaryInstruction}. 
  Return only the translation, no explanations.`;

  const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
  ];

  return await callOpenRouter(messages, TRANSLATION_MODEL);
};

export async function optimizeImageForAI(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 2048; 

        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = width / height;
          if (width > height) {
            width = MAX_DIM;
            height = Math.round(MAX_DIM / ratio);
          } else {
            height = MAX_DIM;
            width = Math.round(MAX_DIM * ratio);
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("No context")); return; }
        
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0,0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Returns base64 string WITHOUT data:image/jpeg;base64, prefix
        resolve(canvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
