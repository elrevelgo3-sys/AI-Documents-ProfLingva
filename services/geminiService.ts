import { StructuredDocument, DocElement, ElementType } from '../types';

const PROXY_URL = '/api/proxy';

/**
 * Tries to repair a truncated JSON string by closing open brackets/braces.
 * This is crucial for large pages where LLM might hit max output tokens.
 */
function repairJson(jsonStr: string): string {
    let repaired = jsonStr.trim();
    // If it doesn't end with required closers, try to append them
    // We expect the root to be an object { "e": [...] }
    
    // Check if it ends with "]}"
    if (repaired.endsWith(']}')) return repaired;

    // Simple heuristic stack repair
    const stack = [];
    for (const char of repaired) {
        if (char === '{') stack.push('}');
        if (char === '[') stack.push(']');
        if (char === '}' || char === ']') {
            const last = stack[stack.length - 1];
            if (last === char) stack.pop();
        }
    }
    
    // Attempt to close quote if last char is not a closer or structure
    if (!['}', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'e', 'l', 's', '"'].includes(repaired.slice(-1))) {
         repaired += '"'; 
    }
    
    // Pop stack in reverse to close
    while (stack.length > 0) {
        repaired += stack.pop();
    }
    
    return repaired;
}

export const analyzeBatch = async (images: Blob[]): Promise<StructuredDocument[]> => {
  // 1. Optimize images
  const base64Images = await Promise.all(images.map(img => optimizeImageForAI(img)));

  // MINIFIED PROTOCOL:
  // Instead of verbose objects, we ask for Arrays:
  // [TYPE, CONTENT, [Ymin, Xmin, Ymax, Xmax], {STYLE}]
  // This saves ~60% of tokens, preventing truncation errors while keeping coordinates.
  const systemPrompt = `You are a Layout-Preserving PDF Digitizer.
  
  TASK: Convert the image into a Minified JSON Structure.
  
  OUTPUT FORMAT:
  Return a JSON Object with a single key "e" (elements), containing an ARRAY of arrays.
  Each element array must follow this EXACT order:
  [
     TYPE (string), 
     CONTENT (string/null), 
     BBOX (array of 4 integers 0-1000: [ymin, xmin, ymax, xmax]), 
     STYLE (object/null)
  ]

  TYPES: "p" (para), "h1", "h2", "h3", "tbl" (table), "img" (image/chart), "li" (list), "sig" (signature), "stmp" (stamp).
  
  STYLE OBJECT keys (optional, minimize usage): "b" (bold:1), "i" (italic:1), "sz" (size:pt), "c" (color:hex), "a" (align: l/c/r/j).

  RULES:
  1. **LAYOUT IS HOLY**: accurate BBOX is required for EVERYTHING.
  2. **Tables**: For "tbl", CONTENT is a JSON string of a 2D array "[[r1c1, r1c2], [r2c1...]]".
  3. **Images**: "img" has null CONTENT. BBOX is critical.
  4. **Performance**: Do not use keys like "type" or "content". Use the array format to save tokens.
  
  Example Element: ["p", "Hello world", [10, 50, 20, 200], {"b":1}]`;

  // We process 1 page at a time usually, but this supports batch logic
  const userContent: any[] = [
    { type: "text", text: `Digitize these ${images.length} pages. Use the Minified Array format.` }
  ];

  base64Images.forEach(b64 => {
    userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${b64}` }
    });
  });

  const payload = {
    model: "google/gemini-2.0-flash-001", 
    messages: [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: userContent
      }
    ],
    response_format: { type: "json_object" }
  };

  const data = await callOpenRouter(payload);
  
  let content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();

  // Try parsing. If fails, try repairing.
  let parsed: any;
  try {
      parsed = JSON.parse(content);
  } catch (e) {
      console.warn("JSON invalid, attempting repair...", e);
      const fixed = repairJson(content);
      try {
        parsed = JSON.parse(fixed);
      } catch (e2) {
        console.error("Repair failed. Content:", content);
        throw new Error("Critical: Layout too complex, token limit reached.");
      }
  }

  // De-minify logic: Convert arrays back to StructuredDocument
  const results: StructuredDocument[] = [];
  
  // Handle root object (expected { "e": [...] } or "pages": [...])
  const rawElements = parsed.e || parsed.elements || parsed.pages?.[0]?.elements || [];

  const docElements: DocElement[] = rawElements.map((item: any) => {
      // Item is [TYPE, CONTENT, BBOX, STYLE]
      const [rawType, rawContent, rawBbox, rawStyle] = item;
      
      let type = rawType as ElementType;
      // Fallback for AI hallucinating long names
      if (rawType === 'paragraph') type = ElementType.PARAGRAPH;
      if (rawType === 'table') type = ElementType.TABLE;
      if (rawType === 'image') type = ElementType.IMAGE;

      const element: DocElement = {
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

      // Table parsing
      if (type === ElementType.TABLE && typeof rawContent === 'string') {
          try {
              element.data = { rows: JSON.parse(rawContent) };
              element.content = ''; // Clear string content for table
          } catch(e) {
              // Fallback if AI didn't stringify the array
              if (Array.isArray(rawContent)) element.data = { rows: rawContent };
          }
      }

      return element;
  });

  results.push({ elements: docElements });
  return results;
};

export const analyzeDocument = async (fileOrBlob: File | Blob): Promise<StructuredDocument> => {
    const results = await analyzeBatch([fileOrBlob]);
    return results[0];
};

interface TranslationOptions {
    sourceLang: string;
    targetLang: string;
    domain?: string;
    tone?: string;
    glossary?: { term: string; translation: string }[];
}

export const translateText = async (text: string, options: TranslationOptions): Promise<string> => {
  // Keeping translation logic simple and robust
  const { sourceLang, targetLang, domain = 'General', tone = 'Professional', glossary = [] } = options;

  let glossaryInstruction = "";
  if (glossary.length > 0) {
      glossaryInstruction = `GLOSSARY:\n${glossary.map(g => `${g.term}=${g.translation}`).join('\n')}`;
  }

  const systemPrompt = `Translate from ${sourceLang} to ${targetLang}. Domain: ${domain}. Tone: ${tone}. ${glossaryInstruction}. Return only translation.`;

  const payload = {
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ]
  };

  const data = await callOpenRouter(payload);
  return data.choices?.[0]?.message?.content || "";
};

async function callOpenRouter(body: any) {
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (response.status === 404) {
    throw new Error("Proxy Endpoint Not Found.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText.substring(0, 100)}...`);
  }
  
  return response.json();
}

async function optimizeImageForAI(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1536; 

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("No context")); return; }
        
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0,0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Standard JPEG quality
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}