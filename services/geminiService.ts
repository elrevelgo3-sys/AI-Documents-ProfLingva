import { GoogleGenAI, Type } from '@google/genai';
import { StructuredDocument } from '../types';

// Helper to safely get Client instance
const getClient = () => {
  let proxyUrl: string | null = null;
  let apiKey = '';

  if (typeof window !== 'undefined') {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isLocalhost) {
      proxyUrl = '/api/proxy'; // как у тебя сейчас
      console.log('Production mode: Enforcing /api/proxy');
    } else {
      proxyUrl = localStorage.getItem('gemini_proxy_url');
    }
  }

  if (proxyUrl) {
    apiKey = 'dummy_key_for_proxy';
  } else {
    try {
      // @ts-ignore
      apiKey = process.env.API_KEY || '';
    } catch (e) {}
  }

  if (!apiKey) {
    console.warn('CRITICAL: No API Key found and no Proxy configured.');
    apiKey = 'MISSING_KEY';
  }

  const config: any = { apiKey };

  if (proxyUrl) {
    const baseUrl = proxyUrl.startsWith('http')
      ? proxyUrl
      : (typeof window !== 'undefined'
          ? window.location.origin + proxyUrl
          : proxyUrl);

    config.httpOptions = {
      baseUrl,            // ВАЖНО: именно тут
    };
  }

  return new GoogleGenAI(config);
};


// --- Document Analysis (Upgraded to Gemini 3 Pro for better structure) ---

const docSchema = {
  type: Type.OBJECT,
  properties: {
    elements: {
      type: Type.ARRAY,
      description: "The array of all structural elements found in the document.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "A unique identifier for the element." },
          type: { 
            type: Type.STRING, 
            description: "Semantic type of the element.",
            enum: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'table', 'image', 'signature', 'stamp', 'header', 'footer', 'list_item']
          },
          content: { type: Type.STRING, description: "Text content, a description of the image, or text from a stamp." },
          style: {
            type: Type.OBJECT,
            properties: {
              font_name: { type: Type.STRING, description: "Font name, e.g., 'Arial'." },
              font_size: { type: Type.NUMBER, description: "Font size in points." },
              bold: { type: Type.BOOLEAN },
              italic: { type: Type.BOOLEAN },
              color: { type: Type.STRING, description: "Color in HEX format, e.g., '#000000'." },
              alignment: { type: Type.STRING, enum: ['left', 'center', 'right', 'justify'] }
            },
            required: ['font_size', 'bold', 'italic', 'color', 'alignment']
          },
          data: {
            type: Type.OBJECT,
            description: "Additional data for specific types like tables.",
            properties: {
              rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
            }
          },
          bbox: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "Bounding box coordinates normalized [0-1000] format: [ymin, xmin, ymax, xmax]."
          }
        },
        required: ['id', 'type', 'content', 'style', 'bbox']
      }
    }
  },
  required: ['elements']
};

const docPrompt = `Analyze this document image and output structured JSON.
- Identify headings, paragraphs, tables, and list items.
- VISUALS: Identify ALL Logos, Diagrams, Charts, Photos, Stamps, and Signatures. Classify Logos/Diagrams/Charts as 'image'.
- FORMULAS: Identify complex mathematical formulas. Classify them as 'image' to preserve exact rendering and prevent OCR errors.
- BOUNDING BOXES: Be extremely precise. For images/logos/stamps/formulas, ensure the bbox covers the ENTIRE visual element including borders, but does not include surrounding text.
- STYLES: Carefully extract font name, size, bold, italic, and color.
- Return bounding boxes in normalized 0-1000 scale [ymin, xmin, ymax, xmax].
- Extract all table data into data.rows.
- Do not translate content.
`;

export const analyzeDocument = async (fileOrBlob: File | Blob): Promise<StructuredDocument> => {
  const ai = getClient();
  const base64Data = await fileToGenerativePart(fileOrBlob);
  
  // Using gemini-2.5-flash as it is reliable for coordinates. 
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: base64Data },
        { text: docPrompt }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: docSchema,
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text) as StructuredDocument;
};


// --- Translation Service ---

export const translateText = async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
  const ai = getClient();
  
  const systemInstruction = `You are a professional translator working for a high-end translation bureau. 
  Your task is to translate the provided text from ${sourceLang} to ${targetLang}.
  
  Rules:
  1. Maintain the original tone, nuance, and formatting.
  2. If the text contains technical terms, use the industry-standard terminology for the target language.
  3. Do not add conversational filler. Return ONLY the translated text.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [{ text: text }]
    },
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.3, 
    }
  });

  return response.text || "";
};

// --- Helpers ---

async function fileToGenerativePart(file: File | Blob): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({
        data: base64,
        mimeType: file.type || 'image/png' 
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
