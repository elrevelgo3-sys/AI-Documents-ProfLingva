import { StructuredDocument } from '../types';

const PROXY_URL = '/api/proxy';

// JSON Schema definition for Document Structure
const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    elements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { 
            type: "string", 
            enum: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'table', 'image', 'signature', 'stamp', 'header', 'footer', 'list_item'] 
          },
          content: { type: "string" },
          style: {
            type: "object",
            properties: {
              font_name: { type: "string" },
              font_size: { type: "number" },
              bold: { type: "boolean" },
              italic: { type: "boolean" },
              color: { type: "string" },
              alignment: { type: "string", enum: ['left', 'center', 'right', 'justify'] }
            },
            required: ['font_size', 'bold', 'italic', 'color', 'alignment']
          },
          data: {
            type: "object",
            properties: {
              rows: { type: "array", items: { type: "array", items: { type: "string" } } }
            }
          },
          bbox: {
            type: "array",
            items: { type: "number" },
            description: "[ymin, xmin, ymax, xmax] coordinates normalized to 0-1000 scale"
          }
        },
        required: ['id', 'type', 'content', 'style', 'bbox']
      }
    }
  },
  required: ['elements']
};

export const analyzeDocument = async (fileOrBlob: File | Blob): Promise<StructuredDocument> => {
  const base64Data = await fileToGenerativePart(fileOrBlob);
  const mimeType = fileOrBlob.type || 'image/png';
  
  const systemPrompt = `You are an advanced document digitization AI. 
  Analyze the provided image and extract its structure.
  
  INSTRUCTIONS:
  1. Identify all text elements (paragraphs, headings, lists).
  2. VISUALS: Detect all Logos, Photos, Signatures, and Stamps. Classify them exactly as 'image', 'signature', or 'stamp'.
  3. COORDINATES: For every element, provide a precise bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale. 
     - For 'signature' and 'stamp', the bbox must be tight around the ink.
  4. STYLES: Estimate font name, size (pt), boldness, italics, and text color.
  5. TABLES: Extract full table data into the 'data.rows' property.

  Output must be valid JSON adhering to this schema:
  ${JSON.stringify(DOCUMENT_SCHEMA, null, 2)}
  `;

  const payload = {
    model: "google/gemini-2.0-flash-001", // Using Gemini 2.0 Flash via OpenRouter for best speed/accuracy balance
    messages: [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: [
          { type: "text", text: "Analyze this document and return the structural JSON." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data.data}` } }
        ]
      }
    ],
    response_format: { type: "json_object" }
  };

  const data = await callOpenRouter(payload);
  
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty content");
  
  try {
    return JSON.parse(content) as StructuredDocument;
  } catch (e) {
    console.error("Failed to parse JSON response", content);
    throw new Error("Invalid JSON response from AI");
  }
};

export const translateText = async (text: string, sourceLang: string, targetLang: string): Promise<string> => {
  const systemPrompt = `You are a professional translator for an enterprise translation bureau.
  Translate the user's text from ${sourceLang} to ${targetLang}.
  
  Rules:
  1. Maintain professional tone and industry-standard terminology.
  2. Preserve original formatting logic.
  3. Return ONLY the translated text, no conversational filler.`;

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
  // Use the local proxy which adds the key and forwards to OpenRouter
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    // Try to parse error as JSON if possible
    try {
        const errJson = JSON.parse(errText);
        throw new Error(errJson.error || `API Error ${response.status}`);
    } catch {
        throw new Error(`API Error ${response.status}: ${errText}`);
    }
  }

  return response.json();
}

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
