/** Writes Inventory_Template.xlsx (exact four-sheet structure) using the app's own export service. */
import '../tests/setup';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { blankSession } from '../src/services/blankWorkbook';
import { buildWorkbook } from '../src/services/excelExport';

const target = join(resolve(__dirname, '..'), 'Inventory_Template.xlsx');
buildWorkbook(blankSession()).then((bytes) => {
  writeFileSync(target, bytes);
  console.log(`Wrote ${target} (${bytes.length} bytes)`);
});
