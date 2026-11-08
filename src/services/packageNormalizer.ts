import JSZip from 'jszip';
import { attrLocal, descendants, parseXml, relsPathFor, resolvePartPath } from '../utils/xml';

/**
 * ExcelJS finds comments, notes (VML) and tables by the exact relationship path,
 * and only understands the names Excel itself writes (e.g. "../comments1.xml").
 * Files saved by Google Sheets, LibreOffice, WPS, openpyxl and others often use
 * absolute paths ("/xl/comments1.xml") or other file names, and ExcelJS then crashes
 * ("Cannot read properties of undefined (reading 'comments')").
 *
 * This rewrites an in-memory COPY of the package into Excel's naming. The uploaded
 * file itself is never changed. Pictures are read separately and are not affected.
 */

const REL = {
  worksheet: '/worksheet',
  comments: '/comments',
  vml: '/vmlDrawing',
  table: '/table',
};

interface Canon {
  test: RegExp;
  /** Canonical part path for index k. */
  part: (k: number) => string;
  /** Target as written in the sheet rels (what ExcelJS uses as a lookup key). */
  target: (k: number) => string;
}

const CANON: Record<'comments' | 'vml' | 'table', Canon> = {
  comments: { test: /^xl\/comments(\d+)\.xml$/, part: (k) => `xl/comments${k}.xml`, target: (k) => `../comments${k}.xml` },
  vml: { test: /^xl\/drawings\/vmlDrawing(\d+)\.vml$/, part: (k) => `xl/drawings/vmlDrawing${k}.vml`, target: (k) => `../drawings/vmlDrawing${k}.vml` },
  table: { test: /^xl\/tables\/table(\d+)\.xml$/, part: (k) => `xl/tables/table${k}.xml`, target: (k) => `../tables/table${k}.xml` },
};

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

function freeIndex(zip: JSZip, canon: Canon, taken: Set<string>): number {
  let k = 1;
  while (zip.file(canon.part(k)) || taken.has(canon.part(k))) k++;
  return k;
}

function relType(rel: Element): string {
  return rel.getAttribute('Type') ?? '';
}

function isType(rel: Element, suffix: string): boolean {
  return relType(rel).endsWith(suffix);
}

/** Makes every internal (non-external) target in a .rels document absolute ("/xl/..."), so the owner part can move. */
function absolutizeTargets(doc: Document, ownerPart: string) {
  for (const rel of descendants(doc, 'Relationship')) {
    if (rel.getAttribute('TargetMode') === 'External') continue;
    const t = rel.getAttribute('Target');
    if (t) rel.setAttribute('Target', '/' + resolvePartPath(ownerPart, t));
  }
}

export interface NormalizeResult {
  buffer: ArrayBuffer;
  changed: boolean;
  /** Parts that were referenced but missing and had to be ignored. */
  dropped: string[];
}

/**
 * @param lenient also strips comments/notes/tables completely (last-resort fallback)
 */
export async function normalizeForExcelJS(input: ArrayBuffer, lenient = false): Promise<NormalizeResult> {
  const zip = await JSZip.loadAsync(input);
  let changed = false;
  const dropped: string[] = [];
  const taken = new Set<string>();

  // ---- 1. Worksheets must be xl/worksheets/sheetN.xml ----
  const wbRelsPath = 'xl/_rels/workbook.xml.rels';
  const wbRelsXml = await zip.file(wbRelsPath)?.async('string');
  const sheetParts: string[] = [];
  if (wbRelsXml) {
    const doc = parseXml(wbRelsXml);
    let wbChanged = false;
    for (const rel of descendants(doc, 'Relationship')) {
      if (!isType(rel, REL.worksheet)) continue;
      const target = rel.getAttribute('Target') ?? '';
      let part = resolvePartPath('xl/workbook.xml', target);
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(part) && zip.file(part)) {
        let k = 1;
        while (zip.file(`xl/worksheets/sheet${k}.xml`) || taken.has(`xl/worksheets/sheet${k}.xml`)) k++;
        const newPart = `xl/worksheets/sheet${k}.xml`;
        taken.add(newPart);
        zip.file(newPart, await zip.file(part)!.async('uint8array'));
        const oldRels = await zip.file(relsPathFor(part))?.async('string');
        if (oldRels) {
          const rd = parseXml(oldRels);
          absolutizeTargets(rd, part);
          zip.file(relsPathFor(newPart), serialize(rd));
        }
        part = newPart;
        wbChanged = true;
      }
      const wanted = part.replace(/^xl\//, '');
      if (rel.getAttribute('Target') !== wanted) {
        rel.setAttribute('Target', wanted);
        wbChanged = true;
      }
      sheetParts.push(part);
    }
    if (wbChanged) {
      zip.file(wbRelsPath, serialize(doc));
      changed = true;
    }
  }

  // ---- 2. Comments, notes and tables referenced by each sheet ----
  for (const sheetPart of sheetParts) {
    const relsPath = relsPathFor(sheetPart);
    const relsXml = await zip.file(relsPath)?.async('string');
    if (!relsXml) continue;
    const doc = parseXml(relsXml);
    let relsChanged = false;
    const removedIds = new Set<string>();
    const tableIds = new Set<string>();

    for (const rel of descendants(doc, 'Relationship')) {
      const kind = isType(rel, REL.comments) ? 'comments' : isType(rel, REL.vml) ? 'vml' : isType(rel, REL.table) ? 'table' : null;
      if (!kind || rel.getAttribute('TargetMode') === 'External') continue;
      const canon = CANON[kind];
      const part = resolvePartPath(sheetPart, rel.getAttribute('Target') ?? '');
      const id = rel.getAttribute('Id') ?? '';
      if (lenient || !zip.file(part)) {
        if (!lenient) dropped.push(part);
        rel.parentNode?.removeChild(rel);
        removedIds.add(id);
        relsChanged = true;
        continue;
      }
      let k: number;
      const m = canon.test.exec(part);
      if (m && !taken.has(part)) {
        k = parseInt(m[1], 10);
      } else {
        k = freeIndex(zip, canon, taken);
        zip.file(canon.part(k), await zip.file(part)!.async('uint8array'));
        if (kind === 'vml') {
          // VML may reference images relative to its own folder.
          const vRels = await zip.file(relsPathFor(part))?.async('string');
          if (vRels) {
            const vd = parseXml(vRels);
            absolutizeTargets(vd, part);
            zip.file(relsPathFor(canon.part(k)), serialize(vd));
          }
        }
      }
      taken.add(canon.part(k));
      if (rel.getAttribute('Target') !== canon.target(k)) {
        rel.setAttribute('Target', canon.target(k));
        relsChanged = true;
      }
      if (kind === 'table') tableIds.add(id);
    }

    // The sheet must not point at relationships that no longer exist (ExcelJS crashes on <tablePart> without a table).
    const sheetXml = await zip.file(sheetPart)?.async('string');
    if (sheetXml && /<(?:\w+:)?tablePart\b|<(?:\w+:)?legacyDrawing\b/.test(sheetXml)) {
      const sd = parseXml(sheetXml);
      let sheetChanged = false;
      for (const tp of descendants(sd, 'tablePart')) {
        const rid = attrLocal(tp, 'id') ?? '';
        if (!tableIds.has(rid)) {
          tp.parentNode?.removeChild(tp);
          sheetChanged = true;
        }
      }
      for (const ld of descendants(sd, 'legacyDrawing')) {
        if (removedIds.has(attrLocal(ld, 'id') ?? '')) {
          ld.parentNode?.removeChild(ld);
          sheetChanged = true;
        }
      }
      for (const parts of descendants(sd, 'tableParts')) {
        if (descendants(parts, 'tablePart').length === 0) parts.parentNode?.removeChild(parts);
        else parts.setAttribute('count', String(descendants(parts, 'tablePart').length));
      }
      if (sheetChanged) {
        zip.file(sheetPart, serialize(sd));
        changed = true;
      }
    }
    if (relsChanged) {
      zip.file(relsPath, serialize(doc));
      changed = true;
    }
  }

  if (!changed) return { buffer: input, changed: false, dropped };
  const out = await zip.generateAsync({ type: 'uint8array' });
  return { buffer: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, changed, dropped };
}

/** Loads a workbook into ExcelJS, repairing package paths first and falling back to a lenient copy if needed. */
export async function loadIntoExcelJS<T extends { xlsx: { load: (b: ArrayBuffer) => Promise<unknown> } }>(
  make: () => T,
  buffer: ArrayBuffer,
): Promise<{ wb: T; lenient: boolean; dropped: string[] }> {
  const normal = await normalizeForExcelJS(buffer.slice(0));
  try {
    const wb = make();
    await wb.xlsx.load(normal.buffer);
    return { wb, lenient: false, dropped: normal.dropped };
  } catch (first) {
    const lenient = await normalizeForExcelJS(buffer.slice(0), true);
    try {
      const wb = make();
      await wb.xlsx.load(lenient.buffer);
      return { wb, lenient: true, dropped: normal.dropped };
    } catch {
      throw first;
    }
  }
}
