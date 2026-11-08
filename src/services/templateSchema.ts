import { SHEET_NAMES } from '../types/inventory';

/** Canonical sheet order of Inventory_Template.xlsx. */
export const TEMPLATE_SHEET_ORDER = [
  SHEET_NAMES.inventory,
  SHEET_NAMES.categories,
  SHEET_NAMES.locations,
  SHEET_NAMES.instructions,
];

export const DEFAULT_CATEGORIES_HEADER = 'CATEGORY';
export const DEFAULT_LOCATIONS_HEADER = 'LOCATION';

export const DEFAULT_CATEGORIES = ['Electronics', 'Furniture', 'Office Supplies', 'IT Equipment', 'Tools', 'Kitchen', 'Cleaning', 'Other'];

export const DEFAULT_LOCATIONS = [
  'Building A - Floor 1 - Room 101',
  'Building A - Floor 1 - Room 102',
  'Building A - Floor 2 - Room 201',
  'Building B - Floor 1 - Storage',
  'Main Warehouse',
];

/** Column widths (Excel character units) for the Inventory sheet. */
export const INVENTORY_COLUMN_WIDTHS: Record<string, number> = {
  ID: 12,
  NAME: 28,
  CATEGORY: 18,
  QUANTITY: 12,
  LOCATION: 32,
  DESCRIPTION: 42,
  PHOTO: 20,
  ADDED_BY: 18,
  CREATED_DATE: 18,
  UPDATED_DATE: 18,
};

export const PHOTO_ROW_HEIGHT_PT = 90;
export const PLAIN_ROW_HEIGHT_PT = 30;

/** Used only when the uploaded workbook has no Instructions sheet (or for a blank template). */
export const DEFAULT_INSTRUCTIONS: string[][] = [
  ['INVENTORY MANAGER — INSTRUCTIONS'],
  [''],
  ['How to use this workbook'],
  ['1. Open the Inventory Manager website and upload this Excel file.'],
  ['2. Add, edit or delete items, categories and locations in the website.'],
  ['3. Click "Download Updated Excel". The downloaded file contains all changes and photos.'],
  ['4. Share the downloaded file with the next person. It is now the latest version.'],
  [''],
  ['Sheets'],
  ['Inventory — one row per item. Columns: ID, NAME, CATEGORY, QUANTITY, LOCATION, DESCRIPTION, PHOTO, ADDED_BY, CREATED_DATE, UPDATED_DATE.'],
  ['Categories — list of categories (column A).'],
  ['Locations — list of locations (column A), e.g. "Building A - Floor 1 - Room 101".'],
  ['Instructions — this sheet.'],
  [''],
  ['Rules'],
  ['• ID must be unique (e.g. INV-001). Never change an existing ID.'],
  ['• QUANTITY must be a number.'],
  ['• PHOTO holds a picture placed inside the cell. Do not move photos to other rows.'],
  ['• Do not rename sheets or column headers.'],
  [''],
  ['Working with several people'],
  ['The website does not store any data. Each person works on their own copy of this file.'],
  ['Changes made by one person are only visible to others after they receive the updated file.'],
  ['Always pass the newest downloaded file along, and avoid two people editing different copies at the same time.'],
];
