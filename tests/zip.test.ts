import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importWorkbook } from '../src/services/excelImport';
import { createPhoto } from '../src/services/imageProcessing';
import { buildExportZip, importUpload } from '../src/services/zipPackage';
import { initialSession, sessionReducer } from '../src/state/sessionReducer';
import { INVENTORY_COLUMNS, type InventoryItem } from '../src/types/inventory';
import { nowStamp } from '../src/utils/dates';
import { uid } from '../src/utils/ids';
import { EXISTING_JPEG, EXISTING_PNG, makeExistingWorkbook, makePng, picturesByRow, sha, TINY_JPEG, toArrayBuffer } from './helpers';

const OUT = join(__dirname, '..', 'test-output');
mkdirSync(OUT, { recursive: true });

async function sessionWithPhotos() {
  const s = await importWorkbook(toArrayBuffer(await makeExistingWorkbook()), 'Inventory.xlsx');
  let st = sessionReducer(initialSession, { type: 'LOAD', session: s });
  const mk = (id: string, name: string, bytes: Uint8Array): InventoryItem => ({
    uid: uid('it'),
    id,
    name,
    category: 'Tools',
    quantity: 1,
    location: '',
    description: '',
    photo: createPhoto(bytes, 'png', 'new'),
    photoText: '',
    addedBy: '',
    createdDate: nowStamp(),
    updatedDate: nowStamp(),
    extra: {},
  });
  st = sessionReducer(st, { type: 'ADD_ITEM', item: mk('INV-004', 'Drill', makePng(40, 30, [10, 200, 10], 1)) });
  st = sessionReducer(st, { type: 'ADD_ITEM', item: mk('BOX 7/A', 'Odd ID', makePng(40, 30, [200, 10, 10], 2)) });
  st = sessionReducer(st, { type: 'ADD_ITEM', item: mk('INV-004', 'Duplicate ID', makePng(40, 30, [10, 10, 200], 3)) });
  return st;
}

const zipOf = async (st: Awaited<ReturnType<typeof sessionWithPhotos>>, name = 'Inventory_updated.xlsx') =>
  buildExportZip({ items: st.items, categories: st.categories, locations: st.locations, context: st.context! }, name);

describe('ZIP download: Excel + assets folder with photo links', () => {
  it('builds a ZIP with the workbook, assets/ photos and README; PHOTO cells are clickable links', async () => {
    const st = await sessionWithPhotos();
    const zipBytes = await zipOf(st);
    writeFileSync(join(OUT, '9-export.zip'), zipBytes);
    const zip = await JSZip.loadAsync(zipBytes);
    const names = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(names).toEqual(['Inventory_updated.xlsx', 'README.txt', 'assets/BOX_7_A.png', 'assets/INV-001.png', 'assets/INV-002.jpg', 'assets/INV-004.png', 'assets/INV-004_2.png']);
    expect(sha(await zip.file('assets/INV-001.png')!.async('uint8array'))).toBe(sha(EXISTING_PNG));
    expect(sha(await zip.file('assets/INV-002.jpg')!.async('uint8array'))).toBe(sha(EXISTING_JPEG));

    const xlsx = await zip.file('Inventory_updated.xlsx')!.async('uint8array');
    writeFileSync(join(OUT, '9-export-inner.xlsx'), xlsx);
    expect(await picturesByRow(xlsx)).toEqual([]); // photos live in assets/, not inside the workbook
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(xlsx));
    const inv = wb.getWorksheet('Inventory')!;
    expect(inv.getCell('G2').value).toMatchObject({ text: 'assets/INV-001.png', hyperlink: 'assets/INV-001.png' });
    expect((inv.getCell('G6').value as ExcelJS.CellHyperlinkValue).hyperlink).toBe('assets/BOX_7_A.png');
    expect(inv.getCell('G4').value).toBe('placeholder'); // INV-003 has no photo: its text is kept
    expect(inv.getCell('G2').font.underline).toBe(true);
  });

  it('uploading the ZIP restores every photo from assets/', async () => {
    const st = await sessionWithPhotos();
    const back = await importUpload(toArrayBuffer(await zipOf(st)), 'Inventory_updated_2026.zip');
    expect(back.report.fileName).toBe('Inventory_updated_2026.zip');
    // The only warning is the deliberate duplicate ID (INV-004 twice).
    expect(back.report.issues.filter((i) => i.level !== 'info').map((i) => i.message)).toEqual([expect.stringMatching(/^Duplicate IDs found: INV-004/)]);
    expect(back.items.map((i) => i.id)).toEqual(st.items.map((i) => i.id));
    back.items.forEach((it, k) => {
      expect(it.photo ? sha(it.photo.bytes) : null).toBe(st.items[k].photo ? sha(st.items[k].photo!.bytes) : null);
      if (it.photo) expect(it.photoText).toBe('');
    });
    expect(back.items[2].photoText).toBe('placeholder');
  });

  it('works when the ZIP has a top folder (Windows "Send to → Compressed folder")', async () => {
    const flat = await JSZip.loadAsync(await zipOf(await sessionWithPhotos(), 'Inventory.xlsx'));
    const nested = new JSZip();
    for (const [n, f] of Object.entries(flat.files)) if (!f.dir) nested.file(`My Inventory/${n}`, await f.async('uint8array'));
    const back = await importUpload(toArrayBuffer(await nested.generateAsync({ type: 'uint8array' })), 'My Inventory.zip');
    expect(back.items.filter((i) => i.photo)).toHaveLength(5);
  });

  it('reads plain-text paths, Windows backslashes, any letter case, and matches by ID; warns about missing files', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory');
    ws.addRow([...INVENTORY_COLUMNS]);
    ws.addRow(['INV-001', 'A', '', 1, '', '', 'assets\\INV-001.JPG', '', '', '']);
    ws.addRow(['INV-002', 'B', '', 1, '', '', '', '', '', '']); // no link: found by ID
    ws.addRow(['INV-003', 'C', '', 1, '', '', 'assets/missing.png', '', '', '']);
    const zip = new JSZip();
    zip.file('Inventory.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()));
    zip.file('assets/inv-001.jpg', TINY_JPEG);
    zip.file('assets/INV-002.png', EXISTING_PNG);
    const s = await importUpload(toArrayBuffer(await zip.generateAsync({ type: 'uint8array' })), 'x.zip');
    expect(sha(s.items[0].photo!.bytes)).toBe(sha(TINY_JPEG));
    expect(sha(s.items[1].photo!.bytes)).toBe(sha(EXISTING_PNG));
    expect(s.items[2].photo).toBeNull();
    expect(s.items[2].photoText).toBe('assets/missing.png');
    expect(s.report.issues.map((i) => i.message).join('\n')).toMatch(/not in the ZIP: row 4 \(assets\/missing\.png\)/);
  });

  it('uploading only the Excel file explains that the ZIP is needed for the photos', async () => {
    const zip = await JSZip.loadAsync(await zipOf(await sessionWithPhotos(), 'Inventory.xlsx'));
    const xlsx = await zip.file('Inventory.xlsx')!.async('uint8array');
    const s = await importUpload(toArrayBuffer(xlsx), 'Inventory.xlsx');
    expect(s.items.every((i) => !i.photo)).toBe(true);
    expect(s.report.issues.some((i) => i.level === 'warning' && /upload the whole ZIP/.test(i.message))).toBe(true);
  });

  it('rejects a ZIP without an Excel file', async () => {
    const zip = new JSZip();
    zip.file('assets/a.png', EXISTING_PNG);
    await expect(importUpload(toArrayBuffer(await zip.generateAsync({ type: 'uint8array' })), 'a.zip')).rejects.toThrow(/does not contain an Excel workbook/);
  });
});
