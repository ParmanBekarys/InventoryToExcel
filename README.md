# Inventory Manager

A privacy-first inventory web app that uses an **Excel workbook as its only data store**.
Upload `Inventory.xlsx` → view, search, add, edit and delete items (with photos) → download the updated workbook.

- No backend, database, cloud storage, cookies, localStorage, sessionStorage or IndexedDB.
- Files and photos are processed in the browser only and never uploaded.
- All changes live in memory until you click **Download Updated Excel**. Refreshing or closing the tab clears them (the app warns you first).

## Requirements

- Node.js 18 or newer (tested with Node 24).

## Install and run

```bash
npm install
npm run dev          # http://localhost:5173
```

## Build for production

```bash
npm run build        # outputs static files to dist/
npm run preview      # serves dist/ at http://localhost:4173 to check the build
```

## Deploy as a static website

`dist/` is a plain static site (HTML, JS, CSS). It uses relative paths and hash routing (`#/inventory`), so it works from any folder without server rewrite rules.

- **Netlify / Cloudflare Pages / Vercel:** build command `npm run build`, output folder `dist`.
- **GitHub Pages:** push the contents of `dist/` to the `gh-pages` branch (or use a Pages workflow that runs `npm run build`).
- **Any web server (Nginx, Apache, IIS, S3):** copy the contents of `dist/` into the web root.

**Use HTTPS.** Phone browsers only allow the camera on HTTPS (or `localhost`). All the hosts above provide HTTPS. Without HTTPS, “From gallery” still works.

After the page has loaded once, it keeps working offline in that tab, because everything is bundled into one file.

## Excel structure (`Inventory_Template.xlsx`)

| Sheet | Contents |
|---|---|
| Inventory | A `ID` · B `NAME` · C `CATEGORY` · D `QUANTITY` · E `LOCATION` · F `DESCRIPTION` · G `PHOTO` · H `ADDED_BY` · I `CREATED_DATE` · J `UPDATED_DATE` |
| Categories | Column A, header in A1 |
| Locations | Column A, header in A1 |
| Instructions | Free text. Copied unchanged from the uploaded file on export |

Run `npm run template` to regenerate `Inventory_Template.xlsx`, or use **Download blank template** on the upload page.

Columns are matched by header name, so a workbook with columns in a different order still imports. The export always writes them in template order. Any extra columns are kept and written after column J. Any extra sheets are copied over.

## Photos

**Import** reads every picture attached to the Inventory sheet, straight from the `.xlsx` package:
- floating pictures (`xl/drawings`, one-cell and two-cell anchors), and
- Excel 365 **“Place in Cell”** pictures (`xl/metadata.xml` + `xl/richData/*`).

Each picture is matched to an item by its row. Pictures that can’t be used are listed in the import report (Settings / Session page) and never dropped silently. This covers grouped pictures, linked pictures, pictures not attached to a cell, EMF/WMF/TIFF images, and extra pictures in the same row.

**Export** format is chosen on the Settings / Session page:
- **ZIP: Excel + assets folder** (default). Downloads `<name>.zip` containing `<name>.xlsx`, an `assets/` folder with full-size photos named by ID (`assets/INV-001.jpg`), and `README.txt`. Each PHOTO cell is a clickable relative link such as `assets/INV-001.jpg`. **Extract the ZIP before opening the Excel file**, because links don't work from inside a ZIP. Keep the Excel file and `assets/` together. Upload the ZIP again to continue editing: photos are read from `assets/` by the PHOTO link, or by item ID if the link is missing. Uploading only the `.xlsx` shows a warning that the photos are in the ZIP.
- **Place in Cell (Excel 365)**, which embeds the photos in the workbook. Uses the same structure Excel writes for Insert → Picture → Place in Cell. In Excel 365 the photo sits inside the cell and can be shown larger. Older Excel, Google Sheets and LibreOffice show `#VALUE!` instead.
- **Picture over the cell (all versions).** The photo is fitted inside the cell and set to “Move and size with cells”, so it stays with its row when sorting or filtering.

New photos are resized to at most 1600 px (JPEG). Pictures from the original file are re-embedded byte-for-byte. On the website, click a photo in the item details to open it full screen with zoom (scroll, pinch, double-click, or the +/− buttons).

## Multiple users

There is no shared server, so people don’t see each other’s changes automatically. The workflow is:
get the latest file → upload → edit → **Download Updated Excel** → send that file to the next person.
If two people edit separate copies at the same time, their changes must be merged by hand.

## Tests

```bash
npm test             # 18 tests: full spec workflow, edge cases, privacy scan
npm run build && npm run e2e   # drives the built app in installed Chrome (E2E_CHANNEL=msedge for Edge)
```

`npm test` covers the spec’s test scenario on the real services and state logic:
1. Import a workbook that has existing photos.
2. Add 10 items with photos, edit 2, delete 1, add 2 categories and 1 location.
3. Export, then check every record, every photo’s row and image bytes, the Instructions sheet and the formatting.
4. Re-import the export and compare everything.
5. Confirm the uploaded file is byte-for-byte unchanged, and that exporting keeps the session open.

It also reads `tests/fixtures/excel365-in-cell-picture.xlsx`, a file saved by Microsoft Excel 365 with a real “Place in Cell” picture.

`npm run e2e` repeats the workflow in a real browser. It also checks the unsaved-changes warning, that a refresh clears memory, that no storage or cookies are used, that no network requests are made, and the mobile layout. Screenshots are saved to `test-output/screens/`.

The exported files were also opened in desktop Microsoft Excel 16 with no repair prompt. Each photo sat inside its own G cell with “Move and size with cells”.

## Project structure

```
src/
  types/        inventory.ts — column names, sheet names, data types
  services/     excelImport.ts      read workbook (ExcelJS + JSZip)
                imageExtraction.ts  OOXML drawings + rich-value (in-cell) pictures
                imageProcessing.ts  format detection, resize/rotate, object URLs
                excelExport.ts      build the updated workbook + download
                lookupLists.ts      category / location rules
                templateSchema.ts   defaults, widths, Instructions text
                blankWorkbook.ts    empty session for “start blank” / template
  state/        sessionReducer.ts   all in-memory state + change counting
                SessionContext.tsx  React provider, import/export actions
  hooks/        hash routing, unsaved-changes warning, delete confirmation
  components/   UI primitives, modal, photo picker, camera, list manager…
  layouts/      AppLayout.tsx — sidebar, mobile top bar and bottom nav
  pages/        Upload, Dashboard, Inventory, Add/Edit item, Categories, Locations, Settings/Session
```

## Known limitations

- “Place in Cell” photos only display in Excel 365. Switch to “Picture over the cell” on the Settings page if someone uses older Excel, Google Sheets or LibreOffice.
- One photo per item. If a row has extra pictures, they are reported and not exported.
- The Inventory, Categories and Locations sheets are rebuilt with standard formatting on export. Custom formatting on those three sheets isn’t kept.
- Charts on any sheet can’t be recreated in the browser. The import report warns about them.
- On copied sheets (Instructions and extras), values, formulas, styles, sizes, merged cells and pictures are kept. Data validation and conditional formatting are not.
- Very large workbooks (thousands of high-resolution photos) are limited by the device’s memory.
