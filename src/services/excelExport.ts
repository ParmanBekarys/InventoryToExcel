import ExcelJS from 'exceljs';
import { INVENTORY_COLUMNS, SHEET_NAMES, type InventoryItem, type WorkbookContext } from '../types/inventory';
import { stampToExcelDate } from '../utils/dates';
import { loadIntoExcelJS } from './packageNormalizer';
import { embedInCellPictures, type InCellPicture } from './inCellImages';
import {
  DEFAULT_INSTRUCTIONS,
  INVENTORY_COLUMN_WIDTHS,
  PHOTO_ROW_HEIGHT_PT,
  PLAIN_ROW_HEIGHT_PT,
  TEMPLATE_SHEET_ORDER,
} from './templateSchema';

export interface ExportInput {
  items: InventoryItem[];
  categories: string[];
  locations: string[];
  context: WorkbookContext;
  /**
   * floating (default): pictures fitted inside the PHOTO cells — works in every Excel version.
   * in-cell: Excel 365 "Place in Cell" pictures — click to enlarge in Excel 365, #VALUE! elsewhere.
   */
  photoMode?: PhotoMode;
}

/**
 * zip: ZIP with the Excel file + assets/ folder; PHOTO cells are clickable links (assets/INV-001.jpg).
 * in-cell: Excel 365 "Place in Cell" pictures. floating: pictures fitted over the cells (all versions).
 */
export type PhotoMode = 'zip' | 'floating' | 'in-cell';

export interface AssetFile {
  path: string;
  bytes: Uint8Array;
}

export const ASSETS_DIR = 'assets';

/** File-system-safe asset names based on the item ID (unique, Windows-safe). */
export function assetNames(items: InventoryItem[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  items.forEach((it, i) => {
    if (!it.photo) return;
    const base =
      (it.id || `NO-ID-${i + 1}`)
        .replace(/[\\/:*?"<>|\s]+/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 80) || `item-${i + 1}`;
    const ext = it.photo.ext === 'jpeg' ? 'jpg' : it.photo.ext;
    let name = `${base}.${ext}`;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}_${k}.${ext}`;
    used.add(name.toLowerCase());
    out.set(it.uid, `${ASSETS_DIR}/${name}`);
  });
  return out;
}

const BLUE = 'FF2563EB';
const WHITE = 'FFFFFFFF';
const ZEBRA = 'FFF1F5F9';
const BORDER = 'FFCBD5E1';
const TEXT = 'FF0F172A';
const FONT = 'Calibri';

const EMU_PER_PX = 9525;
/** Excel column width (characters) → pixels at default Calibri 11. */
const colWidthToPx = (w: number) => Math.floor(w * 7 + 5);
const ptToPx = (pt: number) => Math.round((pt * 96) / 72);

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } };
const allBorders: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { ...allBorders, bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } } };
  });
}

function styleBodyRow(row: ExcelJS.Row, index: number, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { name: FONT, size: 11, color: { argb: TEXT } };
    cell.border = allBorders;
    if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
    cell.alignment = { vertical: 'middle', wrapText: true, ...(cell.alignment ?? {}) };
  }
}

function dateCell(cell: ExcelJS.Cell, stamp: string) {
  const d = stamp ? stampToExcelDate(stamp) : null;
  if (d) {
    cell.value = d.date;
    cell.numFmt = d.hasTime ? 'yyyy-mm-dd hh:mm' : 'yyyy-mm-dd';
  } else {
    cell.value = stamp || null;
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function buildInventorySheet(wb: ExcelJS.Workbook, input: ExportInput) {
  const { items, context } = input;
  const ws = wb.addWorksheet(SHEET_NAMES.inventory, {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activeCell: 'A2' }],
    properties: { defaultRowHeight: 20, tabColor: { argb: BLUE } },
  });
  const headers = [...INVENTORY_COLUMNS, ...context.extraColumns];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: INVENTORY_COLUMN_WIDTHS[h] ?? 18 }));
  styleHeader(ws.getRow(1));

  const photoColIndex = INVENTORY_COLUMNS.indexOf('PHOTO'); // 0-based (G = 6)
  const photoColPx = colWidthToPx(INVENTORY_COLUMN_WIDTHS.PHOTO);
  const inCell: InCellPicture[] = [];
  const assets: AssetFile[] = [];
  const names = input.photoMode === 'zip' ? assetNames(items) : null;

  items.forEach((it, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    row.getCell(1).value = it.id || null;
    row.getCell(2).value = it.name || null;
    row.getCell(3).value = it.category || null;
    const q = row.getCell(4);
    q.value = Number.isFinite(it.quantity) ? it.quantity : 0;
    q.numFmt = Number.isInteger(it.quantity) ? '0' : '0.##';
    row.getCell(5).value = it.location || null;
    row.getCell(6).value = it.description || null;
    row.getCell(7).value = it.photo ? null : it.photoText || null;
    row.getCell(8).value = it.addedBy || null;
    context.extraColumns.forEach((h, k) => {
      const v = it.extra[h];
      row.getCell(11 + k).value = v === undefined || v === '' ? null : v;
    });
    row.height = it.photo && !names ? PHOTO_ROW_HEIGHT_PT : PLAIN_ROW_HEIGHT_PT;
    styleBodyRow(row, i, headers.length);
    dateCell(row.getCell(9), it.createdDate);
    dateCell(row.getCell(10), it.updatedDate);
    row.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
    q.alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    if (it.photo && names) {
      // Clickable relative link; Excel opens assets/<ID>.jpg next to the workbook.
      const path = names.get(it.uid)!;
      assets.push({ path, bytes: it.photo.bytes });
      const cell = row.getCell(7);
      cell.value = { text: path, hyperlink: path, tooltip: 'Open photo' } as ExcelJS.CellHyperlinkValue;
      cell.font = { name: FONT, size: 11, color: { argb: 'FF2563EB' }, underline: true };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    } else if (it.photo && input.photoMode === 'in-cell') {
      // Numeric placeholder; replaced by a real "Place in Cell" picture after ExcelJS writes the file.
      inCell.push({ row: r, col: photoColIndex + 1, index: inCell.length + 1, bytes: it.photo.bytes, ext: it.photo.ext, altText: [it.id, it.name].filter(Boolean).join(' · ') });
      row.getCell(7).value = inCell.length;
    } else if (it.photo) {
      const imageId = wb.addImage({ base64: toBase64(it.photo.bytes), extension: it.photo.ext });
      // Fit the photo inside the PHOTO cell, keeping its aspect ratio, with a small margin.
      const pad = 4;
      const boxW = photoColPx - pad * 2;
      const boxH = ptToPx(PHOTO_ROW_HEIGHT_PT) - pad * 2;
      const iw = it.photo.width || boxW;
      const ih = it.photo.height || boxH;
      const scale = Math.min(boxW / iw, boxH / ih);
      const w = Math.max(1, Math.floor(iw * scale));
      const h = Math.max(1, Math.floor(ih * scale));
      const offX = pad + Math.floor((boxW - w) / 2);
      const offY = pad + Math.floor((boxH - h) / 2);
      ws.addImage(imageId, {
        tl: { nativeCol: photoColIndex, nativeColOff: offX * EMU_PER_PX, nativeRow: r - 1, nativeRowOff: offY * EMU_PER_PX },
        br: { nativeCol: photoColIndex, nativeColOff: (offX + w) * EMU_PER_PX, nativeRow: r - 1, nativeRowOff: (offY + h) * EMU_PER_PX },
        // "Move and size with cells": the photo follows its row when sorting/filtering in Excel.
        editAs: 'twoCell',
      } as unknown as ExcelJS.ImageRange);
    }
  });

  const lastRow = Math.max(1, items.length + 1);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: headers.length } };

  // Dropdowns in Excel for CATEGORY / LOCATION (warning only, so free text is still allowed) and numeric QUANTITY.
  const validationEnd = Math.max(lastRow + 200, 500);
  const dv = (ws as unknown as { dataValidations: { add: (range: string, v: ExcelJS.DataValidation) => void } }).dataValidations;
  if (input.categories.length) {
    dv.add(`C2:C${validationEnd}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_NAMES.categories}'!$A$2:$A$${input.categories.length + 1}`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Unknown category',
      error: 'This category is not in the Categories sheet.',
    });
  }
  if (input.locations.length) {
    dv.add(`E2:E${validationEnd}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`'${SHEET_NAMES.locations}'!$A$2:$A$${input.locations.length + 1}`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: 'Unknown location',
      error: 'This location is not in the Locations sheet.',
    });
  }
  dv.add(`D2:D${validationEnd}`, {
    type: 'decimal',
    operator: 'greaterThanOrEqual',
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorTitle: 'Invalid quantity',
    error: 'QUANTITY must be a number (0 or more).',
  });
  return { inCell, assets };
}

function buildListSheet(wb: ExcelJS.Workbook, name: string, header: string, values: string[], width: number) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activeCell: 'A2' }] });
  ws.columns = [{ header, key: 'v', width }];
  styleHeader(ws.getRow(1));
  ws.getRow(1).getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  values.forEach((v, i) => {
    const row = ws.getRow(i + 2);
    row.getCell(1).value = v;
    row.height = 22;
    styleBodyRow(row, i, 1);
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, values.length + 1), column: 1 } };
}

function buildDefaultInstructions(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(SHEET_NAMES.instructions);
  ws.getColumn(1).width = 110;
  DEFAULT_INSTRUCTIONS.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1);
    cell.value = line[0];
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) {
      cell.font = { name: FONT, bold: true, size: 16, color: { argb: WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      ws.getRow(1).height = 32;
      cell.alignment = { vertical: 'middle', indent: 1 };
    } else if (line[0] && !/^[\d•]/.test(line[0]) && !line[0].includes(' — ') && line[0].length < 40) {
      cell.font = { name: FONT, bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
    } else {
      cell.font = { name: FONT, size: 11, color: { argb: TEXT } };
    }
  });
}

/** Copies a sheet from the untouched original workbook: values, formulas, styles, sizes, merges and pictures. */
function copySheet(src: ExcelJS.Worksheet, srcWb: ExcelJS.Workbook, wb: ExcelJS.Workbook, name: string) {
  const dst = wb.addWorksheet(name, {
    properties: { ...src.properties },
    views: src.views?.length ? src.views.map((v) => ({ ...v })) : undefined,
    pageSetup: { ...src.pageSetup },
    state: src.state,
  });
  const colCount = Math.max(src.columnCount, src.actualColumnCount);
  for (let c = 1; c <= colCount; c++) {
    const sc = src.getColumn(c);
    const dc = dst.getColumn(c);
    if (sc.width) dc.width = sc.width;
    if (sc.hidden) dc.hidden = true;
  }
  src.eachRow({ includeEmpty: true }, (row, r) => {
    const dr = dst.getRow(r);
    if (row.height) dr.height = row.height;
    if (row.hidden) dr.hidden = true;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      const dc = dr.getCell(c);
      if (cell.type === ExcelJS.ValueType.Merge) {
        dc.style = JSON.parse(JSON.stringify(cell.style ?? {}));
        return;
      }
      if (cell.type === ExcelJS.ValueType.Formula) {
        dc.value = { formula: cell.formula, result: cell.result } as ExcelJS.CellFormulaValue;
      } else {
        dc.value = cell.value;
      }
      dc.style = JSON.parse(JSON.stringify(cell.style ?? {}));
    });
  });
  const merges: string[] = (src as unknown as { model: { merges?: string[] } }).model.merges ?? [];
  for (const m of merges) {
    try {
      dst.mergeCells(m);
    } catch {
      /* overlapping merge; skip */
    }
  }
  for (const img of src.getImages()) {
    const media = srcWb.getImage(Number(img.imageId)) as unknown as { buffer?: ArrayBuffer; base64?: string; extension: 'png' | 'jpeg' | 'gif' };
    if (!media || !['png', 'jpeg', 'gif'].includes(media.extension)) continue;
    const id = media.buffer
      ? wb.addImage({ buffer: media.buffer as never, extension: media.extension })
      : wb.addImage({ base64: media.base64 ?? '', extension: media.extension });
    const native = (a: ExcelJS.Anchor) => ({ nativeCol: a.nativeCol, nativeColOff: a.nativeColOff, nativeRow: a.nativeRow, nativeRowOff: a.nativeRowOff });
    const range = img.range as unknown as { tl: ExcelJS.Anchor; br?: ExcelJS.Anchor; ext?: { width: number; height: number }; editAs?: string };
    dst.addImage(id, {
      tl: native(range.tl),
      ...(range.br ? { br: native(range.br) } : {}),
      ...(range.ext ? { ext: range.ext } : {}),
      editAs: range.editAs ?? 'oneCell',
    } as unknown as ExcelJS.ImageRange);
  }
}

/** Builds the updated workbook. The original upload is only read, never modified. */
export async function buildWorkbook(input: ExportInput): Promise<Uint8Array> {
  return (await buildWorkbookParts(input)).bytes;
}

export async function buildWorkbookParts(input: ExportInput): Promise<{ bytes: Uint8Array; assets: AssetFile[] }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventory Manager';
  wb.lastModifiedBy = 'Inventory Manager';
  wb.created = new Date();
  wb.modified = new Date();

  let original: ExcelJS.Workbook | null = null;
  if (input.context.originalBuffer) {
    // Same path repair as on import; reads a copy, the original bytes are never changed.
    original = (await loadIntoExcelJS(() => new ExcelJS.Workbook(), input.context.originalBuffer)).wb;
  }
  const findOriginal = (name: string) => original?.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());

  // Keep the original sheet order; append any managed sheet that was missing.
  const order = [...input.context.sheetOrder];
  for (const s of TEMPLATE_SHEET_ORDER) if (!order.some((o) => o.trim().toLowerCase() === s.toLowerCase())) order.push(s);

  let inCell: InCellPicture[] = [];
  let assets: AssetFile[] = [];
  for (const name of order) {
    const key = name.trim().toLowerCase();
    if (key === SHEET_NAMES.inventory.toLowerCase()) ({ inCell, assets } = buildInventorySheet(wb, input));
    else if (key === SHEET_NAMES.categories.toLowerCase()) buildListSheet(wb, SHEET_NAMES.categories, input.context.categoriesHeader, input.categories, 34);
    else if (key === SHEET_NAMES.locations.toLowerCase()) buildListSheet(wb, SHEET_NAMES.locations, input.context.locationsHeader, input.locations, 44);
    else {
      const src = findOriginal(name);
      if (src && original) copySheet(src, original, wb, src.name);
      else if (key === SHEET_NAMES.instructions.toLowerCase()) buildDefaultInstructions(wb);
    }
  }
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const out = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  return { bytes: inCell.length ? await embedInCellPictures(out, SHEET_NAMES.inventory, inCell) : out, assets };
}

export function exportFileName(sourceName: string | undefined, ext: 'xlsx' | 'zip' = 'xlsx'): string {
  const base = (sourceName ?? 'Inventory').replace(/\.(xlsx|zip)$/i, '').replace(/_updated_\d{4}-\d{2}-\d{2}_\d{4}$/i, '') || 'Inventory';
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${base}_updated_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

/** Triggers a browser download of the given bytes (nothing is uploaded anywhere). */
export function downloadBytes(bytes: Uint8Array, fileName: string) {
  const type = /\.zip$/i.test(fileName) ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
