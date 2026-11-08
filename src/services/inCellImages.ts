import JSZip from 'jszip';
import type { ImageExt } from '../types/inventory';
import { sheetPartPaths } from './imageExtraction';
import { MIME } from './imageProcessing';

/**
 * Writes Excel 365 "Place in Cell" pictures, using the same package structure Excel
 * itself writes (rich values: xl/metadata.xml + xl/richData/*).
 * Excel 365 shows these inside the cell; clicking the cell's picture icon shows a larger view.
 * Older Excel, Google Sheets and LibreOffice show #VALUE! instead.
 */

export interface InCellPicture {
  /** 1-based row / column. The cell must already hold the numeric placeholder `index` (1-based). */
  row: number;
  col: number;
  index: number;
  bytes: Uint8Array;
  ext: ImageExt;
  altText: string;
}

const XLRD = 'http://schemas.microsoft.com/office/spreadsheetml/2017/richdata';
const REL_BASE = 'http://schemas.microsoft.com/office';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colLetters(col: number): string {
  let s = '';
  for (let c = col; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}

const RV_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvTypesInfo xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata2" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><global><keyFlags><key name="_Self"><flag name="ExcludeFromFile" value="1"/><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_DisplayString"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Flags"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Format"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_SubLabel"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Attribution"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Icon"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_Display"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_CanonicalPropertyNames"><flag name="ExcludeFromCalcComparison" value="1"/></key><key name="_ClassificationId"><flag name="ExcludeFromCalcComparison" value="1"/></key></keyFlags></global></rvTypesInfo>`;

export async function embedInCellPictures(xlsx: Uint8Array, sheetName: string, pictures: InCellPicture[]): Promise<Uint8Array> {
  if (!pictures.length) return xlsx;
  const zip = await JSZip.loadAsync(xlsx);
  const sheetPath = (await sheetPartPaths(zip)).get(sheetName);
  if (!sheetPath) throw new Error(`Sheet "${sheetName}" not found while embedding pictures.`);
  let sheet = await zip.file(sheetPath)!.async('string');

  // 1. Turn each placeholder cell into a rich-value error cell (exactly what Excel writes).
  for (const p of pictures) {
    const ref = `${colLetters(p.col)}${p.row}`;
    const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
    const m = re.exec(sheet);
    if (!m) throw new Error(`Cell ${ref} not found while embedding pictures.`);
    const style = /\ss="(\d+)"/.exec(m[1]);
    sheet = sheet.replace(re, `<c r="${ref}"${style ? ` s="${style[1]}"` : ''} t="e" vm="${p.index}"><v>#VALUE!</v></c>`);
  }
  zip.file(sheetPath, sheet);

  // 2. Media + rich value parts.
  const n = pictures.length;
  const ordered = [...pictures].sort((a, b) => a.index - b.index);
  ordered.forEach((p, i) => zip.file(`xl/media/inCellPhoto${i + 1}.${p.ext}`, p.bytes));

  zip.file(
    'xl/metadata.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="${XLRD}"><metadataTypes count="1"><metadataType name="XLRICHVALUE" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1"/></metadataTypes><futureMetadata name="XLRICHVALUE" count="${n}">${ordered
      .map((_, i) => `<bk><extLst><ext uri="{3e2802c4-a4d2-4d8b-9148-e3be6c30e623}"><xlrd:rvb i="${i}"/></ext></extLst></bk>`)
      .join('')}</futureMetadata><valueMetadata count="${n}">${ordered.map((_, i) => `<bk><rc t="1" v="${i}"/></bk>`).join('')}</valueMetadata></metadata>`,
  );
  zip.file(
    'xl/richData/rdrichvaluestructure.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvStructures xmlns="${XLRD}" count="1"><s t="_localImage"><k n="_rvRel:LocalImageIdentifier" t="i"/><k n="CalcOrigin" t="i"/><k n="Text" t="s"/></s></rvStructures>`,
  );
  zip.file(
    'xl/richData/rdrichvalue.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rvData xmlns="${XLRD}" count="${n}">${ordered.map((p, i) => `<rv s="0"><v>${i}</v><v>5</v><v>${esc(p.altText)}</v></rv>`).join('')}</rvData>`,
  );
  zip.file('xl/richData/rdRichValueTypes.xml', RV_TYPES);
  zip.file(
    'xl/richData/richValueRel.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${ordered
      .map((_, i) => `<rel r:id="rId${i + 1}"/>`)
      .join('')}</richValueRels>`,
  );
  zip.file(
    'xl/richData/_rels/richValueRel.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ordered
      .map((p, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/inCellPhoto${i + 1}.${p.ext}"/>`)
      .join('')}</Relationships>`,
  );

  // 3. Content types.
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  for (const ext of new Set(ordered.map((p) => p.ext))) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(ct)) ct = ct.replace('</Types>', `<Default Extension="${ext}" ContentType="${MIME[ext]}"/></Types>`);
  }
  const overrides: [string, string][] = [
    ['/xl/metadata.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml'],
    ['/xl/richData/richValueRel.xml', 'application/vnd.ms-excel.richvaluerel+xml'],
    ['/xl/richData/rdrichvalue.xml', 'application/vnd.ms-excel.rdrichvalue+xml'],
    ['/xl/richData/rdrichvaluestructure.xml', 'application/vnd.ms-excel.rdrichvaluestructure+xml'],
    ['/xl/richData/rdRichValueTypes.xml', 'application/vnd.ms-excel.rdrichvaluetypes+xml'],
  ];
  for (const [part, type] of overrides) {
    if (!ct.includes(`PartName="${part}"`)) ct = ct.replace('</Types>', `<Override PartName="${part}" ContentType="${type}"/></Types>`);
  }
  zip.file('[Content_Types].xml', ct);

  // 4. Workbook relationships.
  const relsPath = 'xl/_rels/workbook.xml.rels';
  let rels = await zip.file(relsPath)!.async('string');
  const rels4: [string, string][] = [
    ['http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata', 'metadata.xml'],
    [`${REL_BASE}/2022/10/relationships/richValueRel`, 'richData/richValueRel.xml'],
    [`${REL_BASE}/2017/06/relationships/rdRichValue`, 'richData/rdrichvalue.xml'],
    [`${REL_BASE}/2017/06/relationships/rdRichValueStructure`, 'richData/rdrichvaluestructure.xml'],
    [`${REL_BASE}/2017/06/relationships/rdRichValueTypes`, 'richData/rdRichValueTypes.xml'],
  ];
  rels4.forEach(([type, target], i) => {
    if (!rels.includes(`Target="${target}"`)) rels = rels.replace('</Relationships>', `<Relationship Id="rIdInCell${i + 1}" Type="${type}" Target="${target}"/></Relationships>`);
  });
  zip.file(relsPath, rels);

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
