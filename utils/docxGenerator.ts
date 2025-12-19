
import { StructuredDocument } from '../types';

export interface PageResult {
  data: StructuredDocument;
  source: Blob;
  pageNumber: number;
}

// Generator disabled per user request to fix build errors.
export const downloadDocx = async (pages: PageResult[], originalFilename: string) => {
  console.warn("DOCX Generator is currently disabled.");
  alert("DOCX Export is disabled in this version.");
  return;
};
