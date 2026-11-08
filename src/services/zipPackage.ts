import JSZip from 'jszip';
import { buildWorkbookParts, ASSETS_DIR, type ExportInput } from './excelExport';
import { ImportError, importWorkbook, type ImportOptions, type LoadedSession } from './excelImport';
import { detectImageFormat } from './imageProcessing';

/**
 * ZIP package format:
 *   <name>.xlsx        PHOTO cells link to assets/<ID>.jpg
 *   assets/INV-001.jpg …
 *   README.txt
 */

const README = `INVENTORY — ҚАЛАЙ АШУ КЕРЕК / HOW TO OPEN
==========================================

ҚАЗАҚША
1. Алдымен ZIP файлды ашып шығарыңыз: оң жақ батырма → «Extract All» (Барлығын шығару).
   ZIP ішінен Excel-ді тікелей ашсаңыз, фото сілтемелері ЖҰМЫС ІСТЕМЕЙДІ.
2. Шығарылған папкадағы Excel файлын ашыңыз.
3. PHOTO бағанындағы сілтемені (мысалы, assets/INV-001.jpg) басыңыз — фото ашылады.
4. Excel файлы мен assets папкасы әрқашан бір папкада бірге тұруы керек.
5. Сайтқа қайта жүктегенде осы ZIP файлды (немесе Excel + assets папкасын қайта ZIP-қа салып) жүктеңіз.

ENGLISH
1. Extract the ZIP first (right-click → Extract All). Photo links do NOT work if you open the
   Excel file directly from inside the ZIP.
2. Open the Excel file from the extracted folder.
3. Click a link in the PHOTO column (e.g. assets/INV-001.jpg) to open the photo.
4. Keep the Excel file and the assets folder together in the same folder.
5. To continue editing, upload this ZIP file (or re-zip the Excel file + assets folder) to the website.
`;

/** Builds the downloadable ZIP: workbook + assets folder + short instructions. */
export async function buildExportZip(input: ExportInput, xlsxName: string): Promise<Uint8Array> {
  const { bytes, assets } = await buildWorkbookParts({ ...input, photoMode: 'zip' });
  const zip = new JSZip();
  zip.file(xlsxName, bytes);
  zip.folder(ASSETS_DIR);
  for (const a of assets) zip.file(a.path, a.bytes);
  zip.file('README.txt', README);
  // Images and xlsx are already compressed; STORE keeps it fast.
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE', platform: 'DOS' });
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
const baseName = (p: string) => norm(p).split('/').pop() ?? '';
const stem = (p: string) => baseName(p).replace(/\.[^.]+$/, '');

function decodeLink(link: string): string {
  let l = link.trim();
  try {
    l = decodeURI(l);
  } catch {
    /* keep as is */
  }
  return l
    .replace(/^file:\/+/i, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function resolveRel(dir: string, rel: string): string {
  const parts = dir ? dir.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Reads an uploaded .xlsx, or a .zip containing one .xlsx plus its photo files.
 */
export async function importUpload(buffer: ArrayBuffer, fileName: string, options: ImportOptions = {}): Promise<LoadedSession> {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (!isZip) return importWorkbook(buffer, fileName, options);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    if (/\.zip$/i.test(fileName)) throw new ImportError('The ZIP file looks damaged and could not be opened.');
    return importWorkbook(buffer, fileName, options);
  }
  if (zip.file('xl/workbook.xml')) return importWorkbook(buffer, fileName, options); // a plain .xlsx

  const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)__MACOSX\//.test(f.name) && !/(^|\/)\./.test(f.name));
  const workbooks = entries.filter((f) => /\.xlsx$/i.test(f.name) && !/(^|\/)~\$/.test(f.name));
  if (!workbooks.length) throw new ImportError('This ZIP file does not contain an Excel workbook (.xlsx). It should contain the Excel file and the assets folder.');
  const depth = (n: string) => n.split('/').length;
  const shallowest = Math.min(...workbooks.map((w) => depth(w.name)));
  const candidates = workbooks.filter((w) => depth(w.name) === shallowest);
  if (candidates.length > 1) {
    throw new ImportError(`This ZIP contains several Excel files (${candidates.map((c) => c.name).join(', ')}). Put only one inventory workbook in the ZIP.`);
  }
  const wbEntry = candidates[0];
  const wbDir = wbEntry.name.includes('/') ? wbEntry.name.slice(0, wbEntry.name.lastIndexOf('/')) : '';

  // Index every image file in the ZIP.
  const images = new Map<string, { name: string; bytes: Uint8Array }>();
  for (const f of entries) {
    if (f === wbEntry || /\.(xlsx|txt|md|pdf|docx?)$/i.test(f.name)) continue;
    const bytes = await f.async('uint8array');
    if (detectImageFormat(bytes) !== 'unknown') images.set(norm(f.name), { name: f.name, bytes });
  }
  const byStem = new Map<string, { name: string; bytes: Uint8Array }>();
  for (const [p, v] of images) if (p.includes(`${ASSETS_DIR}/`) && !byStem.has(stem(p))) byStem.set(stem(p), v);

  const externalFiles = (link: string, id: string) => {
    const tries: string[] = [];
    if (link) {
      const l = decodeLink(link);
      tries.push(resolveRel(wbDir, l), resolveRel(wbDir, `${ASSETS_DIR}/${baseName(l)}`), l);
    }
    for (const t of tries) {
      const hit = images.get(norm(t));
      if (hit) return { bytes: hit.bytes, path: hit.name };
    }
    // Fallback: assets/<ID>.<any image extension>
    const safeId = id.replace(/[\\/:*?"<>|\s]+/g, '_').toLowerCase();
    const hit = (link && byStem.get(stem(decodeLink(link)))) || (safeId ? byStem.get(safeId) : undefined);
    return hit ? { bytes: hit.bytes, path: hit.name } : null;
  };

  const xlsx = await wbEntry.async('uint8array');
  const session = await importWorkbook(xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer, wbEntry.name.split('/').pop()!, {
    ...options,
    externalFiles,
  });
  session.report.issues.unshift({ level: 'info', message: `Opened "${wbEntry.name}" from the ZIP file, with ${images.size} image file(s).` });
  session.report.fileName = fileName;
  session.report.fileSize = buffer.byteLength;
  return session;
}
