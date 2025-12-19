
import saveAs from 'file-saver';

// Supported languages for ConvertAPI OCR
export const OCR_LANGUAGES = [
  { code: 'english', name: 'English' },
  { code: 'russian', name: 'Russian' },
  { code: 'german', name: 'German' },
  { code: 'french', name: 'French' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'italian', name: 'Italian' },
  { code: 'chinese', name: 'Chinese' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'arabic', name: 'Arabic' },
  { code: 'portuguese', name: 'Portuguese' },
  { code: 'turkish', name: 'Turkish' },
  { code: 'ukrainian', name: 'Ukrainian' },
  { code: 'korean', name: 'Korean' },
  { code: 'armenian', name: 'Armenian' },
];

interface ConvertOptions {
  enableOcr: boolean;
  language?: string;
  onProgress?: (progress: number) => void;
}

/**
 * Orchestrates the conversion process using ConvertAPI.
 * Uses direct upload to bypass serverless payload limits.
 */
export const convertPdfToDocx = async (file: File, options: ConvertOptions): Promise<void> => {
  // STRICT PRIORITY: Environment Variable only.
  const secret = process.env.CONVERT_API_SECRET;

  if (!secret) {
    throw new Error("Configuration Error: API Key is missing. Please add CONVERT_API_SECRET to your environment variables.");
  }

  // endpoint for PDF to DOCX
  const url = new URL('https://v2.convertapi.com/convert/pdf/to/docx');
  
  // Append Secret directly to URL for authentication
  url.searchParams.append('Secret', secret);
  
  // Set output format to download directly
  url.searchParams.append('download', 'attachment'); 

  const formData = new FormData();
  formData.append('File', file);
  
  // CRITICAL CONFIGURATION FOR CONVERT API
  if (options.enableOcr) {
    formData.append('Ocr', 'true');
    // Using high fidelity engine if available in plan, otherwise defaults
    if (options.language) {
      formData.append('Language', options.language);
    }
  } else {
    formData.append('Ocr', 'false'); // Force native extraction
    formData.append('Snapshots', 'true'); // Ensures visual fidelity for tricky layouts
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('POST', url.toString());

    // Progress monitoring
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        const percentComplete = (event.loaded / event.total) * 100;
        // Upload is only part of the process. We scale it to 50%, rest is "Processing"
        options.onProgress(Math.round(percentComplete * 0.5));
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        if (options.onProgress) options.onProgress(100);
        
        // The response is the binary file blob because we used `download=attachment`
        const blob = xhr.response;
        
        // Extract filename from content-disposition if possible, else derive from source
        const contentDisposition = xhr.getResponseHeader('Content-Disposition');
        let fileName = file.name.replace(/\.pdf$/i, '') + '.docx';
        
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) fileName = match[1];
        }

        saveAs(blob, fileName);
        resolve();
      } else {
        // Try to parse error message
        let errorMessage = 'Conversion failed';
        try {
            // Convert blob back to text to read JSON error
            const text = await blobToText(xhr.response);
            const errObj = JSON.parse(text);
            errorMessage = errObj.Message || errorMessage;
        } catch (e) {
            errorMessage = `HTTP Error ${xhr.status}`;
        }
        reject(new Error(errorMessage));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection failed during upload."));
    };

    xhr.responseType = 'blob'; // Important: Expect a file back
    xhr.send(formData);
  });
};

// Helper to read blob error responses
const blobToText = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
};
