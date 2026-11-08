/**
 * Browser end-to-end check: drives the production build in real Chrome/Edge.
 * Run: npm run build && npm run e2e   (needs `npm test` first to create test-output/ fixtures)
 */
import '../tests/setup';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { importUpload } from '../src/services/zipPackage';
import { makePng, picturesByRow, sha, toArrayBuffer } from '../tests/helpers';

const root = resolve(__dirname, '..');
const out = join(root, 'test-output');
mkdirSync(out, { recursive: true });
const shots = join(out, 'screens');
mkdirSync(shots, { recursive: true });

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`E2E assertion failed: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const fixture = join(out, '0-existing-input.xlsx');
  const fixtureHash = sha(readFileSync(fixture));
  const smallPng = join(out, 'photo-small.png');
  const bigPng = join(out, 'photo-big.png');
  writeFileSync(smallPng, makePng(120, 90, [37, 99, 235], 2));
  writeFileSync(bigPng, makePng(2400, 1800, [234, 88, 12], 5)); // > 1600 px → resized to JPEG in the browser

  const server = await preview({ root, preview: { port: 4399, strictPort: true }, logLevel: 'silent' });
  const url = 'http://localhost:4399/';
  const channel = process.env.E2E_CHANNEL ?? 'chrome';
  const browser = await chromium.launch({ channel, headless: true });
  const errors: string[] = [];
  try {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    let requests = 0;
    page.on('request', (r) => {
      if (!r.url().startsWith(url) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) requests++;
    });

    console.log('Upload');
    await page.goto(url);
    await page.getByText('Welcome to Inventory Manager').waitFor();
    await page.screenshot({ path: join(shots, '01-upload.png') });
    await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(fixture);
    await page.getByText('0-existing-input.xlsx').waitFor();
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
    assert((await page.locator('text=Total Items').locator('..').locator('..').innerText()).includes('3'), 'dashboard shows 3 imported items');

    console.log('Add items with photos');
    const addItem = async (name: string, photo: string, category: string) => {
      await page.goto(`${url}#/add`);
      await page.getByLabel('Name').fill(name);
      await page.locator('#f-cat').selectOption(category);
      await page.locator('input[type=file][accept="image/*"]:not([capture])').setInputFiles(photo);
      await page.locator('img[alt="Item photo preview"]').waitFor();
      await page.getByRole('button', { name: 'Add item', exact: true }).last().click();
      await page.getByRole('heading', { name: 'All inventory' }).waitFor();
    };
    await addItem('Browser item small photo', smallPng, 'Tools');
    await addItem('Browser item big photo', bigPng, 'Furniture');
    assert(await page.getByText('INV-004').first().isVisible(), 'new ID INV-004 generated');
    assert(await page.getByText('INV-005').first().isVisible(), 'new ID INV-005 generated');
    await page.screenshot({ path: join(shots, '02-inventory-desktop.png'), fullPage: true });

    console.log('Edit INV-001');
    const row1 = page.locator('tr', { hasText: 'INV-001' });
    await row1.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Name').fill('Dell Latitude (edited in browser)');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Dell Latitude (edited in browser)').first().waitFor();

    console.log('Delete INV-003');
    await page.locator('tr', { hasText: 'INV-003' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete item' }).click();
    await page.waitForTimeout(200);
    assert((await page.locator('tr', { hasText: 'INV-003' }).count()) === 0, 'INV-003 removed from table');

    console.log('Category + location');
    await page.goto(`${url}#/categories`);
    await page.getByPlaceholder('New category').fill('Vehicles');
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByText('Vehicles').first().waitFor();
    await page.goto(`${url}#/locations`);
    await page.getByPlaceholder('Building A - Floor 1 - Room 101').fill('Building C - Floor 3 - Room 305');
    await page.getByRole('button', { name: 'Add location' }).click();
    await page.getByText('Building C - Floor 3 - Room 305').first().waitFor();

    console.log('Dashboard counters + export');
    await page.goto(`${url}#/dashboard`);
    const counters = (await page.locator('header').nth(1).innerText()).replace(/\s+/g, ' ');
    assert(counters.includes('New: 2') && counters.includes('Edited: 1') && counters.includes('Deleted: 1'), 'header shows New: 2, Edited: 1, Deleted: 1');
    await page.screenshot({ path: join(shots, '03-dashboard-desktop.png'), fullPage: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Updated Excel' }).first().click()]);
    const exportedPath = join(out, 'e2e-exported.zip');
    await download.saveAs(exportedPath);
    assert(/^0-existing-input_updated_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/.test(download.suggestedFilename()), `download named ${download.suggestedFilename()}`);
    await page.getByText('All changes downloaded').first().waitFor();
    assert((await page.getByText('Total Items').count()) > 0, 'session still open after export');

    console.log('Verify exported file');
    const bytes = new Uint8Array(readFileSync(exportedPath));
    const back = await importUpload(toArrayBuffer(bytes), 'e2e.zip');
    assert(back.items.map((i) => i.id).join(',') === 'INV-001,INV-002,INV-004,INV-005', 'exported IDs are INV-001, 002, 004, 005');
    assert(back.items[0].name === 'Dell Latitude (edited in browser)', 'edit is in the file');
    assert(back.items[0].createdDate === '2026-01-15 09:30', 'CREATED_DATE preserved');
    assert(back.items.every((i) => i.photo), 'all 4 items have embedded photos');
    assert(sha(back.items[2].photo!.bytes) === sha(readFileSync(smallPng)), 'small PNG embedded unchanged');
    assert(back.items[3].photo!.ext === 'jpeg' && Math.max(back.items[3].photo!.width!, back.items[3].photo!.height!) === 1600, 'big photo resized to 1600 px JPEG');
    assert(back.categories.includes('Vehicles') && back.locations.includes('Building C - Floor 3 - Room 305'), 'new category + location exported');
    const pkg = await JSZip.loadAsync(bytes);
    const entries = Object.keys(pkg.files).filter((n) => !pkg.files[n].dir).sort();
    assert(
      entries.length === 6 && entries.filter((n) => n.startsWith('assets/')).length === 4 && entries.some((n) => /\.xlsx$/.test(n)) && entries.includes('README.txt'),
      `default download is a ZIP: ${entries.join(', ')}`,
    );
    assert(sha(readFileSync(fixture)) === fixtureHash, 'original file on disk unchanged');

    console.log('Fullscreen photo viewer');
    await page.goto(`${url}#/inventory`);
    await page.locator('tr', { hasText: 'INV-005' }).getByRole('button', { name: 'View details' }).click();
    await page.getByRole('button', { name: 'View photo full screen' }).click();
    const viewer = page.getByRole('dialog', { name: /Photo:/ });
    await viewer.waitFor();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(250);
    assert((await viewer.innerText()).includes('225%'), 'zoom buttons work (225%)');
    await page.screenshot({ path: join(shots, '08-photo-viewer-zoomed.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    assert((await viewer.count()) === 0 && (await page.getByRole('button', { name: 'Edit item' }).isVisible()), 'Esc closes only the viewer, details stay open');
    await page.keyboard.press('Escape');

    console.log('Switch to "all versions" photo format');
    await page.goto(`${url}#/session`);
    await page.getByText('Picture over the cell (all versions)').click();
    await page.screenshot({ path: join(shots, '09-photo-format-setting.png'), fullPage: true });
    const [download2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Updated Excel' }).first().click()]);
    const floatingPath = join(out, 'e2e-exported-floating.xlsx');
    await download2.saveAs(floatingPath);
    const pics = await picturesByRow(new Uint8Array(readFileSync(floatingPath)));
    assert(pics.length === 4 && pics.every((p) => p.col === 7), 'floating mode: 4 pictures anchored in column G');

    console.log('Unsaved-changes guard + refresh clears memory');
    await page.goto(`${url}#/categories`);
    await page.getByPlaceholder('New category').fill('Temp');
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByText('Unsaved changes').first().waitFor();
    let sawPrompt = false;
    page.once('dialog', async (d) => {
      sawPrompt = d.type() === 'beforeunload';
      await d.accept();
    });
    await page.mouse.click(5, 5); // browsers only show beforeunload after a user gesture
    await page.reload();
    await page.getByText('Welcome to Inventory Manager').waitFor();
    assert(sawPrompt, 'browser warned before reload with unsaved changes');
    assert(true, 'after refresh the app is back at the upload screen (nothing persisted)');
    const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie }));
    assert(storage.ls === 0 && storage.ss === 0 && storage.cookie === '', 'no localStorage / sessionStorage / cookies used');
    assert(requests === 0, 'no requests to any other server');

    console.log('Mobile screenshots');
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const mp = await m.newPage();
    mp.on('pageerror', (e) => errors.push(String(e)));
    await mp.goto(url);
    await mp.screenshot({ path: join(shots, '04-mobile-upload.png') });
    await mp.locator('input[type=file][accept*=".xlsx"]').setInputFiles(exportedPath);
    await mp.getByRole('button', { name: 'Import' }).click();
    await mp.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await mp.screenshot({ path: join(shots, '05-mobile-dashboard.png') });
    await mp.goto(`${url}#/inventory`);
    await mp.waitForTimeout(300);
    await mp.screenshot({ path: join(shots, '06-mobile-inventory.png') });
    await mp.goto(`${url}#/add`);
    await mp.waitForTimeout(300);
    await mp.screenshot({ path: join(shots, '07-mobile-add.png') });
    const capture = await mp.locator('input[type=file][capture="environment"]').count();
    assert(capture === 1, 'mobile camera input (capture="environment") present');

    assert(errors.length === 0, `no browser console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    console.log('\nE2E PASSED');
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
