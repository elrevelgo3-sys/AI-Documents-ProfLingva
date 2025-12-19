
// --- Document Analysis Types ---

export enum ElementType {
  PARAGRAPH = 'p',      // Shortened for token efficiency
  HEADING_1 = 'h1',
  HEADING_2 = 'h2',
  HEADING_3 = 'h3',
  TABLE = 'tbl',
  IMAGE = 'img',
  SIGNATURE = 'sig',
  STAMP = 'stmp',
  LIST_ITEM = 'li',
  HEADER = 'hdr',
  FOOTER = 'ftr'
}

export interface ElementStyle {
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string; // hex
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

export interface DocElement {
  id: string;
  type: ElementType;
  content: string; // The text content
  style?: ElementStyle;
  data?: {
    rows: string[][];
  };
  // BBOX IS BACK AND MANDATORY
  // [ymin, xmin, ymax, xmax] in 0-1000 coordinate space
  bbox: [number, number, number, number]; 
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
  TABLE_ANALYZER = 'table_analyzer',
}
