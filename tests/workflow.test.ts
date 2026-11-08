import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { blankSession } from '../src/services/blankWorkbook';
import { buildWorkbook } from '../src/services/excelExport';
import { importWorkbook } from '../src/services/excelImport';
import { createPhoto } from '../src/services/imageProcessing';
import { allKnownIds, initialSession, sessionReducer, summarizeChanges, type SessionState } from '../src/state/sessionReducer';
import { INVENTORY_COLUMNS, type InventoryItem } from '../src/types/inventory';
import { nowStamp } from '../src/utils/dates';
import { nextInventoryId, uid } from '../src/utils/ids';
import { addInCellPicture, EXISTING_JPEG, EXISTING_PNG, INCELL_PNG, makeExistingWorkbook, makePng, picturesByRow, sha, toArrayBuffer } from './helpers';

const OUT = join(__dirname, '..', 'test-output');
mkdirSync(OUT, { recursive: true });

const exportOf = (s: SessionState) =>
  buildWorkbook({ items: s.items, categories: s.categories, locations: s.locations, context: s.context! });

async function readBack(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(bytes));
  return wb;
}

describe('Full workflow (spec section 18)', () => {
  let fixture: Uint8Array;
  let fixtureHash: string;
  let state: SessionState;
  let exported: Uint8Array;
  const expectedPhotoById = new Map<string, string>(); // ID → sha of embedded image

  beforeAll(async () => {
    fixture = await makeExistingWorkbook();
    fixtureHash = sha(fixture);
    writeFileSync(join(OUT, '0-existing-input.xlsx'), fixture);
  });

  it('1. imports the workbook with records, photos, categories and locations', async () => {
    const session = await importWorkbook(toArrayBuffer(fixture), 'Inventory.xlsx');
    expect(session.items.map((i) => i.id)).toEqual(['INV-001', 'INV-002', 'INV-003']);
    expect(session.items[0]).toMatchObject({ name: 'Dell Latitude 5440', quantity: 4, createdDate: '2026-01-15 09:30', addedBy: 'Aigerim' });
    expect(session.items[1].createdDate).toBe('2026-02-03');
    expect(sha(session.items[0].photo!.bytes)).toBe(sha(EXISTING_PNG)); // one-cell anchor
    expect(sha(session.items[1].photo!.bytes)).toBe(sha(EXISTING_JPEG)); // two-cell anchor
    expect(session.items[0].photo!.width).toBe(64);
    expect(session.items[2].photo).toBeNull();
    expect(session.items[2].photoText).toBe('placeholder');
    expect(session.categories).toEqual(['Electronics', 'Furniture', 'IT Equipment', 'Tools']);
    expect(session.locations).toHaveLength(3);
    expect(session.report.issues.filter((i) => i.level !== 'info')).toEqual([]);
    state = sessionReducer(initialSession, { type: 'LOAD', session });
    expect(summarizeChanges(state)).toMatchObject({ added: 0, edited: 0, deleted: 0, unsaved: false });
    expectedPhotoById.set('INV-001', sha(EXISTING_PNG));
    expectedPhotoById.set('INV-002', sha(EXISTING_JPEG));
  });

  it('2–3. adds 10 records, each with a photo, with unique generated IDs', () => {
    for (let n = 0; n < 10; n++) {
      const id = nextInventoryId(allKnownIds(state));
      const bytes = makePng(80 + n * 10, 60, [n * 20, 100, 255 - n * 20], n);
      const stamp = nowStamp();
      const item: InventoryItem = {
        uid: uid('it'),
        id,
        name: `Sample item ${n + 1}`,
        category: n % 2 ? 'Tools' : 'Electronics',
        quantity: n + 1,
        location: 'Main Warehouse',
        description: `Description ${n + 1}`,
        photo: createPhoto(bytes, 'png', 'new'),
        photoText: '',
        addedBy: 'Tester',
        createdDate: stamp,
        updatedDate: stamp,
        extra: {},
      };
      state = sessionReducer(state, { type: 'ADD_ITEM', item });
      expectedPhotoById.set(id, sha(bytes));
    }
    const ids = state.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids.slice(3)).toEqual(['INV-004', 'INV-005', 'INV-006', 'INV-007', 'INV-008', 'INV-009', 'INV-010', 'INV-011', 'INV-012', 'INV-013']);
  });

  it('4. edits 2 existing records (keeps ID and CREATED_DATE, replaces one photo only)', () => {
    const a = state.items.find((i) => i.id === 'INV-001')!;
    state = sessionReducer(state, { type: 'UPDATE_ITEM', item: { ...a, name: 'Dell Latitude 5440 (updated)', quantity: 6, updatedDate: '2026-11-06 12:00' } });
    const b = state.items.find((i) => i.id === 'INV-002')!;
    const replacement = makePng(50, 50, [250, 200, 0], 9);
    state = sessionReducer(state, { type: 'UPDATE_ITEM', item: { ...b, photo: createPhoto(replacement, 'png', 'new'), updatedDate: '2026-11-06 12:05' } });
    expectedPhotoById.set('INV-002', sha(replacement));
    expect(state.items.find((i) => i.id === 'INV-001')!.createdDate).toBe('2026-01-15 09:30');
  });

  it('5. deletes exactly 1 record', () => {
    const target = state.items.find((i) => i.id === 'INV-003')!;
    state = sessionReducer(state, { type: 'DELETE_ITEM', uid: target.uid });
    expect(state.items).toHaveLength(12);
    expect(state.items.some((i) => i.id === 'INV-003')).toBe(false);
  });

  it('6–7. adds 2 categories and 1 location; refuses to delete a used category', () => {
    state = sessionReducer(state, { type: 'LIST_ADD', list: 'categories', name: 'Safety Equipment' });
    state = sessionReducer(state, { type: 'LIST_ADD', list: 'categories', name: 'Vehicles' });
    state = sessionReducer(state, { type: 'LIST_ADD', list: 'locations', name: 'Building C - Floor 3 - Room 305' });
    const before = state.categories.length;
    state = sessionReducer(state, { type: 'LIST_DELETE', list: 'categories', name: 'Tools' }); // used → ignored
    expect(state.categories).toHaveLength(before);
    expect(summarizeChanges(state)).toMatchObject({ added: 10, edited: 2, deleted: 1, categoriesAdded: 2, locationsAdded: 1, unsaved: true });
  });

  it('8. exports the workbook, and the original upload stays byte-for-byte unchanged', async () => {
    exported = await exportOf(state);
    writeFileSync(join(OUT, '1-exported.xlsx'), exported);
    expect(sha(fixture)).toBe(fixtureHash);
    expect(sha(new Uint8Array(state.context!.originalBuffer!))).toBe(fixtureHash);
  });

  it('9–10. exported workbook has the exact structure, records and formatting', async () => {
    const wb = await readBack(exported);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Inventory', 'Categories', 'Locations', 'Instructions']);
    const inv = wb.getWorksheet('Inventory')!;
    expect((inv.getRow(1).values as unknown[]).slice(1)).toEqual([...INVENTORY_COLUMNS]);
    const ids: string[] = [];
    for (let r = 2; r <= inv.rowCount; r++) ids.push(String(inv.getCell(r, 1).value));
    expect(ids).toEqual(state.items.map((i) => i.id));
    const r1 = inv.getRow(2);
    expect(r1.getCell(2).value).toBe('Dell Latitude 5440 (updated)');
    expect(r1.getCell(4).value).toBe(6);
    expect((r1.getCell(9).value as Date).toISOString()).toBe('2026-01-15T09:30:00.000Z');
    expect((r1.getCell(10).value as Date).toISOString()).toBe('2026-11-06T12:00:00.000Z');
    // Formatting
    const h = inv.getCell('A1');
    expect((h.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF2563EB');
    expect(h.font.color?.argb).toBe('FFFFFFFF');
    expect(inv.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(inv.autoFilter).toBeTruthy();
    expect(inv.getColumn(7).width).toBe(20);
    // Lists
    expect(wb.getWorksheet('Categories')!.getColumn(1).values.slice(1)).toEqual(['CATEGORY', 'Electronics', 'Furniture', 'IT Equipment', 'Tools', 'Safety Equipment', 'Vehicles']);
    expect(wb.getWorksheet('Locations')!.getColumn(1).values.slice(1)).toContain('Building C - Floor 3 - Room 305');
  });

  it('11–12. every photo is embedded in its own row, in the PHOTO column (independent ZIP check)', async () => {
    const pics = await picturesByRow(exported);
    expect(pics).toHaveLength(12);
    state.items.forEach((item, i) => {
      const pic = pics.find((p) => p.row === i + 2);
      expect(pic, `photo for ${item.id}`).toBeTruthy();
      expect(pic!.col).toBe(7);
      expect(pic!.sha).toBe(expectedPhotoById.get(item.id));
      expect(pic!.editAs).toBe('twoCell');
    });
    expect(pics.some((p) => p.sha === sha(EXISTING_JPEG))).toBe(false); // replaced photo is gone
  });

  it('preserves the original Instructions sheet (values, formula, merge, styles, sizes)', async () => {
    const wb = await readBack(exported);
    const ins = wb.getWorksheet('Instructions')!;
    expect(ins.getCell('A1').value).toBe('HOW TO USE THIS FILE');
    expect(ins.getCell('A1').font.size).toBe(18);
    expect(ins.getCell('A1').font.bold).toBe(true);
    expect(ins.getCell('B1').isMerged).toBe(true);
    expect(ins.getCell('A3').value).toBe('Upload this file to Inventory Manager, edit, then download.');
    expect((ins.getCell('A4').value as ExcelJS.CellFormulaValue).formula).toBe('ROWS(Categories!A2:A5)');
    expect(ins.getColumn(1).width).toBe(90);
    expect(ins.getRow(3).height).toBe(40);
  });

  it('13–14. re-importing the exported workbook reads everything back identically', async () => {
    const again = await importWorkbook(toArrayBuffer(exported), '1-exported.xlsx');
    expect(again.report.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(again.items).toHaveLength(12);
    again.items.forEach((it, i) => {
      const src = state.items[i];
      expect({ ...it, uid: '', photo: null, sourceRow: 0 }).toEqual({ ...src, uid: '', photo: null, sourceRow: 0 });
      expect(sha(it.photo!.bytes)).toBe(expectedPhotoById.get(it.id));
    });
    expect(again.categories).toEqual(state.categories);
    expect(again.locations).toEqual(state.locations);
  });

  it('exporting does not clear the session; more edits can be exported again', async () => {
    state = sessionReducer(state, { type: 'MARK_EXPORTED', fileName: 'x.xlsx' });
    expect(state.items).toHaveLength(12);
    expect(summarizeChanges(state)).toMatchObject({ added: 10, edited: 2, deleted: 1, unsaved: false });
    const last = state.items[state.items.length - 1];
    state = sessionReducer(state, { type: 'UPDATE_ITEM', item: { ...last, photo: null, updatedDate: nowStamp() } });
    expect(summarizeChanges(state).unsaved).toBe(true);
    const second = await exportOf(state);
    writeFileSync(join(OUT, '2-exported-again.xlsx'), second);
    const pics = await picturesByRow(second);
    expect(pics).toHaveLength(11); // only that one item's photo removed
    expect(pics.find((p) => p.row === state.items.length + 1)).toBeUndefined();
    expect(sha(new Uint8Array(state.context!.originalBuffer!))).toBe(fixtureHash);
  });
});

describe('Excel 365 "Place in Cell" pictures', () => {
  it('reads in-cell pictures and exports them as cell-fitted pictures', async () => {
    const withInCell = await addInCellPicture(await makeExistingWorkbook());
    writeFileSync(join(OUT, '3-incell-input.xlsx'), withInCell);
    const s = await importWorkbook(toArrayBuffer(withInCell), 'incell.xlsx');
    const inv3 = s.items.find((i) => i.id === 'INV-003')!;
    expect(inv3.photo).not.toBeNull();
    expect(sha(inv3.photo!.bytes)).toBe(sha(INCELL_PNG));
    expect(s.report.issues.some((i) => i.message.includes('Place in Cell'))).toBe(true);
    const out = await buildWorkbook({ ...s });
    const pics = await picturesByRow(out);
    expect(pics.find((p) => p.row === 4)?.sha).toBe(sha(INCELL_PNG));
  });
});

describe('Template and edge cases', () => {
  it('generates a blank template with the exact four-sheet structure', async () => {
    const s = blankSession();
    const bytes = await buildWorkbook(s);
    writeFileSync(join(OUT, 'Inventory_Template.xlsx'), bytes);
    const wb = await readBack(bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Inventory', 'Categories', 'Locations', 'Instructions']);
    expect((wb.getWorksheet('Inventory')!.getRow(1).values as unknown[]).slice(1)).toEqual([...INVENTORY_COLUMNS]);
    const back = await importWorkbook(toArrayBuffer(bytes), 'Inventory_Template.xlsx');
    expect(back.items).toEqual([]);
    expect(back.categories).toEqual(s.categories);
    expect(back.report.issues.filter((i) => i.level !== 'info')).toEqual([]);
  });

  it('rejects files that are not xlsx with a clear message', async () => {
    await expect(importWorkbook(toArrayBuffer(new TextEncoder().encode('hello world, not excel')), 'a.xlsx')).rejects.toThrow(/not a valid \.xlsx/);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(importWorkbook(toArrayBuffer(ole), 'a.xlsx')).rejects.toThrow(/password-protected or an old \.xls/);
  });

  it('reports a missing Inventory sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').addRow(['a']);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
    await expect(importWorkbook(toArrayBuffer(bytes), 'a.xlsx')).rejects.toThrow(/No "Inventory" worksheet/);
  });

  it('warns about duplicate IDs and non-numeric quantities instead of dropping rows', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory');
    ws.addRow([...INVENTORY_COLUMNS]);
    ws.addRow(['INV-001', 'A', '', 'many', '', '', '', '', '', '']);
    ws.addRow(['INV-001', 'B', '', 2, '', '', '', '', '', '']);
    const s = await importWorkbook(toArrayBuffer(new Uint8Array(await wb.xlsx.writeBuffer())), 'a.xlsx');
    expect(s.items).toHaveLength(2);
    const text = s.report.issues.map((i) => i.message).join('\n');
    expect(text).toMatch(/Duplicate IDs found: INV-001/);
    expect(text).toMatch(/QUANTITY is not a number in row 2/);
    expect(nextInventoryId(s.items.map((i) => i.id))).toBe('INV-002');
  });
});

describe('Privacy', () => {
  it('source code never uses persistent browser storage or network APIs', () => {
    const files: string[] = [];
    const walk = (d: string) =>
      readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      });
    walk(join(__dirname, '..', 'src'));
    const forbidden = /\b(localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket)\b/;
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const offenders = files.filter((f) => forbidden.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('Real Excel 365 file', () => {
  it('reads a "Place in Cell" picture created by Microsoft Excel itself (Range.InsertPictureInCell)', async () => {
    // Fixture: the test workbook opened in Excel 365, picture inserted into G4 (INV-003) with "Place in Cell", saved by Excel.
    const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'excel365-in-cell-picture.xlsx')));
    const s = await importWorkbook(toArrayBuffer(bytes), 'excel365.xlsx');
    expect(s.items.map((i) => i.id)).toEqual(['INV-001', 'INV-002', 'INV-003']);
    expect(sha(s.items[0].photo!.bytes)).toBe(sha(EXISTING_PNG)); // floating pictures survived Excel's save
    expect(sha(s.items[1].photo!.bytes)).toBe(sha(EXISTING_JPEG));
    const p3 = s.items[2].photo;
    expect(p3).not.toBeNull();
    expect(p3!.ext).toBe('png');
    expect(p3!.width).toBe(120);
    expect(s.report.issues.filter((i) => i.level !== 'info')).toEqual([]);
    const out = await buildWorkbook(s);
    writeFileSync(join(OUT, '5-real-excel-incell-reexported.xlsx'), out);
    const pics = await picturesByRow(out);
    expect(pics.map((p) => p.row).sort()).toEqual([2, 3, 4]);
    expect(pics.find((p) => p.row === 4)!.sha).toBe(sha(p3!.bytes));
  });
});

describe('Workbooks saved by other programs (non-Excel part paths)', () => {
  async function workbookWithNotesAndTable(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventory');
    ws.addTable({
      name: 'InventoryTable',
      ref: 'A1',
      columns: INVENTORY_COLUMNS.map((name) => ({ name })),
      rows: [
        ['INV-001', 'Chair', 'Furniture', 3, 'Room 1', '', '', 'A', '2026-01-01', '2026-01-01'],
        ['INV-002', 'Desk', 'Furniture', 1, 'Room 2', '', '', 'B', '2026-01-02', '2026-01-02'],
      ],
    });
    ws.getCell('B2').note = 'A note on the chair';
    const pic = wb.addImage({ buffer: Buffer.from(EXISTING_PNG) as never, extension: 'png' });
    ws.addImage(pic, { tl: { col: 6, row: 1 }, ext: { width: 60, height: 45 } } as never);
    wb.addWorksheet('Instructions').getCell('A1').value = 'Read me';
    wb.getWorksheet('Instructions')!.getCell('A1').note = 'Note on instructions';
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  /** Rewrites parts the way Google Sheets / openpyxl / LibreOffice-style writers do. */
  async function rewrite(bytes: Uint8Array, style: 'absolute' | 'renamed' | 'missing'): Promise<Uint8Array> {
    const zip = await JSZip.loadAsync(bytes);
    for (const relsPath of Object.keys(zip.files).filter((p) => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(p))) {
      let rels = await zip.file(relsPath)!.async('string');
      if (style === 'absolute') {
        rels = rels.replace(/Target="\.\.\/(comments\d+\.xml|drawings\/vmlDrawing\d+\.vml|tables\/table\d+\.xml)"/g, 'Target="/xl/$1"');
      } else if (style === 'renamed') {
        for (const m of [...rels.matchAll(/Target="\.\.\/(comments(\d+))\.xml"/g)]) {
          const data = await zip.file(`xl/${m[1]}.xml`)!.async('uint8array');
          zip.remove(`xl/${m[1]}.xml`);
          zip.file(`xl/notes/sheetNotes_${m[2]}.xml`, data);
          rels = rels.replace(m[0], `Target="../notes/sheetNotes_${m[2]}.xml"`);
        }
      } else {
        for (const m of [...rels.matchAll(/Target="\.\.\/(comments\d+\.xml)"/g)]) zip.remove(`xl/${m[1]}`);
      }
      zip.file(relsPath, rels);
    }
    return zip.generateAsync({ type: 'uint8array' });
  }

  it('the unrepaired file really crashes ExcelJS (reproduces the reported error)', async () => {
    const bad = await rewrite(await workbookWithNotesAndTable(), 'absolute');
    const wb = new ExcelJS.Workbook();
    await expect(wb.xlsx.load(toArrayBuffer(bad))).rejects.toThrow(/reading '(comments|name)'/);
  });

  for (const style of ['absolute', 'renamed', 'missing'] as const) {
    it(`imports and exports a file with ${style} comment/table paths`, async () => {
      const bad = await rewrite(await workbookWithNotesAndTable(), style);
      writeFileSync(join(OUT, `6-other-writer-${style}.xlsx`), bad);
      const before = sha(bad);
      const s = await importWorkbook(toArrayBuffer(bad), 'other.xlsx');
      expect(s.items.map((i) => i.id)).toEqual(['INV-001', 'INV-002']);
      expect(sha(s.items[0].photo!.bytes)).toBe(sha(EXISTING_PNG));
      expect(s.report.issues.filter((i) => i.level === 'error')).toEqual([]);
      const out = await buildWorkbook(s);
      const back = await importWorkbook(toArrayBuffer(out), 'back.xlsx');
      expect(back.items.map((i) => i.name)).toEqual(['Chair', 'Desk']);
      expect(sha(back.items[0].photo!.bytes)).toBe(sha(EXISTING_PNG));
      const wb = await readBack(out);
      expect(wb.getWorksheet('Instructions')!.getCell('A1').value).toBe('Read me');
      expect(sha(bad)).toBe(before);
      expect(sha(new Uint8Array(s.context.originalBuffer!))).toBe(before);
    });
  }
});

describe('Excel 365 "Place in Cell" export mode', () => {
  it('writes every photo as an in-cell picture in its own PHOTO cell and reads it back', async () => {
    const s = await importWorkbook(toArrayBuffer(await makeExistingWorkbook()), 'in.xlsx');
    let st = sessionReducer(initialSession, { type: 'LOAD', session: s });
    const extra = makePng(300, 200, [99, 102, 241], 4);
    st = sessionReducer(st, {
      type: 'ADD_ITEM',
      item: { uid: uid('it'), id: 'INV-004', name: 'Ladder <3m> & "tall"', category: 'Tools', quantity: 2, location: '', description: '', photo: createPhoto(extra, 'png', 'new'), photoText: '', addedBy: '', createdDate: nowStamp(), updatedDate: nowStamp(), extra: {} },
    });
    const out = await buildWorkbook({ items: st.items, categories: st.categories, locations: st.locations, context: st.context!, photoMode: 'in-cell' });
    writeFileSync(join(OUT, '7-in-cell-export.xlsx'), out);
    expect(await picturesByRow(out)).toEqual([]); // no floating pictures
    const zip = await JSZip.loadAsync(out);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet.match(/<c r="G\d+"[^>]*t="e" vm="\d+"/g)).toHaveLength(3); // INV-001, 002, 004 (003 has no photo)
    const back = await importWorkbook(toArrayBuffer(out), 'back.xlsx');
    expect(back.items.map((i) => i.id)).toEqual(['INV-001', 'INV-002', 'INV-003', 'INV-004']);
    expect(sha(back.items[0].photo!.bytes)).toBe(sha(EXISTING_PNG));
    expect(sha(back.items[1].photo!.bytes)).toBe(sha(EXISTING_JPEG));
    expect(back.items[2].photo).toBeNull();
    expect(back.items[2].photoText).toBe('placeholder');
    expect(sha(back.items[3].photo!.bytes)).toBe(sha(extra));
    expect(back.items[3].name).toBe('Ladder <3m> & "tall"');
  });
});
