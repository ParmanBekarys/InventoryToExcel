/** Small namespace-agnostic XML helpers (work with the browser DOMParser and @xmldom/xmldom). */

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'text/xml');
}

export function elementChildren(el: Element | Document, localName?: string): Element[] {
  const out: Element[] = [];
  const nodes = el.childNodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i] as Element;
    if (n.nodeType === 1 && (!localName || n.localName === localName)) out.push(n);
  }
  return out;
}

export function firstChild(el: Element | Document, localName: string): Element | null {
  return elementChildren(el, localName)[0] ?? null;
}

/** All descendants with a given local name (any namespace). */
export function descendants(el: Element | Document, localName: string): Element[] {
  const list = el.getElementsByTagNameNS('*', localName);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i] as Element);
  return out;
}

export function textOf(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

/** Reads an attribute regardless of its namespace prefix (e.g. r:embed → "embed"). */
export function attrLocal(el: Element, localName: string): string | null {
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if ((a.localName || a.name) === localName || a.name.endsWith(`:${localName}`)) return a.value;
  }
  return null;
}

/** Resolves a relationship target relative to the part that owns the .rels file. */
export function resolvePartPath(ownerPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = ownerPart.split('/');
  baseParts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') baseParts.pop();
    else if (seg !== '.' && seg !== '') baseParts.push(seg);
  }
  return baseParts.join('/');
}

/** "xl/worksheets/sheet1.xml" → "xl/worksheets/_rels/sheet1.xml.rels" */
export function relsPathFor(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}
