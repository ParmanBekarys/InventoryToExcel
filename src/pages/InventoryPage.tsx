import { ArrowDownWideNarrow, ArrowUpNarrowWide, Eye, LayoutGrid, MapPin, PackageOpen, Pencil, Plus, Rows3, Search, SearchX, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ItemDetails } from '../components/ItemDetails';
import { ItemPhoto } from '../components/ItemPhoto';
import { Badge, Button, Card, EmptyState, IconButton, Input, PageHeader, Select } from '../components/ui';
import { useItemDelete } from '../hooks/useItemDelete';
import type { Navigate } from '../hooks/useHashRoute';
import { useSession } from '../state/SessionContext';
import { itemFingerprint } from '../state/sessionReducer';
import type { InventoryItem } from '../types/inventory';
import { prettyStamp, stampSortValue } from '../utils/dates';
import { cx, formatNumber } from '../utils/format';

type SortKey = 'name' | 'quantity' | 'created' | 'updated' | 'id';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'created', label: 'Created date' },
  { key: 'updated', label: 'Updated date' },
];

function compare(a: InventoryItem, b: InventoryItem, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    case 'quantity':
      return a.quantity - b.quantity;
    case 'created':
      return stampSortValue(a.createdDate) - stampSortValue(b.createdDate);
    case 'updated':
      return stampSortValue(a.updatedDate) - stampSortValue(b.updatedDate);
    default:
      return a.id.localeCompare(b.id, undefined, { numeric: true });
  }
}

export function InventoryPage({ navigate, initialCategory = '', initialLocation = '' }: { navigate: Navigate; initialCategory?: string; initialLocation?: string }) {
  const { state, changes } = useSession();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState(initialLocation);
  const [addedBy, setAddedBy] = useState('');
  const [sort, setSort] = useState<SortKey>('id');
  const [desc, setDesc] = useState(false);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [details, setDetails] = useState<InventoryItem | null>(null);
  const { requestDelete, dialog } = useItemDelete(() => setDetails(null));

  const people = useMemo(() => [...new Set(state.items.map((i) => i.addedBy).filter(Boolean))].sort(), [state.items]);
  const statusOf = (it: InventoryItem): 'new' | 'edited' | null => {
    const fp = state.original.fingerprints.get(it.uid);
    if (fp === undefined) return 'new';
    return fp === itemFingerprint(it) ? null : 'edited';
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = state.items.filter((i) => {
      if (category && i.category !== category) return false;
      if (location && i.location !== location) return false;
      if (addedBy && i.addedBy !== addedBy) return false;
      if (!q) return true;
      return [i.name, i.id, i.category, i.location, i.description].some((f) => f.toLowerCase().includes(q));
    });
    list.sort((a, b) => compare(a, b, sort) * (desc ? -1 : 1));
    return list;
  }, [state.items, query, category, location, addedBy, sort, desc]);

  const activeFilters = [category, location, addedBy].filter(Boolean).length + (query ? 1 : 0);
  const clear = () => (setQuery(''), setCategory(''), setLocation(''), setAddedBy(''));
  const totalQty = filtered.reduce((s, i) => s + i.quantity, 0);

  const actions = (it: InventoryItem) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconButton icon={Eye} label="View details" onClick={() => setDetails(it)} />
      <IconButton icon={Pencil} label="Edit" onClick={() => navigate(`/edit/${it.uid}`)} />
      <IconButton icon={Trash2} label="Delete" onClick={() => requestDelete(it)} className="hover:bg-red-50 hover:text-red-600" />
    </div>
  );
  const marker = (it: InventoryItem) => {
    const s = statusOf(it);
    if (s === 'new') return <Badge tone="green">New</Badge>;
    if (s === 'edited') return <Badge tone="amber">Edited</Badge>;
    return null;
  };

  return (
    <div>
      <PageHeader
        title="All inventory"
        subtitle={`${formatNumber(state.items.length)} records · ${formatNumber(state.items.reduce((s, i) => s + i.quantity, 0))} total quantity${changes.total ? ` · ${changes.added} new, ${changes.edited} edited, ${changes.deleted} deleted` : ''}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => navigate('/add')}>
            Add item
          </Button>
        }
      />

      <Card className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, category, location, description…" className="pl-9" type="search" aria-label="Search inventory" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="lg:w-44">
              <option value="">All categories</option>
              {state.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Filter by location" className="lg:w-48">
              <option value="">All locations</option>
              {state.locations.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={addedBy} onChange={(e) => setAddedBy(e.target.value)} aria-label="Filter by person" className="col-span-2 sm:col-span-1 lg:w-40">
              <option value="">Anyone</option>
              {people.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">Sort by</span>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8! w-40! py-0 text-xs" aria-label="Sort by">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <IconButton icon={desc ? ArrowDownWideNarrow : ArrowUpNarrowWide} label={desc ? 'Descending' : 'Ascending'} onClick={() => setDesc((d) => !d)} className="border border-line" />
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" icon={X} onClick={clear}>
              Clear filters
            </Button>
          )}
          <span className="ml-auto text-xs text-muted tabular-nums">
            {filtered.length === state.items.length ? `${formatNumber(filtered.length)} items` : `${formatNumber(filtered.length)} of ${formatNumber(state.items.length)} items · qty ${formatNumber(totalQty)}`}
          </span>
          <div className="hidden rounded-lg border border-line p-0.5 lg:flex">
            {(['table', 'grid'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cx('rounded-md p-1.5', view === v ? 'bg-slate-100 text-ink' : 'text-muted hover:text-ink')}
                aria-label={v === 'table' ? 'Table view' : 'Card view'}
                aria-pressed={view === v}
              >
                {v === 'table' ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {state.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={PackageOpen}
            title="No items yet"
            text="Add your first item. It will be saved into the Excel file when you download it."
            action={
              <Button variant="primary" icon={Plus} onClick={() => navigate('/add')}>
                Add item
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={SearchX} title="No matching items" text="Try a different search or clear the filters." action={<Button onClick={clear}>Clear filters</Button>} />
        </Card>
      ) : (
        <>
          {/* Table: desktop only */}
          {view === 'table' && (
            <Card className="hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[76px]" />
                    <col className="w-[92px]" />
                    <col />
                    <col className="w-[130px]" />
                    <col className="w-[60px]" />
                    <col className="w-[15%]" />
                    <col className="w-[16%]" />
                    <col className="w-[132px]" />
                    <col className="w-[112px]" />
                  </colgroup>
                  <thead className="border-b border-line bg-slate-50/80 text-[11px] font-semibold tracking-wide text-muted uppercase">
                    <tr>
                      <th className="px-4 py-3">Photo</th>
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">Name · Added by</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3">Created · Updated</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((it) => (
                      <tr key={it.uid} className="group transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <button onClick={() => setDetails(it)} className="block overflow-hidden rounded-lg" aria-label={`View ${it.name}`}>
                            <ItemPhoto item={it} className="size-11 rounded-lg" iconClass="size-4" />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[13px] font-medium whitespace-nowrap text-ink">{it.id || <span className="text-red-500">No ID</span>}</td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setDetails(it)} className="block max-w-full truncate text-left font-medium text-ink hover:text-primary" title={it.name}>
                            {it.name}
                          </button>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {marker(it)}
                            <span className="truncate text-xs text-muted">{it.addedBy || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{it.category ? <Badge tone="blue">{it.category}</Badge> : <span className="text-slate-400">—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatNumber(it.quantity)}</td>
                        <td className="truncate px-3 py-2.5 text-muted" title={it.location}>
                          {it.location || '—'}
                        </td>
                        <td className="truncate px-3 py-2.5 text-muted" title={it.description}>
                          {it.description || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs leading-5 whitespace-nowrap text-muted">
                          <div title={`Created ${it.createdDate}`}>{prettyStamp(it.createdDate, false)}</div>
                          <div title={`Updated ${it.updatedDate}`} className="text-slate-400">
                            {prettyStamp(it.updatedDate, false)}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">{actions(it)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Cards: always on mobile/tablet, optional on desktop */}
          <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', view === 'table' && 'lg:hidden')}>
            {filtered.map((it) => (
              <Card key={it.uid} className="overflow-hidden">
                <div className="flex gap-3 p-3">
                  <button onClick={() => setDetails(it)} className="shrink-0 overflow-hidden rounded-xl" aria-label={`View ${it.name}`}>
                    <ItemPhoto item={it} className="size-24 rounded-xl" iconClass="size-6" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-muted">{it.id || 'No ID'}</span>
                      {marker(it)}
                    </div>
                    <button onClick={() => setDetails(it)} className="mt-0.5 block w-full truncate text-left font-semibold text-ink">
                      {it.name}
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {it.category && <Badge tone="blue">{it.category}</Badge>}
                      <span className="text-xs text-muted">
                        Qty <strong className="text-ink tabular-nums">{formatNumber(it.quantity)}</strong>
                      </span>
                    </div>
                    {it.location && (
                      <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted">
                        <MapPin className="size-3 shrink-0" /> {it.location}
                      </p>
                    )}
                  </div>
                </div>
                {it.description && <p className="line-clamp-2 px-3 text-xs text-muted">{it.description}</p>}
                <div className="mt-2 flex items-center justify-between border-t border-line px-3 py-1.5">
                  <span className="truncate text-[11px] text-muted">
                    {it.addedBy ? `${it.addedBy} · ` : ''}Updated {prettyStamp(it.updatedDate)}
                  </span>
                  {actions(it)}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <ItemDetails
        item={details ? state.items.find((i) => i.uid === details.uid) ?? null : null}
        onClose={() => setDetails(null)}
        onEdit={(i) => navigate(`/edit/${i.uid}`)}
        onDelete={(i) => requestDelete(i)}
      />
      {dialog}
    </div>
  );
}
