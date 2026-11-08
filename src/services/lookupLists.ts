/**
 * Shared logic for the Categories and Locations lists.
 * Lists are plain string arrays; comparisons are case-insensitive and trimmed.
 */

export const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export type ListValidation = { ok: true; value: string } | { ok: false; error: string };

export function validateNewName(list: string[], name: string, label: string, except?: string): ListValidation {
  const value = cleanName(name);
  if (!value) return { ok: false, error: `${label} name cannot be empty.` };
  if (value.length > 120) return { ok: false, error: `${label} name is too long (max 120 characters).` };
  if (list.some((x) => sameName(x, value) && !(except !== undefined && sameName(x, except)))) {
    return { ok: false, error: `${label} "${value}" already exists.` };
  }
  return { ok: true, value };
}

/** Removes empty and duplicate entries while keeping the first spelling and the original order. */
export function dedupe(list: string[]): { list: string[]; duplicates: string[] } {
  const out: string[] = [];
  const duplicates: string[] = [];
  for (const raw of list) {
    const v = cleanName(raw);
    if (!v) continue;
    if (out.some((x) => sameName(x, v))) duplicates.push(v);
    else out.push(v);
  }
  return { list: out, duplicates };
}

export function addToList(list: string[], name: string): string[] {
  return [...list, cleanName(name)];
}

export function renameInList(list: string[], from: string, to: string): string[] {
  return list.map((x) => (x === from ? cleanName(to) : x));
}

export function removeFromList(list: string[], name: string): string[] {
  return list.filter((x) => x !== name);
}

export function usageCount(values: string[], name: string): number {
  return values.reduce((n, v) => (sameName(v, name) ? n + 1 : n), 0);
}
