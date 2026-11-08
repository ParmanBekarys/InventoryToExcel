import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { validateNewName } from '../services/lookupLists';
import { useSession } from '../state/SessionContext';
import type { ListKind } from '../state/sessionReducer';
import { IconButton, Input, Select } from './ui';

const ADD = '__add__';

/** A dropdown of categories/locations with an inline "Add new…" option. */
export function ListSelect({ list, value, onChange, id }: { list: ListKind; value: string; onChange: (v: string) => void; id?: string }) {
  const { state, dispatch } = useSession();
  const options = state[list];
  const label = list === 'categories' ? 'category' : 'location';
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const confirm = () => {
    const v = validateNewName(options, draft, label === 'category' ? 'Category' : 'Location');
    if (!v.ok) return setError(v.error);
    dispatch({ type: 'LIST_ADD', list, name: v.value });
    onChange(v.value);
    setAdding(false);
    setDraft('');
    setError('');
  };

  if (adding) {
    return (
      <div>
        <div className="flex gap-1.5">
          <Input
            id={id}
            autoFocus
            value={draft}
            invalid={!!error}
            placeholder={list === 'locations' ? 'e.g. Building A - Floor 1 - Room 101' : `New ${label} name`}
            onChange={(e) => (setDraft(e.target.value), setError(''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.preventDefault(), confirm());
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <IconButton icon={Check} label={`Add ${label}`} onClick={confirm} className="size-11 shrink-0 bg-primary text-white hover:bg-primary-hover hover:text-white sm:size-10" />
          <IconButton icon={X} label="Cancel" onClick={() => (setAdding(false), setError(''))} className="size-11 shrink-0 border border-line sm:size-10" />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const known = !value || options.includes(value);
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD) setAdding(true);
        else onChange(e.target.value);
      }}
    >
      <option value="">— Select {label} —</option>
      {!known && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={ADD}>＋ Add new {label}…</option>
    </Select>
  );
}

export function AddNewHint() {
  return (
    <span className="inline-flex items-center gap-1">
      <Plus className="size-3" /> Choose “Add new” to create one
    </span>
  );
}
