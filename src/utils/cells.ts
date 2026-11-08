import type { CellValue } from 'exceljs';

/** Converts any ExcelJS cell value into plain text. */
export function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((r) => r.text).join('').trim();
    }
    if ('text' in v && v.text !== undefined) return cellText(v.text as CellValue);
    if ('result' in v) return cellText(v.result as CellValue);
    if ('error' in v) return '';
  }
  return String(value);
}

/** The cell value with formulas unwrapped to their result. */
export function cellRaw(value: CellValue | undefined): CellValue | undefined {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const v = value as unknown as Record<string, unknown>;
    if ('result' in v) return v.result as CellValue;
    if ('error' in v) return null;
  }
  return value;
}

/** Normalises a header label: "Created Date" → "CREATED_DATE". */
export function normaliseHeader(h: string): string {
  return h.trim().toUpperCase().replace(/[\s-]+/g, '_');
}
