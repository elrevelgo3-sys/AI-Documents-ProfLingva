
import { StructuredDocument } from '../types';

const PROXY_URL = '/api/proxy';

/**
 * Sends a batch of images (Blobs) to Gemini and gets a structured JSON array back.
 * Optimization: Saves tokens by sending the System Prompt only once for N images.
 */
export const analyzeBatch = async (images: Blob[]): Promise<StructuredDocument[]> => {
  // 1. Optimize all images in parallel
  const base64Images = await Promise.all(images.map(img => optimizeImageForAI(img)));

  const systemPrompt = `You are the "Universal Enterprise Digitizer".
  Your mission is to convert the provided sequential document pages into structured JSON.

  INPUT: A sequence of document page images.
  OUTPUT: A JSON Object containing a single key "pages", which is an ARRAY of page objects.
  
  CRITICAL RULES FOR OCR (Gemini 2.0 Flash Optimization):
  1. **TEXT IS PRIORITY**: Do NOT return large parts of the page as "type": "image". You MUST extract the text as "paragraph", "heading", or "table".
  2. **IMAGES**: Only use "type": "image" for actual photos, logos, or illustrations. DO NOT use it for text blocks.
  3. **TABLES**: If you see a grid, it is a TABLE. Return 'data.rows'.
  4. **COLOR**: Ignore text color unless it is explicitly Red or Blue. Default to "000000" (Black) for everything else. NEVER return "#FFFFFF" (White) text.
  5. **Structure**: 
     - Detect paragraphs.
     - Detect headers (h1-h3).
     - Detect lists.

  FOR EACH PAGE (Image):
  Output valid JSON elements array.
  
  CRITICAL: The "pages" array MUST contain exactly ${images.length} entries.`;

  // 2. Construct Multimodal content array
  const userContent: any[] = [
    { type: "text", text: `Analyze these ${images.length} pages. Extract ALL text. Do not be lazy. Return the JSON structure.` }
  ];

  base64Images.forEach(b64 => {
    userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${b64}` }
    });
  });

  const payload = {
    // SWITCHED TO 2.0 FLASH: Better OCR, high speed, cost-effective.
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
  
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed.pages && Array.isArray(parsed.pages)) {
        return parsed.pages as StructuredDocument[];
    }
    // Fallback if AI forgets to wrap in "pages" key but returns a single object (edge case for batch size 1)
    if (parsed.elements) {
        return [parsed] as StructuredDocument[];
    }
    throw new Error("Invalid structure");
  } catch (e) {
    console.error("Failed to parse JSON batch response", content);
    throw new Error("Invalid JSON response from AI. Batch processing failed.");
  }
};

/**
 * Legacy support for single document (wraps batch)
 */
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
  const { sourceLang, targetLang, domain = 'General', tone = 'Professional', glossary = [] } = options;

  let glossaryInstruction = "";
  if (glossary.length > 0) {
      glossaryInstruction = `
      CRITICAL GLOSSARY INSTRUCTIONS:
      You MUST strictly use the following terminology. Do not translate these terms differently:
      ${glossary.map(g => `- "${g.term}" -> "${g.translation}"`).join('\n')}
      `;
  }

  const systemPrompt = `
  You are a professional linguist and subject-matter expert in the ${domain} field.
  
  TASK: Translate the input text from ${sourceLang} to ${targetLang}.
  
  GUIDELINES:
  1. **Tone**: Maintain a ${tone} tone throughout the text.
  2. **Accuracy**: Prioritize meaning and nuance over literal translation.
  3. **Style**: Ensure natural flow in the target language.
  ${glossaryInstruction}
  
  Return ONLY the translated text. Do not include explanations.
  `;

  const payload = {
    // SWITCHED TO 2.0 FLASH: Excellent multilingual capabilities.
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
    throw new Error("Proxy Endpoint Not Found. If running locally, please ensure the backend proxy is configured or use 'vercel dev'.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText.substring(0, 100)}...`);
  }
  
  return response.json();
}

/**
 * Optimizes an image for AI processing.
 * 1. Resizes if dimension > 1536px (Gemini Flash optimal)
 * 2. Converts to JPEG with 0.7 quality
 * Returns base64 string without prefix.
 */
async function optimizeImageForAI(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1536; // Optimal for Gemini Flash Vision

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
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }
        
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0,0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // Increased quality slightly for text
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = () => reject(new Error("Failed to load image for optimization"));
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
