import { Boxes, Camera, Clock, FolderTree, History, Layers, MapPin, Package, Plus, Tags, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { BarList } from '../components/BarList';
import { ItemPhoto } from '../components/ItemPhoto';
import { ChangeCounters, ExportButton, SaveState } from '../components/SessionWidgets';
import { Button, Card, CardHeader, EmptyState, PageHeader } from '../components/ui';
import type { Navigate } from '../hooks/useHashRoute';
import { useSession } from '../state/SessionContext';
import { prettyStamp, stampSortValue } from '../utils/dates';
import { formatNumber } from '../utils/format';

function Stat({ icon: Icon, label, value, hint, onClick }: { icon: LucideIcon; label: string; value: number; hint?: string; onClick?: () => void }) {
  return (
    <Card className={onClick ? 'cursor-pointer transition-shadow hover:shadow-pop' : ''} onClick={onClick}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-muted">{label}</p>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-3xl">{formatNumber(value)}</p>
        {hint && <p className="mt-1 truncate text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

export function DashboardPage({ navigate }: { navigate: Navigate }) {
  const { state, changes } = useSession();
  const { items } = state;

  const stats = useMemo(() => {
    const qty = items.reduce((s, i) => s + i.quantity, 0);
    const withPhoto = items.filter((i) => i.photo).length;
    const byCat = new Map<string, { n: number; q: number }>();
    const byLoc = new Map<string, { n: number; q: number }>();
    for (const i of items) {
      const c = byCat.get(i.category) ?? { n: 0, q: 0 };
      byCat.set(i.category, { n: c.n + 1, q: c.q + i.quantity });
      const l = byLoc.get(i.location) ?? { n: 0, q: 0 };
      byLoc.set(i.location, { n: l.n + 1, q: l.q + i.quantity });
    }
    const recent = [...items].sort((a, b) => stampSortValue(b.createdDate) - stampSortValue(a.createdDate)).slice(0, 6);
    return { qty, withPhoto, byCat, byLoc, recent };
  }, [items]);

  const warnings = state.report?.issues.filter((i) => i.level !== 'info').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={state.blank ? 'New blank inventory' : `From ${state.report?.fileName}`}
        actions={
          <>
            <Button icon={Plus} onClick={() => navigate('/add')}>
              Add item
            </Button>
            <ExportButton />
          </>
        }
      />

      {warnings > 0 && (
        <button onClick={() => navigate('/session')} className="mb-5 flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 hover:bg-amber-100/70">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">
            {warnings} import {warnings === 1 ? 'notice needs' : 'notices need'} your attention.
          </span>
          <span className="font-medium">Review →</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={Package} label="Total Items" value={items.length} hint={`${formatNumber(stats.withPhoto)} with photos`} onClick={() => navigate('/inventory')} />
        <Stat icon={Boxes} label="Total Quantity" value={stats.qty} hint="Sum of all quantities" />
        <Stat icon={Tags} label="Categories" value={state.categories.length} hint={`${[...stats.byCat.keys()].filter(Boolean).length} in use`} onClick={() => navigate('/categories')} />
        <Stat icon={MapPin} label="Locations" value={state.locations.length} hint={`${[...stats.byLoc.keys()].filter(Boolean).length} in use`} onClick={() => navigate('/locations')} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={Clock} title="Recently added items" subtitle="Newest by created date" action={<Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}>View all</Button>} />
          {stats.recent.length === 0 ? (
            <EmptyState icon={Package} title="No items yet" text="Start by adding your first item." action={<Button variant="primary" icon={Camera} onClick={() => navigate('/add')}>Add item with photo</Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {stats.recent.map((it) => (
                <li key={it.uid}>
                  <button onClick={() => navigate(`/edit/${it.uid}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <ItemPhoto item={it} className="size-10 shrink-0 rounded-lg" iconClass="size-4" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                      <p className="truncate text-xs text-muted">
                        <span className="font-mono">{it.id}</span>
                        {it.category && ` · ${it.category}`}
                        {it.location && ` · ${it.location}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatNumber(it.quantity)}</p>
                      <p className="text-[11px] text-muted">{prettyStamp(it.createdDate)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={Layers} title="Session changes" subtitle="Compared with the uploaded file" />
          <div className="space-y-4 p-5">
            <ChangeCounters />
            <div className="grid grid-cols-2 gap-2 text-xs text-muted">
              <span>Categories +{changes.categoriesAdded} / −{changes.categoriesRemoved}</span>
              <span>Locations +{changes.locationsAdded} / −{changes.locationsRemoved}</span>
            </div>
            <SaveState />
            <ExportButton className="w-full" />
            <p className="text-xs leading-relaxed text-muted">Changes live only in this browser tab. Share the downloaded file so others see them.</p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={FolderTree} title="By category" />
          <div className="p-5">{items.length ? <BarList data={[...stats.byCat].map(([label, v]) => ({ label, value: v.n, secondary: v.q }))} valueLabel="Items" secondaryLabel="Qty" /> : <p className="text-sm text-muted">No data yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader icon={MapPin} title="By location" />
          <div className="p-5">{items.length ? <BarList data={[...stats.byLoc].map(([label, v]) => ({ label, value: v.n, secondary: v.q }))} valueLabel="Items" secondaryLabel="Qty" /> : <p className="text-sm text-muted">No data yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader icon={History} title="Recent activity" subtitle="This session only" />
          <ul className="max-h-80 space-y-3 overflow-y-auto p-5">
            {state.activity.slice(0, 12).map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.kind === 'delete' ? 'bg-red-400' : a.kind === 'add' ? 'bg-emerald-400' : a.kind === 'edit' ? 'bg-amber-400' : a.kind === 'export' ? 'bg-primary' : 'bg-slate-300'}`} />
                <div className="min-w-0">
                  <p className="break-words text-ink">{a.text}</p>
                  <p className="text-[11px] text-muted">{prettyStamp(a.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
