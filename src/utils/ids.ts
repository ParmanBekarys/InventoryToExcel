/**
 * Generates the next unique inventory ID (e.g. INV-001) after inspecting every
 * ID that exists now or existed in the uploaded file, so deleted IDs are not reused.
 */
export function nextInventoryId(usedIds: Iterable<string>, prefix = 'INV-'): string {
  const used = new Set<string>();
  let max = 0;
  let width = 3;
  const re = new RegExp(`^${escapeRe(prefix)}(\\d+)$`, 'i');
  for (const raw of usedIds) {
    const id = raw.trim();
    if (!id) continue;
    used.add(id.toUpperCase());
    const m = re.exec(id);
    if (m) {
      max = Math.max(max, parseInt(m[1], 10));
      width = Math.max(width, m[1].length);
    }
  }
  let n = max + 1;
  let candidate = `${prefix}${String(n).padStart(width, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    n += 1;
    candidate = `${prefix}${String(n).padStart(width, '0')}`;
  }
  return candidate;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let counter = 0;
/** Internal unique key (memory only, never written to Excel). */
export function uid(prefix = 'u'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
