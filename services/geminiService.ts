import { GoogleGenAI, Type } from '@google/genai';
import { StructuredDocument } from '../types';

const getClient = () => {
  // Используем import.meta.env вместо process.env
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 'dummy_key_for_proxy';
  
  // Прокси по умолчанию для работы из РФ
  const defaultProxy = '/api/proxy';
  const userProxy = localStorage.getItem('gemini_proxy_url');
  const baseUrl = userProxy || defaultProxy;

  return new GoogleGenAI({
    apiKey: apiKey,
    baseUrl: baseUrl
  });
};

const docSchema = {
  type: Type.OBJECT,
  properties: {
    elements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'table', 'image', 'signature', 'stamp', 'header', 'footer', 'list_item']
          },
          content: { type: Type.STRING },
          style: {
            type: Type.OBJECT,
            properties: {
              font_name: { type: Type.STRING },
              font_size: { type: Type.NUMBER },
              bold: { type: Type.BOOLEAN },
              italic: { type: Type.BOOLEAN },
              color: { type: Type.STRING },
              alignment: { type: Type.STRING }
            }
          },
          data: {
            type: Type.OBJECT,
            properties: {
              rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
            },
          },
          bbox: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        },
        required: ['id', 'type', 'content']
      },
    },
  },
  required: ['elements']
};

const docPrompt = `Analyze this document image and output structured JSON.
- Identify headings, paragraphs, tables, and list items.
- VISUALS: Identify ALL Logos, Diagrams, Charts, Photos, Stamps, and Signatures. Classify Logos/Diagrams/Charts as 'image'.
- FORMULAS: Identify complex mathematical formulas. Classify them as 'image'.
- BOUNDING BOXES: Be extremely precise.
- STYLES: Extract font name, size, bold, italic, and color.
- Return bounding boxes in normalized 0-1000 scale [ymin, xmin, ymax, xmax].
- Extract all table data into data.rows.
- Do not translate content.
`;

export const analyzeDocument = async (fileOrBlob: File | Blob): Promise<StructuredDocument> => {
  try {
    const ai = getClient();
    const base64Data = await fileToGenerativePart(fileOrBlob);

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: {
        parts: [
          { inlineData: base64Data },
          { text: docPrompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: docSchema,
      },
    });

    const text = response.text();
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as StructuredDocument;
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const translateText = async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
  try {
    const ai = getClient();
    const systemInstruction = `Translate from ${sourceLang} to ${targetLang}. Maintain formatting. Return ONLY translation.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: { parts: [{ text: text }] },
      config: { systemInstruction, temperature: 0.3 },
    });

    return response.text() || "";
  } catch (error) {
    console.error("Translation Failed:", error);
    return text;
  }
};

async function fileToGenerativePart(file: File | Blob): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ data: base64, mimeType: file.type || 'image/png' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
