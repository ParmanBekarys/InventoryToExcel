import type { LoadedSession } from './excelImport';
import { nowStamp } from '../utils/dates';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORIES_HEADER,
  DEFAULT_LOCATIONS,
  DEFAULT_LOCATIONS_HEADER,
  TEMPLATE_SHEET_ORDER,
} from './templateSchema';

/** An empty session with the exact template structure (used for "Start blank" and to generate the template file). */
export function blankSession(): LoadedSession {
  return {
    items: [],
    categories: [...DEFAULT_CATEGORIES],
    locations: [...DEFAULT_LOCATIONS],
    context: {
      sheetOrder: [...TEMPLATE_SHEET_ORDER],
      originalBuffer: null,
      categoriesHeader: DEFAULT_CATEGORIES_HEADER,
      locationsHeader: DEFAULT_LOCATIONS_HEADER,
      extraColumns: [],
    },
    report: { fileName: 'Inventory.xlsx', fileSize: 0, importedAt: nowStamp(), itemCount: 0, photoCount: 0, issues: [] },
  };
}
