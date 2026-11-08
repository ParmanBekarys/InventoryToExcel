import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { INVENTORY_COLUMNS } from '../src/types/inventory';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A real, valid PNG filled with one colour (with a stripe so every image is distinct). */
export function makePng(width: number, height: number, rgb: [number, number, number], seed = 0): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      const stripe = (x + seed) % 7 === 0;
      raw[o] = stripe ? 255 - rgb[0] : rgb[0];
      raw[o + 1] = stripe ? 255 - rgb[1] : rgb[1];
      raw[o + 2] = stripe ? 255 - rgb[2] : rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array()),
    ]),
  );
}

/** Minimal valid 1×1 JPEG. */
export const TINY_JPEG = new Uint8Array(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
);

export const sha = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');

export const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export const EXISTING_PNG = makePng(64, 48, [220, 38, 38], 1);
export const EXISTING_JPEG = TINY_JPEG;

/**
 * Simulates a real user workbook in the template structure, with existing records and
 * photos written by a *different* writer configuration (one-cell and two-cell anchors).
 */
export async function makeExistingWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const inv = wb.addWorksheet('Inventory');
  inv.addRow([...INVENTORY_COLUMNS]);
  inv.addRow(['INV-001', 'Dell Latitude 5440', 'IT Equipment', 4, 'Building A - Floor 1 - Room 101', '14" laptops', null, 'Aigerim', new Date(Date.UTC(2026, 0, 15, 9, 30)), new Date(Date.UTC(2026, 0, 15, 9, 30))]);
  inv.addRow(['INV-002', 'Office chair', 'Furniture', 12, 'Building A - Floor 2 - Room 201', 'Black, ergonomic', null, 'Daniyar', new Date(Date.UTC(2026, 1, 3)), new Date(Date.UTC(2026, 1, 10))]);
  inv.addRow(['INV-003', 'Projector', 'Electronics', 1, 'Main Warehouse', '', 'placeholder', 'Aigerim', '2026-03-01 14:00', '2026-03-01 14:00']);
  inv.getColumn(7).width = 20;
  [2, 3, 4].forEach((r) => (inv.getRow(r).height = 80));
  const pngId = wb.addImage({ buffer: Buffer.from(EXISTING_PNG) as never, extension: 'png' });
  const jpgId = wb.addImage({ buffer: Buffer.from(EXISTING_JPEG) as never, extension: 'jpeg' });
  inv.addImage(pngId, { tl: { col: 6.1, row: 1.1 }, ext: { width: 100, height: 75 } } as never); // oneCellAnchor, row 2
  inv.addImage(jpgId, { tl: { col: 6, row: 2 }, br: { col: 7, row: 3 } } as never); // twoCellAnchor, row 3

  const cats = wb.addWorksheet('Categories');
  ['CATEGORY', 'Electronics', 'Furniture', 'IT Equipment', 'Tools'].forEach((v) => cats.addRow([v]));
  const locs = wb.addWorksheet('Locations');
  ['LOCATION', 'Building A - Floor 1 - Room 101', 'Building A - Floor 2 - Room 201', 'Main Warehouse'].forEach((v) => locs.addRow([v]));

  const ins = wb.addWorksheet('Instructions');
  ins.getColumn(1).width = 90;
  ins.getCell('A1').value = 'HOW TO USE THIS FILE';
  ins.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF2563EB' } };
  ins.mergeCells('A1:C1');
  ins.getCell('A3').value = 'Upload this file to Inventory Manager, edit, then download.';
  ins.getCell('A4').value = { formula: 'ROWS(Categories!A2:A5)', result: 4 } as ExcelJS.CellFormulaValue;
  ins.getRow(3).height = 40;

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export const INCELL_PNG = makePng(30, 30, [16, 185, 129], 3);

/**
 * Adds a "Place in Cell" picture to G4 (INV-003) by writing only the minimal
 * rich-value parts the reader needs. A file saved by real Excel is tested via tests/fixtures.
 */
export async function addInCellPicture(xlsx: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(xlsx);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheet = await zip.file(sheetPath)!.async('string');
  const before = sheet;
  sheet = sheet.replace(/<c r="G4"[^>]*>.*?<\/c>/, '<c r="G4" t="e" vm="1"><v>#VALUE!</v></c>');
  if (sheet === before) throw new Error('G4 not found in fixture');
  zip.file(sheetPath, sheet);
  zip.file(
    'xl/metadata.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="1"><bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="0"/></ext></extLst></bk></futureMetadata><valueMetadata count="1"><bk><rc t="1" v="0"/></bk></valueMetadata></metadata>`,
  );
  zip.file(
    'xl/richData/rdrichvalue.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><rv s="0"><v>0</v><v>5</v></rv></rvData>`,
  );
  zip.file(
    'xl/richData/rdrichvaluestructure.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rvStructures xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/></s></rvStructures>`,
  );
  zip.file(
    'xl/richData/richValueRel.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><rel r:id="rId1"/></richValueRels>`,
  );
  zip.file(
    'xl/richData/_rels/richValueRel.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/incell1.png"/></Relationships>`,
  );
  zip.file('xl/media/incell1.png', INCELL_PNG);
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Independent check of an exported file (does not use the app's extractor):
 * returns, for every picture on the Inventory sheet, its 1-based row/column and image hash.
 */
export async function picturesByRow(xlsx: Uint8Array): Promise<{ row: number; col: number; sha: string; editAs: string }[]> {
  const zip = await JSZip.loadAsync(xlsx);
  const sheetRels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels')?.async('string');
  if (!sheetRels) return [];
  const drawingTarget = /Type="[^"]*\/drawing" Target="([^"]+)"/.exec(sheetRels)?.[1];
  if (!drawingTarget) return [];
  const drawingPath = 'xl/' + drawingTarget.replace('../', '');
  const drawing = await zip.file(drawingPath)!.async('string');
  const drawingRels = await zip.file(drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels')!.async('string');
  const relTarget = new Map<string, string>();
  for (const m of drawingRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget.set(m[1], 'xl/' + m[2].replace('../', ''));
  const out: { row: number; col: number; sha: string; editAs: string }[] = [];
  for (const a of drawing.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)([^>]*)>([\s\S]*?)<\/xdr:\1>/g)) {
    const row = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(a[3])![1]) + 1;
    const col = Number(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/.exec(a[3])![1]) + 1;
    const embed = /r:embed="([^"]+)"/.exec(a[3])![1];
    const bytes = await zip.file(relTarget.get(embed)!)!.async('uint8array');
    out.push({ row, col, sha: sha(bytes), editAs: /editAs="([^"]+)"/.exec(a[2])?.[1] ?? '' });
  }
  return out;
}
