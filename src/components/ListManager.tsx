import { Check, Lock, Pencil, Plus, Search, Trash2, X, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { usageCount, validateNewName } from '../services/lookupLists';
import { useSession } from '../state/SessionContext';
import type { ListKind } from '../state/sessionReducer';
import { formatNumber } from '../utils/format';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toasts';
import { Badge, Button, Card, EmptyState, IconButton, Input, PageHeader } from './ui';

/** Shared page for the Categories and Locations worksheets. */
export function ListManager({ list, icon: Icon, title, subtitle, placeholder, onShowItems }: { list: ListKind; icon: LucideIcon; title: string; subtitle: string; placeholder: string; onShowItems?: (name: string) => void }) {
  const { state, dispatch } = useSession();
  const toast = useToast();
  const label = list === 'categories' ? 'Category' : 'Location';
  const field = list === 'categories' ? 'category' : 'location';
  const values = state[list];
  const used = useMemo(() => state.items.map((i) => i[field]), [state.items, field]);
  const qtyBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of state.items) m.set(i[field].toLowerCase(), (m.get(i[field].toLowerCase()) ?? 0) + i.quantity);
    return m;
  }, [state.items, field]);

  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmRename, setConfirmRename] = useState<{ from: string; to: string; count: number } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = validateNewName(values, newName, label);
    if (!v.ok) return setAddError(v.error);
    dispatch({ type: 'LIST_ADD', list, name: v.value });
    toast(`${label} “${v.value}” added`);
    setNewName('');
    setAddError('');
  };

  const doRename = (from: string, to: string) => {
    dispatch({ type: 'LIST_RENAME', list, from, to });
    toast(`Renamed to “${to}”`);
    setEditing(null);
    setConfirmRename(null);
  };

  const saveEdit = (from: string) => {
    const v = validateNewName(values, editName, label, from);
    if (!v.ok) return setEditError(v.error);
    if (v.value === from) return setEditing(null);
    const count = usageCount(used, from);
    if (count > 0) setConfirmRename({ from, to: v.value, count });
    else doRename(from, v.value);
  };

  const shown = values.filter((v) => v.toLowerCase().includes(filter.trim().toLowerCase()));
  const original = state.original[list];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} subtitle={subtitle} />

      <Card className="mb-4 p-4">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Input value={newName} onChange={(e) => (setNewName(e.target.value), setAddError(''))} placeholder={placeholder} invalid={!!addError} aria-label={`New ${label.toLowerCase()} name`} maxLength={120} />
            {addError && <p className="mt-1.5 text-xs text-red-600">{addError}</p>}
          </div>
          <Button type="submit" variant="primary" icon={Plus} size="lg" className="sm:h-10">
            Add {label.toLowerCase()}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-medium text-ink">
            {formatNumber(values.length)} {values.length === 1 ? label.toLowerCase() : `${list}`}
          </p>
          {values.length > 8 && (
            <div className="relative w-48">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="!h-8 pl-8 text-xs" aria-label="Filter list" />
            </div>
          )}
        </div>
        {values.length === 0 ? (
          <EmptyState icon={Icon} title={`No ${list} yet`} text={`Add your first ${label.toLowerCase()} above.`} />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((v) => {
              const count = usageCount(used, v);
              const isNew = !original.includes(v);
              return (
                <li key={v} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon className="size-4" />
                  </div>
                  {editing === v ? (
                    <div className="flex-1">
                      <div className="flex gap-1.5">
                        <Input
                          autoFocus
                          value={editName}
                          invalid={!!editError}
                          onChange={(e) => (setEditName(e.target.value), setEditError(''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(v);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="!h-9"
                          aria-label={`Rename ${v}`}
                        />
                        <IconButton icon={Check} label="Save" onClick={() => saveEdit(v)} className="size-9 bg-primary text-white hover:bg-primary-hover hover:text-white" />
                        <IconButton icon={X} label="Cancel" onClick={() => setEditing(null)} className="size-9 border border-line" />
                      </div>
                      {editError && <p className="mt-1 text-xs text-red-600">{editError}</p>}
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink" title={v}>
                          {v} {isNew && <Badge tone="green" className="ml-1 align-middle">New</Badge>}
                        </p>
                        <button
                          type="button"
                          disabled={!count || !onShowItems}
                          onClick={() => onShowItems?.(v)}
                          className="text-xs text-muted enabled:hover:text-primary enabled:hover:underline"
                        >
                          {count ? `${count} item${count === 1 ? '' : 's'} · qty ${formatNumber(qtyBy.get(v.toLowerCase()) ?? 0)}` : 'Not used'}
                        </button>
                      </div>
                      <IconButton icon={Pencil} label={`Rename ${v}`} onClick={() => (setEditing(v), setEditName(v), setEditError(''))} />
                      {count ? (
                        <span title={`In use by ${count} item(s) — reassign them before deleting`} className="inline-flex size-8 items-center justify-center text-slate-300">
                          <Lock className="size-4" />
                        </span>
                      ) : (
                        <IconButton icon={Trash2} label={`Delete ${v}`} onClick={() => setToDelete(v)} className="hover:bg-red-50 hover:text-red-600" />
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        {label}s in use cannot be deleted (<Lock className="inline size-3" />). Renaming a {label.toLowerCase()} also updates every item that uses it. Changes are saved into the {title} sheet when you download the Excel file.
      </p>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${label.toLowerCase()}?`}
        message={<>“{toDelete}” will be removed from the {title} sheet. No items use it.</>}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            dispatch({ type: 'LIST_DELETE', list, name: toDelete });
            toast(`${label} “${toDelete}” deleted`);
          }
          setToDelete(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmRename}
        danger={false}
        title={`Rename ${label.toLowerCase()}?`}
        message={
          confirmRename && (
            <>
              “{confirmRename.from}” → “{confirmRename.to}”. {confirmRename.count} item{confirmRename.count === 1 ? '' : 's'} will be updated (their UPDATED_DATE changes too).
            </>
          )
        }
        confirmLabel="Rename"
        onCancel={() => setConfirmRename(null)}
        onConfirm={() => confirmRename && doRename(confirmRename.from, confirmRename.to)}
      />
    </div>
  );
}
