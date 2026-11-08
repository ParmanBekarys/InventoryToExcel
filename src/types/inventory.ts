/** The exact Inventory worksheet columns, in order (A–J). Never rename these. */
export const INVENTORY_COLUMNS = [
  'ID',
  'NAME',
  'CATEGORY',
  'QUANTITY',
  'LOCATION',
  'DESCRIPTION',
  'PHOTO',
  'ADDED_BY',
  'CREATED_DATE',
  'UPDATED_DATE',
] as const;

export type InventoryColumn = (typeof INVENTORY_COLUMNS)[number];

export const SHEET_NAMES = {
  inventory: 'Inventory',
  categories: 'Categories',
  locations: 'Locations',
  instructions: 'Instructions',
} as const;

export type ImageExt = 'png' | 'jpeg' | 'gif';

/** A photo held only in browser memory. */
export interface Photo {
  /** Unique per photo; changes when a photo is replaced. */
  key: string;
  bytes: Uint8Array;
  ext: ImageExt;
  mime: string;
  /** Object URL for display (memory only, revoked when no longer needed). */
  url: string;
  width?: number;
  height?: number;
  origin: 'workbook' | 'new';
}

export interface InventoryItem {
  /** Internal key, never written to Excel. Lets us handle duplicate/empty IDs safely. */
  uid: string;
  id: string;
  name: string;
  category: string;
  quantity: number;
  location: string;
  description: string;
  photo: Photo | null;
  /** Text that was in the PHOTO cell (e.g. an old link) — kept if there is no embedded image. */
  photoText: string;
  addedBy: string;
  /** Wall-clock "YYYY-MM-DD HH:mm" (or the original text if it was not a date). */
  createdDate: string;
  updatedDate: string;
  /** Values of any extra columns found after column J, keyed by header. Preserved on export. */
  extra: Record<string, string | number>;
  /** Row number in the uploaded workbook (for messages). */
  sourceRow?: number;
}

export type ItemDraft = Omit<InventoryItem, 'uid' | 'extra' | 'sourceRow'>;

export type IssueLevel = 'info' | 'warning' | 'error';

export interface ImportIssue {
  level: IssueLevel;
  message: string;
}

export interface ImportReport {
  fileName: string;
  fileSize: number;
  importedAt: string;
  itemCount: number;
  photoCount: number;
  issues: ImportIssue[];
}

export interface ListSheetInfo {
  /** Header text in A1 of the Categories / Locations sheet. */
  header: string;
}

/** Data about the source workbook needed to rebuild it on export. */
export interface WorkbookContext {
  /** Original sheet names in their original order. */
  sheetOrder: string[];
  /** The raw uploaded file. Never modified; used to copy unmanaged sheets (e.g. Instructions). */
  originalBuffer: ArrayBuffer | null;
  categoriesHeader: string;
  locationsHeader: string;
  /** Extra Inventory column headers found after column J. */
  extraColumns: string[];
}

export interface ActivityEntry {
  at: string;
  kind: 'add' | 'edit' | 'delete' | 'category' | 'location' | 'export' | 'import';
  text: string;
}
