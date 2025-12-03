
// --- Document Analysis Types ---

export enum ElementType {
  PARAGRAPH = 'paragraph',
  HEADING_1 = 'heading_1',
  HEADING_2 = 'heading_2',
  HEADING_3 = 'heading_3',
  TABLE = 'table',
  IMAGE = 'image',
  SIGNATURE = 'signature',
  STAMP = 'stamp',
  HEADER = 'header',
  FOOTER = 'footer',
  LIST_ITEM = 'list_item'
}

export interface ElementStyle {
  font_name?: string;
  font_size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  alignment: 'left' | 'center' | 'right' | 'justify';
}

export interface DocElement {
  id: string;
  type: ElementType;
  content: string;
  style: ElementStyle;
  data?: {
    rows: string[][];
  };
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] standard gemini
}

export interface StructuredDocument {
  elements: DocElement[];
}

// --- App State Types ---

export enum AppMode {
  DOCUMENT = 'document',
  NATIVE = 'native',
  TRANSLATE = 'translate',
  GAME = 'game',
}