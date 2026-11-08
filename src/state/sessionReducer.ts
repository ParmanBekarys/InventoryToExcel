import type { ActivityEntry, ImportReport, InventoryItem, WorkbookContext } from '../types/inventory';
import type { LoadedSession } from '../services/excelImport';
import type { PhotoMode } from '../services/excelExport';
import { addToList, removeFromList, renameInList, sameName } from '../services/lookupLists';
import { releasePhoto } from '../services/imageProcessing';
import { nowStamp } from '../utils/dates';

/**
 * The whole editing session lives in this in-memory state.
 * Nothing is written to localStorage, sessionStorage, IndexedDB, cookies or any server.
 */
export interface SessionState {
  loaded: boolean;
  items: InventoryItem[];
  categories: string[];
  locations: string[];
  context: WorkbookContext | null;
  report: ImportReport | null;
  /** Snapshot of the uploaded data, used to count changes. */
  original: {
    fingerprints: Map<string, string>;
    ids: string[];
    categories: string[];
    locations: string[];
    fingerprint: string;
  };
  lastExport: { at: string; fileName: string; fingerprint: string } | null;
  userName: string;
  /** How photos are written to Excel. Memory only, kept when a new file is opened. */
  photoMode: PhotoMode;
  activity: ActivityEntry[];
  /** True when started from the built-in blank template instead of an uploaded file. */
  blank: boolean;
}

export type SessionAction =
  | { type: 'LOAD'; session: LoadedSession; blank?: boolean }
  | { type: 'ADD_ITEM'; item: InventoryItem }
  | { type: 'UPDATE_ITEM'; item: InventoryItem }
  | { type: 'DELETE_ITEM'; uid: string }
  | { type: 'LIST_ADD'; list: ListKind; name: string }
  | { type: 'LIST_RENAME'; list: ListKind; from: string; to: string }
  | { type: 'LIST_DELETE'; list: ListKind; name: string }
  | { type: 'MARK_EXPORTED'; fileName: string }
  | { type: 'SET_USER'; name: string }
  | { type: 'SET_PHOTO_MODE'; mode: PhotoMode }
  | { type: 'RESET' };

export type ListKind = 'categories' | 'locations';

export const initialSession: SessionState = {
  loaded: false,
  items: [],
  categories: [],
  locations: [],
  context: null,
  report: null,
  original: { fingerprints: new Map(), ids: [], categories: [], locations: [], fingerprint: '' },
  lastExport: null,
  userName: '',
  photoMode: 'zip',
  activity: [],
  blank: false,
};

export function itemFingerprint(it: InventoryItem): string {
  return JSON.stringify([
    it.id,
    it.name,
    it.category,
    it.quantity,
    it.location,
    it.description,
    it.photo?.key ?? '',
    it.photoText,
    it.addedBy,
    it.createdDate,
    it.updatedDate,
    it.extra,
  ]);
}

export function stateFingerprint(s: Pick<SessionState, 'items' | 'categories' | 'locations'>): string {
  return JSON.stringify([s.items.map((i) => i.uid + itemFingerprint(i)), s.categories, s.locations]);
}

function log(state: SessionState, kind: ActivityEntry['kind'], text: string): ActivityEntry[] {
  return [{ at: nowStamp(), kind, text }, ...state.activity].slice(0, 100);
}

const LABEL: Record<ListKind, string> = { categories: 'Category', locations: 'Location' };
const FIELD: Record<ListKind, 'category' | 'location'> = { categories: 'category', locations: 'location' };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'LOAD': {
      const { items, categories, locations, context, report } = action.session;
      const fingerprints = new Map(items.map((i) => [i.uid, itemFingerprint(i)]));
      return {
        ...initialSession,
        userName: state.userName,
        photoMode: state.photoMode,
        loaded: true,
        blank: !!action.blank,
        items,
        categories,
        locations,
        context,
        report,
        original: {
          fingerprints,
          ids: items.map((i) => i.id).filter(Boolean),
          categories: [...categories],
          locations: [...locations],
          fingerprint: stateFingerprint({ items, categories, locations }),
        },
        activity: [
          {
            at: nowStamp(),
            kind: 'import',
            text: action.blank ? 'Started a new blank inventory' : `Loaded "${report.fileName}" (${items.length} items)`,
          },
        ],
      };
    }
    case 'ADD_ITEM': {
      const lists = ensureInLists(state, action.item);
      return { ...state, ...lists, items: [...state.items, action.item], activity: log(state, 'add', `Added ${action.item.id} · ${action.item.name}`) };
    }
    case 'UPDATE_ITEM': {
      const prev = state.items.find((i) => i.uid === action.item.uid);
      if (!prev) return state;
      if (prev.photo && prev.photo.key !== action.item.photo?.key) releasePhoto(prev.photo);
      const lists = ensureInLists(state, action.item);
      return {
        ...state,
        ...lists,
        items: state.items.map((i) => (i.uid === action.item.uid ? action.item : i)),
        activity: log(state, 'edit', `Edited ${action.item.id} · ${action.item.name}`),
      };
    }
    case 'DELETE_ITEM': {
      const prev = state.items.find((i) => i.uid === action.uid);
      if (!prev) return state;
      releasePhoto(prev.photo);
      return { ...state, items: state.items.filter((i) => i.uid !== action.uid), activity: log(state, 'delete', `Deleted ${prev.id} · ${prev.name}`) };
    }
    case 'LIST_ADD': {
      if (state[action.list].some((x) => sameName(x, action.name))) return state;
      return {
        ...state,
        [action.list]: addToList(state[action.list], action.name),
        activity: log(state, action.list === 'categories' ? 'category' : 'location', `${LABEL[action.list]} added: ${action.name}`),
      };
    }
    case 'LIST_RENAME': {
      const field = FIELD[action.list];
      const stamp = nowStamp();
      // Renaming updates every item that uses the old name.
      const items = state.items.map((i) => (i[field] === action.from ? { ...i, [field]: action.to, updatedDate: stamp } : i));
      return {
        ...state,
        items,
        [action.list]: renameInList(state[action.list], action.from, action.to),
        activity: log(state, action.list === 'categories' ? 'category' : 'location', `${LABEL[action.list]} renamed: ${action.from} → ${action.to}`),
      };
    }
    case 'LIST_DELETE': {
      const field = FIELD[action.list];
      if (state.items.some((i) => sameName(i[field], action.name))) return state; // in use: never delete
      return {
        ...state,
        [action.list]: removeFromList(state[action.list], action.name),
        activity: log(state, action.list === 'categories' ? 'category' : 'location', `${LABEL[action.list]} deleted: ${action.name}`),
      };
    }
    case 'MARK_EXPORTED':
      return {
        ...state,
        lastExport: { at: nowStamp(), fileName: action.fileName, fingerprint: stateFingerprint(state) },
        activity: log(state, 'export', `Downloaded ${action.fileName}`),
      };
    case 'SET_PHOTO_MODE':
      return { ...state, photoMode: action.mode };
    case 'SET_USER':
      return { ...state, userName: action.name };
    case 'RESET':
      state.items.forEach((i) => releasePhoto(i.photo));
      return { ...initialSession, userName: state.userName, photoMode: state.photoMode };
    default:
      return state;
  }
}

/** A category/location typed on an item is added to its list so the Excel dropdowns stay complete. */
function ensureInLists(state: SessionState, item: InventoryItem) {
  const categories = item.category && !state.categories.some((c) => sameName(c, item.category)) ? [...state.categories, item.category] : state.categories;
  const locations = item.location && !state.locations.some((c) => sameName(c, item.location)) ? [...state.locations, item.location] : state.locations;
  return { categories, locations };
}

export interface ChangeSummary {
  added: number;
  edited: number;
  deleted: number;
  categoriesAdded: number;
  categoriesRemoved: number;
  locationsAdded: number;
  locationsRemoved: number;
  total: number;
  /** Changes not yet included in a downloaded file. */
  unsaved: boolean;
}

export function summarizeChanges(state: SessionState): ChangeSummary {
  const { fingerprints } = state.original;
  let added = 0;
  let edited = 0;
  const present = new Set<string>();
  for (const it of state.items) {
    present.add(it.uid);
    const fp = fingerprints.get(it.uid);
    if (fp === undefined) added++;
    else if (fp !== itemFingerprint(it)) edited++;
  }
  let deleted = 0;
  for (const k of fingerprints.keys()) if (!present.has(k)) deleted++;
  const diff = (now: string[], before: string[]) => ({
    plus: now.filter((x) => !before.includes(x)).length,
    minus: before.filter((x) => !now.includes(x)).length,
  });
  const c = diff(state.categories, state.original.categories);
  const l = diff(state.locations, state.original.locations);
  const total = added + edited + deleted + c.plus + c.minus + l.plus + l.minus;
  const current = stateFingerprint(state);
  const unsaved = state.loaded && current !== (state.lastExport?.fingerprint ?? state.original.fingerprint);
  return {
    added,
    edited,
    deleted,
    categoriesAdded: c.plus,
    categoriesRemoved: c.minus,
    locationsAdded: l.plus,
    locationsRemoved: l.minus,
    total,
    unsaved,
  };
}

/** Every ID in the session plus every ID from the uploaded file (so deleted IDs are not reused). */
export function allKnownIds(state: SessionState): string[] {
  return [...state.items.map((i) => i.id), ...state.original.ids];
}
