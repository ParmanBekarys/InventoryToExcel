import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  INVENTORY_COLUMNS,
  SHEET_NAMES,
  type ImportIssue,
  type ImportReport,
  type InventoryColumn,
  type InventoryItem,
  type Photo,
  type WorkbookContext,
} from '../types/inventory';
import { cellRaw, cellText, normaliseHeader } from '../utils/cells';
import { excelDateToStamp, serialToStamp, nowStamp } from '../utils/dates';
import { uid } from '../utils/ids';
import { extractSheetImages, sheetsWithDrawings, type ExtractedImage } from './imageExtraction';
import { createPhoto, detectImageFormat, isEmbeddable } from './imageProcessing';
import { loadIntoExcelJS } from './packageNormalizer';
import { dedupe, sameName } from './lookupLists';
import { DEFAULT_CATEGORIES_HEADER, DEFAULT_LOCATIONS_HEADER } from './templateSchema';

export class ImportError extends Error {}

export interface LoadedSession {
  items: InventoryItem[];
  categories: string[];
  locations: string[];
  context: WorkbookContext;
  report: ImportReport;
}

export interface ImportOptions {
  /** Converts browser-decodable formats (BMP/WebP) to PNG. Browser-only. */
  convertImage?: (bytes: Uint8Array, mime: string) => Promise<Uint8Array | null>;
  /** Looks up a photo file next to the workbook (ZIP upload): by the PHOTO link, then by item ID. */
  externalFiles?: (link: string, id: string) => { bytes: Uint8Array; path: string } | null;
}

/** A PHOTO cell value that looks like a path to an image file. */
export const IMAGE_LINK = /\.(jpe?g|png|gif|webp|bmp)$/i;

const MAX_FILE_SIZE = 200 * 1024 * 1024;

function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === name.toLowerCase());
}

function bytesStartWith(buf: ArrayBuffer, sig: number[]): boolean {
  const b = new Uint8Array(buf, 0, Math.min(sig.length, buf.byteLength));
  return sig.every((v, i) => b[i] === v);
}

function readDate(value: ExcelJS.CellValue | undefined): string {
  const raw = cellRaw(value);
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? '' : excelDateToStamp(raw);
  if (typeof raw === 'number' && raw > 0 && raw < 2958466) return serialToStamp(raw);
  return cellText(value);
}

function readListSheet(ws: ExcelJS.Worksheet | undefined, fallbackHeader: string) {
  if (!ws) return { header: fallbackHeader, values: [] as string[], extraColumns: false };
  const header = cellText(ws.getCell(1, 1).value) || fallbackHeader;
  const values: string[] = [];
  let extraColumns = false;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const v = cellText(row.getCell(1).value);
    if (v) values.push(v);
    if (row.cellCount > 1) {
      for (let c = 2; c <= row.cellCount; c++) if (cellText(row.getCell(c).value)) extraColumns = true;
    }
  }
  return { header, values, extraColumns };
}

/**
 * Reads an uploaded workbook entirely in memory. The original bytes are never modified.
 */
export async function importWorkbook(buffer: ArrayBuffer, fileName: string, options: ImportOptions = {}): Promise<LoadedSession> {
  const issues: ImportIssue[] = [];
  const warn = (message: string) => issues.push({ level: 'warning', message });
  const info = (message: string) => issues.push({ level: 'info', message });

  if (!buffer.byteLength) throw new ImportError('The file is empty.');
  if (buffer.byteLength > MAX_FILE_SIZE) throw new ImportError('The file is larger than 200 MB and cannot be opened in the browser.');
  if (bytesStartWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ImportError(
      'This file is either password-protected or an old .xls workbook. Remove the password, or open it in Excel and use "Save As → Excel Workbook (.xlsx)", then upload it again.',
    );
  }
  if (!bytesStartWith(buffer, [0x50, 0x4b])) throw new ImportError('This is not a valid .xlsx file. Please upload an Excel workbook (.xlsx).');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ImportError('The file looks damaged and could not be opened as an Excel workbook.');
  }
  if (!zip.file('xl/workbook.xml')) throw new ImportError('This file is a ZIP archive but not an Excel workbook (.xlsx).');

  let wb: ExcelJS.Workbook;
  try {
    const loaded = await loadIntoExcelJS(() => new ExcelJS.Workbook(), buffer);
    wb = loaded.wb;
    if (loaded.dropped.length) {
      info(`The file refers to ${loaded.dropped.length} internal part(s) that are missing (${loaded.dropped.join(', ')}). They were skipped; no inventory data is affected.`);
    }
    if (loaded.lenient) {
      warn('Cell comments/notes and Excel table definitions in this file could not be read and were skipped. All inventory data and photos were read normally. Comments will not be in the downloaded file.');
    }
  } catch (e) {
    throw new ImportError(
      `This workbook's internal structure could not be read (${(e as Error).message || 'unknown error'}). Try opening it in Excel and using "Save As → Excel Workbook (.xlsx)", then upload the new file.`,
    );
  }

  const sheetOrder = wb.worksheets.map((ws) => ws.name);
  const inv = findSheet(wb, SHEET_NAMES.inventory);
  if (!inv) {
    throw new ImportError(
      `No "${SHEET_NAMES.inventory}" worksheet was found. Sheets in this file: ${sheetOrder.map((s) => `"${s}"`).join(', ') || 'none'}. Please use the Inventory template.`,
    );
  }

  // ---- Header row ----
  let headerRow = 0;
  for (let r = 1; r <= Math.min(10, inv.rowCount || 1); r++) {
    const labels: string[] = [];
    inv.getRow(r).eachCell((c) => labels.push(normaliseHeader(cellText(c.value))));
    if (labels.includes('ID') && labels.includes('NAME')) {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) {
    throw new ImportError('The Inventory sheet has no header row with "ID" and "NAME" columns. Please check that the column headers match the template.');
  }
  if (headerRow !== 1) info(`The header row was found on row ${headerRow}; the exported file will have it on row 1.`);

  const colOf = new Map<InventoryColumn, number>();
  const extraColumns: { header: string; col: number }[] = [];
  inv.getRow(headerRow).eachCell((cell, col) => {
    const label = cellText(cell.value);
    const key = normaliseHeader(label) as InventoryColumn;
    if ((INVENTORY_COLUMNS as readonly string[]).includes(key)) {
      if (!colOf.has(key)) colOf.set(key, col);
    } else if (label) {
      extraColumns.push({ header: label, col });
    }
  });
  const missing = INVENTORY_COLUMNS.filter((c) => !colOf.has(c));
  if (missing.length) warn(`Column(s) ${missing.join(', ')} were not found in the Inventory sheet. They will be added (empty) in the exported file.`);
  if (extraColumns.length)
    info(`Extra column(s) ${extraColumns.map((e) => `"${e.header}"`).join(', ')} are not part of the template. Their values will be kept and written after column J.`);
  INVENTORY_COLUMNS.forEach((c, i) => {
    const at = colOf.get(c);
    if (at !== undefined && at !== i + 1) {
      if (!issues.some((x) => x.message.startsWith('Columns are in a different order'))) {
        info('Columns are in a different order than the template. The exported file will use the template order (A = ID … J = UPDATED_DATE).');
      }
    }
  });

  // ---- Pictures ----
  const extraction = await extractSheetImages(zip, inv.name);
  extraction.problems.forEach(warn);
  extraction.notes.forEach(info);
  const photoCol = colOf.get('PHOTO') ?? 7;
  const imagesByRow = new Map<number, ExtractedImage[]>();
  for (const img of extraction.images) {
    const list = imagesByRow.get(img.row) ?? [];
    list.push(img);
    imagesByRow.set(img.row, list);
  }
  const inCellCount = extraction.images.filter((i) => i.kind === 'in-cell').length;
  if (inCellCount) {
    info(
      `${inCellCount} picture(s) were stored with Excel's "Place in Cell" feature. They were read successfully and will be exported as pictures fitted inside the PHOTO cells (compatible with all Excel versions).`,
    );
  }

  async function toPhoto(img: ExtractedImage, row: number): Promise<Photo | null> {
    if (isEmbeddable(img.format)) return createPhoto(img.bytes, img.format, 'workbook');
    if ((img.format === 'bmp' || img.format === 'webp') && options.convertImage) {
      const png = await options.convertImage(img.bytes, `image/${img.format}`);
      if (png) {
        info(`The photo in row ${row} was a ${img.format.toUpperCase()} image and was converted to PNG.`);
        return createPhoto(png, 'png', 'workbook');
      }
    }
    warn(
      `The picture in row ${row} uses the ${img.format.toUpperCase()} format, which browsers cannot display or re-embed. It will NOT be included in the exported file. Replace it with a JPG or PNG photo.`,
    );
    return null;
  }

  // ---- Records ----
  const items: InventoryItem[] = [];
  const badQuantities: string[] = [];
  let linkedPhotos = 0;
  const missingLinks: string[] = [];
  const get = (row: ExcelJS.Row, key: InventoryColumn) => {
    const c = colOf.get(key);
    return c ? row.getCell(c).value : undefined;
  };
  const lastRow = Math.max(inv.rowCount, ...[...imagesByRow.keys()]);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = inv.getRow(r);
    const rowImages = imagesByRow.get(r) ?? [];
    const texts = INVENTORY_COLUMNS.filter((c) => c !== 'PHOTO').map((c) => cellText(get(row, c)));
    const extra: Record<string, string | number> = {};
    for (const e of extraColumns) {
      const raw = cellRaw(row.getCell(e.col).value);
      if (typeof raw === 'number') extra[e.header] = raw;
      else if (raw instanceof Date) extra[e.header] = excelDateToStamp(raw);
      else {
        const t = cellText(row.getCell(e.col).value);
        if (t) extra[e.header] = t;
      }
    }
    const photoText = cellText(get(row, 'PHOTO'));
    const empty = texts.every((t) => !t) && !photoText && !Object.keys(extra).length;
    if (empty) {
      if (rowImages.length) {
        warn(`Row ${r} contains a picture but no item data. That picture is not linked to any item and will not be included in the export.`);
      }
      continue;
    }

    // Quantity
    const qRaw = cellRaw(get(row, 'QUANTITY'));
    let quantity = 0;
    if (typeof qRaw === 'number') quantity = qRaw;
    else {
      const t = cellText(get(row, 'QUANTITY')).replace(',', '.');
      if (t) {
        const n = Number(t);
        if (Number.isFinite(n)) quantity = n;
        else badQuantities.push(`row ${r} ("${t}")`);
      }
    }

    // Photo: prefer the picture placed in the PHOTO column.
    let photo: Photo | null = null;
    if (rowImages.length) {
      const sorted = [...rowImages].sort((a, b) => Math.abs(a.col - photoCol) - Math.abs(b.col - photoCol));
      photo = await toPhoto(sorted[0], r);
      if (rowImages.length > 1) {
        warn(`Row ${r} has ${rowImages.length} pictures. Only one photo per item is supported; the one closest to the PHOTO column is kept, the other ${rowImages.length - 1} will not be exported.`);
      }
    }

    // No embedded picture: the PHOTO cell may link to a file in the ZIP's assets folder.
    const photoValue = get(row, 'PHOTO') as { hyperlink?: string } | undefined;
    const link = (photoValue && typeof photoValue === 'object' && typeof photoValue.hyperlink === 'string' ? photoValue.hyperlink : '') || photoText;
    let usedLink = false;
    if (!photo && options.externalFiles && (link || cellText(get(row, 'ID')))) {
      const file = options.externalFiles(link, cellText(get(row, 'ID')));
      if (file) {
        photo = await toPhoto({ row: r, col: photoCol, bytes: file.bytes, format: detectImageFormat(file.bytes), kind: 'floating', mediaPath: file.path }, r);
        usedLink = !!photo;
        if (photo) linkedPhotos++;
      } else if (link && IMAGE_LINK.test(link)) {
        missingLinks.push(`row ${r} (${link})`);
      }
    }

    items.push({
      uid: uid('it'),
      id: cellText(get(row, 'ID')),
      name: cellText(get(row, 'NAME')),
      category: cellText(get(row, 'CATEGORY')),
      quantity,
      location: cellText(get(row, 'LOCATION')),
      description: cellText(get(row, 'DESCRIPTION')),
      photo,
      photoText: photo || usedLink ? '' : photoText,
      addedBy: cellText(get(row, 'ADDED_BY')),
      createdDate: readDate(get(row, 'CREATED_DATE')),
      updatedDate: readDate(get(row, 'UPDATED_DATE')),
      extra,
      sourceRow: r,
    });
  }
  if (badQuantities.length) {
    warn(`QUANTITY is not a number in ${badQuantities.slice(0, 8).join(', ')}${badQuantities.length > 8 ? ` and ${badQuantities.length - 8} more` : ''}. These were set to 0 — please correct them.`);
  }
  if (linkedPhotos) info(`${linkedPhotos} photo(s) were loaded from the assets folder in the ZIP file.`);
  if (missingLinks.length) {
    warn(`${missingLinks.length} PHOTO link(s) point to image files that are not in the ZIP: ${missingLinks.slice(0, 6).join(', ')}${missingLinks.length > 6 ? ' …' : ''}. The link text is kept.`);
  }
  const imageLinks = items.filter((i) => !i.photo && IMAGE_LINK.test(i.photoText)).length;
  if (imageLinks && !options.externalFiles) {
    warn(
      `${imageLinks} PHOTO cell(s) link to image files (e.g. "${items.find((i) => !i.photo && IMAGE_LINK.test(i.photoText))!.photoText}"), but only the Excel file was uploaded. To load these photos, upload the whole ZIP file (Excel + assets folder).`,
    );
  }
  const textPhotos = items.filter((i) => i.photoText && !IMAGE_LINK.test(i.photoText)).length;
  if (textPhotos) info(`${textPhotos} PHOTO cell(s) contain text instead of a picture. The text is kept unchanged.`);

  // ---- ID checks ----
  const seen = new Map<string, number[]>();
  for (const it of items) {
    if (!it.id) continue;
    const k = it.id.toUpperCase();
    seen.set(k, [...(seen.get(k) ?? []), it.sourceRow ?? 0]);
  }
  const dups = [...seen.entries()].filter(([, rows]) => rows.length > 1);
  if (dups.length) {
    warn(`Duplicate IDs found: ${dups.map(([id, rows]) => `${id} (rows ${rows.join(', ')})`).join('; ')}. All rows were kept — please give each item a unique ID.`);
  }
  const noId = items.filter((i) => !i.id);
  if (noId.length) warn(`${noId.length} item(s) have no ID (rows ${noId.map((i) => i.sourceRow).join(', ')}). They were kept; you can assign IDs by editing them.`);

  // ---- Categories & Locations ----
  const catSheet = findSheet(wb, SHEET_NAMES.categories);
  const locSheet = findSheet(wb, SHEET_NAMES.locations);
  if (!catSheet) warn(`No "${SHEET_NAMES.categories}" sheet was found. It will be created on export.`);
  if (!locSheet) warn(`No "${SHEET_NAMES.locations}" sheet was found. It will be created on export.`);
  const cats = readListSheet(catSheet, DEFAULT_CATEGORIES_HEADER);
  const locs = readListSheet(locSheet, DEFAULT_LOCATIONS_HEADER);
  if (cats.extraColumns) warn('The Categories sheet has data outside column A. Only column A (the category names) is managed and exported.');
  if (locs.extraColumns) warn('The Locations sheet has data outside column A. Only column A (the location names) is managed and exported.');

  const catList = dedupe(cats.values);
  const locList = dedupe(locs.values);
  if (catList.duplicates.length) info(`Duplicate categories were merged: ${catList.duplicates.join(', ')}.`);
  if (locList.duplicates.length) info(`Duplicate locations were merged: ${locList.duplicates.join(', ')}.`);

  const addMissing = (list: string[], used: string[], label: string) => {
    const added: string[] = [];
    for (const u of used) {
      if (u && !list.some((x) => sameName(x, u)) && !added.some((x) => sameName(x, u))) added.push(u);
    }
    if (added.length) {
      info(`${added.length} ${label} used by items were missing from the ${label === 'categories' ? 'Categories' : 'Locations'} sheet and were added to the list: ${added.join(', ')}.`);
    }
    return [...list, ...added];
  };
  const categories = addMissing(catList.list, items.map((i) => i.category), 'categories');
  const locations = addMissing(locList.list, items.map((i) => i.location), 'locations');

  // ---- Other sheets ----
  if (!findSheet(wb, SHEET_NAMES.instructions)) info(`No "${SHEET_NAMES.instructions}" sheet was found. A default Instructions sheet will be added on export.`);
  const managed = Object.values(SHEET_NAMES).map((s) => s.toLowerCase());
  const others = sheetOrder.filter((s) => !managed.includes(s.toLowerCase()));
  if (others.length) info(`Additional sheet(s) ${others.map((s) => `"${s}"`).join(', ')} will be copied to the exported file (values, formulas and formatting).`);
  for (const [name, d] of await sheetsWithDrawings(zip)) {
    if (name.toLowerCase() === inv.name.toLowerCase()) continue;
    if (d.charts) warn(`The "${name}" sheet contains ${d.charts} chart(s)/graphic object(s). Charts cannot be recreated in the browser and will be missing from the exported file.`);
  }

  const photoCount = items.filter((i) => i.photo).length;
  const context: WorkbookContext = {
    sheetOrder,
    originalBuffer: buffer,
    categoriesHeader: cats.header,
    locationsHeader: locs.header,
    extraColumns: extraColumns.map((e) => e.header),
  };
  return {
    items,
    categories,
    locations,
    context,
    report: { fileName, fileSize: buffer.byteLength, importedAt: nowStamp(), itemCount: items.length, photoCount, issues },
  };
}
