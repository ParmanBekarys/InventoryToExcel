import type JSZip from 'jszip';
import { attrLocal, descendants, elementChildren, firstChild, parseXml, relsPathFor, resolvePartPath, textOf } from '../utils/xml';
import { detectImageFormat, type DetectedFormat } from './imageProcessing';

/**
 * Reads pictures straight from the .xlsx package (OOXML) so nothing is lost:
 *  - floating pictures in xl/drawings/drawingN.xml (twoCellAnchor / oneCellAnchor),
 *  - Excel 365 "Place in Cell" pictures stored as rich values (xl/richData/*).
 * Every picture that cannot be used is reported, never dropped silently.
 */

export interface ExtractedImage {
  /** 1-based worksheet row / column the picture belongs to. */
  row: number;
  col: number;
  bytes: Uint8Array;
  format: DetectedFormat;
  kind: 'floating' | 'in-cell';
  mediaPath: string;
}

export interface ExtractionResult {
  images: ExtractedImage[];
  problems: string[];
  notes: string[];
}

interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  return f ? f.async('string') : null;
}

export async function readRels(zip: JSZip, ownerPart: string): Promise<Map<string, Rel>> {
  const map = new Map<string, Rel>();
  const xml = await readText(zip, relsPathFor(ownerPart));
  if (!xml) return map;
  const doc = parseXml(xml);
  for (const rel of descendants(doc, 'Relationship')) {
    const id = rel.getAttribute('Id') ?? '';
    const external = rel.getAttribute('TargetMode') === 'External';
    const target = rel.getAttribute('Target') ?? '';
    map.set(id, {
      id,
      type: rel.getAttribute('Type') ?? '',
      target: external ? target : resolvePartPath(ownerPart, target),
      external,
    });
  }
  return map;
}

/** Maps worksheet names to their XML part paths using workbook.xml + its rels. */
export async function sheetPartPaths(zip: JSZip): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wbXml = await readText(zip, 'xl/workbook.xml');
  if (!wbXml) return out;
  const rels = await readRels(zip, 'xl/workbook.xml');
  for (const s of descendants(parseXml(wbXml), 'sheet')) {
    const rid = attrLocal(s, 'id');
    const name = s.getAttribute('name');
    const rel = rid ? rels.get(rid) : undefined;
    if (name && rel) out.set(name, rel.target);
  }
  return out;
}

async function readBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const f = zip.file(path);
  return f ? f.async('uint8array') : null;
}

function cellRefToRowCol(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: parseInt(m[2], 10), col };
}

// ---------------- Floating pictures (drawings) ----------------

async function extractDrawingImages(zip: JSZip, sheetPart: string, result: ExtractionResult) {
  const sheetRels = await readRels(zip, sheetPart);
  const drawingRels = [...sheetRels.values()].filter((r) => r.type.endsWith('/drawing') && !r.external);
  for (const dRel of drawingRels) {
    const xml = await readText(zip, dRel.target);
    if (!xml) {
      result.problems.push(`The drawing part "${dRel.target}" is referenced but missing from the file.`);
      continue;
    }
    const rels = await readRels(zip, dRel.target);
    const root = parseXml(xml).documentElement;
    for (const anchor of elementChildren(root)) {
      const kind = anchor.localName;
      if (kind !== 'twoCellAnchor' && kind !== 'oneCellAnchor' && kind !== 'absoluteAnchor') continue;

      const directPic = firstChild(anchor, 'pic');
      const group = firstChild(anchor, 'grpSp');
      if (!directPic) {
        if (group && descendants(group, 'pic').length > 0) {
          result.problems.push(
            `${descendants(group, 'pic').length} picture(s) are inside a grouped shape. Grouped pictures are not supported — ungroup them in Excel and re-upload, otherwise they will not be included in the export.`,
          );
        } else if (firstChild(anchor, 'graphicFrame')) {
          result.notes.push('A chart or other graphic object on the Inventory sheet was ignored (only photos are managed there).');
        }
        continue;
      }
      if (kind === 'absoluteAnchor') {
        result.problems.push(
          'A picture is positioned at an absolute page position instead of being attached to a cell, so it cannot be matched to an item. Set it to "Move and size with cells" in Excel and re-upload.',
        );
        continue;
      }
      const from = firstChild(anchor, 'from');
      const row0 = parseInt(textOf(from && firstChild(from, 'row')), 10);
      const col0 = parseInt(textOf(from && firstChild(from, 'col')), 10);
      const blip = descendants(directPic, 'blip')[0];
      if (!blip || Number.isNaN(row0)) {
        result.problems.push('A picture on the Inventory sheet has an unreadable position or image reference.');
        continue;
      }
      const embedId = attrLocal(blip, 'embed');
      const linkId = attrLocal(blip, 'link');
      if (!embedId) {
        result.problems.push(
          `The picture in row ${row0 + 1} is a linked picture${linkId ? ' (stored outside the workbook)' : ''}, not an embedded one. It cannot be read; insert the photo into the workbook instead.`,
        );
        continue;
      }
      const rel = rels.get(embedId);
      if (!rel || rel.external) {
        result.problems.push(`The picture in row ${row0 + 1} points to an image that is not inside the workbook.`);
        continue;
      }
      const bytes = await readBytes(zip, rel.target);
      if (!bytes) {
        result.problems.push(`The picture in row ${row0 + 1} references "${rel.target}", which is missing from the file.`);
        continue;
      }
      result.images.push({ row: row0 + 1, col: (Number.isNaN(col0) ? 6 : col0) + 1, bytes, format: detectImageFormat(bytes), kind: 'floating', mediaPath: rel.target });
    }
  }
}

// ---------------- In-cell pictures (Excel 365 "Place in Cell") ----------------

async function findPart(zip: JSZip, fileName: string): Promise<string | null> {
  const exact = Object.keys(zip.files).find((p) => p.toLowerCase().endsWith(`/${fileName.toLowerCase()}`));
  return exact ?? null;
}

async function extractInCellImages(zip: JSZip, sheetPart: string, result: ExtractionResult) {
  const sheetXml = await readText(zip, sheetPart);
  if (!sheetXml || !/\svm="\d+"/.test(sheetXml)) return;

  // 1. Cells with value-metadata indexes.
  const cells: { row: number; col: number; vm: number }[] = [];
  const cellRe = /<(?:\w+:)?c\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml))) {
    const attrs = m[1];
    const vm = /\svm="(\d+)"/.exec(attrs);
    const r = /\sr="([A-Z]+\d+)"/i.exec(attrs);
    if (vm && r) {
      const rc = cellRefToRowCol(r[1]);
      if (rc) cells.push({ ...rc, vm: parseInt(vm[1], 10) });
    }
  }
  if (!cells.length) return;

  const unsupported = (why: string) =>
    result.problems.push(`${cells.length} in-cell picture(s) ("Place in Cell") were found but could not be read: ${why}`);

  const metaPath = (await findPart(zip, 'metadata.xml')) ?? 'xl/metadata.xml';
  const metaXml = await readText(zip, metaPath);
  const rvPath = await findPart(zip, 'rdrichvalue.xml');
  const structPath = await findPart(zip, 'rdrichvaluestructure.xml');
  const relPath = await findPart(zip, 'richValueRel.xml');
  if (!metaXml || !rvPath || !relPath) return unsupported('the rich-value parts of the workbook are missing.');

  // 2. metadata.xml: vm (1-based) → valueMetadata bk → rc(t,v) → futureMetadata bk → rvb i
  const meta = parseXml(metaXml);
  const typeNames = descendants(meta, 'metadataType').map((t) => t.getAttribute('name') ?? '');
  const futureByName = new Map<string, Element[]>();
  for (const fm of descendants(meta, 'futureMetadata')) {
    futureByName.set(fm.getAttribute('name') ?? '', elementChildren(fm, 'bk'));
  }
  const valueMeta = descendants(meta, 'valueMetadata')[0];
  const valueBks = valueMeta ? elementChildren(valueMeta, 'bk') : [];

  // 3. Rich values and their structures.
  const rvDoc = parseXml((await readText(zip, rvPath)) ?? '<rvData/>');
  const rvs = descendants(rvDoc, 'rv');
  const structs = structPath ? descendants(parseXml((await readText(zip, structPath)) ?? '<x/>'), 's') : [];

  // 4. richValueRel.xml → relationship ids → media.
  const relDoc = parseXml((await readText(zip, relPath)) ?? '<x/>');
  const relIds = descendants(relDoc, 'rel').map((r) => attrLocal(r, 'id') ?? '');
  const relMap = await readRels(zip, relPath);

  for (const cell of cells) {
    const bk = valueBks[cell.vm - 1];
    const rc = bk ? firstChild(bk, 'rc') : null;
    if (!rc) continue; // not a rich value cell
    const typeName = typeNames[parseInt(rc.getAttribute('t') ?? '0', 10) - 1];
    if (typeName !== 'XLRICHVALUE') continue;
    const fbk = futureByName.get('XLRICHVALUE')?.[parseInt(rc.getAttribute('v') ?? '-1', 10)];
    const rvb = fbk ? descendants(fbk, 'rvb')[0] : undefined;
    const rvIndex = rvb ? parseInt(rvb.getAttribute('i') ?? '-1', 10) : -1;
    const rv = rvs[rvIndex];
    if (!rv) {
      result.problems.push(`The in-cell picture at row ${cell.row} has an invalid rich-value reference.`);
      continue;
    }
    const struct = structs[parseInt(rv.getAttribute('s') ?? '0', 10)];
    const keys = struct ? elementChildren(struct, 'k').map((k) => k.getAttribute('n') ?? '') : [];
    if (struct && !/image/i.test(struct.getAttribute('t') ?? '') && !keys.includes('_rvRel:LocalImageIdentifier')) {
      result.notes.push(`Cell at row ${cell.row} contains a rich value that is not a picture (e.g. a linked data type); it was ignored.`);
      continue;
    }
    if (struct && (struct.getAttribute('t') ?? '').toLowerCase().includes('webimage')) {
      result.problems.push(`The in-cell picture at row ${cell.row} is a web image (IMAGE() formula / online picture). Only pictures stored inside the file can be read.`);
      continue;
    }
    const keyIndex = Math.max(0, keys.indexOf('_rvRel:LocalImageIdentifier'));
    const values = elementChildren(rv, 'v');
    const relIndex = parseInt(textOf(values[keyIndex] ?? null), 10);
    const rel = relMap.get(relIds[relIndex] ?? '');
    const bytes = rel && !rel.external ? await readBytes(zip, rel.target) : null;
    if (!rel || !bytes) {
      result.problems.push(`The in-cell picture at row ${cell.row} references an image that is missing from the file.`);
      continue;
    }
    result.images.push({ row: cell.row, col: cell.col, bytes, format: detectImageFormat(bytes), kind: 'in-cell', mediaPath: rel.target });
  }
}

/** Extracts every picture attached to cells of the given worksheet. */
export async function extractSheetImages(zip: JSZip, sheetName: string): Promise<ExtractionResult> {
  const result: ExtractionResult = { images: [], problems: [], notes: [] };
  const parts = await sheetPartPaths(zip);
  const entry = [...parts.entries()].find(([n]) => n.toLowerCase() === sheetName.toLowerCase());
  if (!entry) return result;
  await extractDrawingImages(zip, entry[1], result);
  await extractInCellImages(zip, entry[1], result);
  return result;
}

/** Lists sheets (other than the given one) that contain drawings, charts or pictures. */
export async function sheetsWithDrawings(zip: JSZip): Promise<Map<string, { pictures: number; charts: number }>> {
  const out = new Map<string, { pictures: number; charts: number }>();
  for (const [name, part] of await sheetPartPaths(zip)) {
    const rels = await readRels(zip, part);
    let pictures = 0;
    let charts = 0;
    for (const r of rels.values()) {
      if (!r.type.endsWith('/drawing') || r.external) continue;
      const xml = await readText(zip, r.target);
      if (!xml) continue;
      const doc = parseXml(xml);
      pictures += descendants(doc, 'pic').length;
      charts += descendants(doc, 'graphicFrame').length;
    }
    if (pictures || charts) out.set(name, { pictures, charts });
  }
  return out;
}
