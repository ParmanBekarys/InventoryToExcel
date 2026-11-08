import { Camera, FileSpreadsheet, LayoutDashboard, List, MapPin, Menu, PlusCircle, Settings, Tags, Upload, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ChangeCounters, ExportButton, SaveState } from '../components/SessionWidgets';
import type { Navigate } from '../hooks/useHashRoute';
import { useSession } from '../state/SessionContext';
import { cx, formatNumber } from '../utils/format';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'All Inventory', icon: List },
  { to: '/add', label: 'Add Item', icon: PlusCircle },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/session', label: 'Settings / Session', icon: Settings },
];

function isActive(path: string, to: string) {
  const p = path.split('?')[0];
  if (to === '/inventory') return p === '/inventory' || p.startsWith('/edit/');
  return p === to;
}

function NavLinks({ path, navigate, onPick }: { path: string; navigate: Navigate; onPick?: () => void }) {
  const { state } = useSession();
  return (
    <nav className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = isActive(path, to);
        return (
          <button
            key={to}
            onClick={() => (navigate(to), onPick?.())}
            className={cx(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary-soft text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="size-4" />
            <span className="flex-1 text-left">{label}</span>
            {to === '/inventory' && <span className="text-xs text-muted tabular-nums">{formatNumber(state.items.length)}</span>}
          </button>
        );
      })}
      <button
        onClick={() => (navigate('/upload'), onPick?.())}
        className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', path === '/upload' ? 'bg-primary-soft text-primary' : 'text-slate-600 hover:bg-slate-100 hover:text-ink')}
      >
        <Upload className="size-4" />
        Upload Excel
      </button>
    </nav>
  );
}

function SidebarBody({ path, navigate, onPick }: { path: string; navigate: Navigate; onPick?: () => void }) {
  const { state } = useSession();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/30">
          <FileSpreadsheet className="size-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">Inventory Manager</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <NavLinks path={path} navigate={navigate} onPick={onPick} />
      </div>
      <div className="m-3 space-y-3 rounded-xl border border-line bg-slate-50/80 p-3.5">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Working file</p>
          <p className="mt-0.5 truncate text-sm font-medium text-ink" title={state.report?.fileName}>
            {state.blank ? 'New inventory' : state.report?.fileName}
          </p>
        </div>
        <ChangeCounters compact />
        <SaveState />
        <ExportButton className="w-full" label="Download Excel" />
      </div>
    </div>
  );
}

export function AppLayout({ path, navigate, children }: { path: string; navigate: Navigate; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { state, changes } = useSession();
  useEffect(() => setDrawer(false), [path]);

  const mobileTabs: NavItem[] = [
    { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { to: '/inventory', label: 'Items', icon: List },
    { to: '/add', label: 'Add', icon: Camera },
    { to: '/categories', label: 'Lists', icon: Tags },
    { to: '/session', label: 'Session', icon: Settings },
  ];

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-card lg:block">
        <SidebarBody path={path} navigate={navigate} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="anim-slide absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-card shadow-pop">
            <button onClick={() => setDrawer(false)} className="absolute top-4 right-3 rounded-lg p-2 text-muted hover:bg-slate-100" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <SidebarBody path={path} navigate={navigate} onPick={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-card/90 px-3 backdrop-blur lg:hidden">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-ink hover:bg-slate-100" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{state.blank ? 'New inventory' : state.report?.fileName}</p>
            <p className="truncate text-[11px] text-muted">
              {changes.unsaved ? `Unsaved · New ${changes.added} · Edited ${changes.edited} · Deleted ${changes.deleted}` : 'No unsaved changes'}
            </p>
          </div>
          <ExportButton label="Excel" size="sm" />
        </header>

        {/* Desktop top bar */}
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-line bg-page/85 px-8 backdrop-blur lg:flex">
          <div className="flex items-center gap-3">
            <SaveState />
          </div>
          <div className="flex items-center gap-3">
            <ChangeCounters compact />
            <ExportButton size="sm" />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom navigation with a prominent camera/add button */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur lg:hidden">
        <div className="grid h-16 grid-cols-5">
          {mobileTabs.map(({ to, label, icon: Icon }) => {
            const active = isActive(path, to) || (to === '/categories' && path === '/locations');
            if (to === '/add') {
              return (
                <button key={to} onClick={() => navigate(to)} className="flex flex-col items-center justify-center" aria-label="Add item with photo">
                  <span className={cx('-mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/40 ring-4 ring-page', active && 'bg-primary-hover')}>
                    <Icon className="size-6" />
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium text-primary">{label}</span>
                </button>
              );
            }
            return (
              <button key={to} onClick={() => navigate(to)} className={cx('flex flex-col items-center justify-center gap-1 text-[10px] font-medium', active ? 'text-primary' : 'text-muted')}>
                <Icon className="size-5" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
