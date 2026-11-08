import { ArrowLeft, Camera, Minus, PackageSearch, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ListSelect } from '../components/ListSelect';
import { PhotoPicker } from '../components/PhotoPicker';
import { useToast } from '../components/Toasts';
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from '../components/ui';
import { useItemDelete } from '../hooks/useItemDelete';
import type { Navigate } from '../hooks/useHashRoute';
import { useSession } from '../state/SessionContext';
import { allKnownIds, itemFingerprint } from '../state/sessionReducer';
import type { InventoryItem, Photo } from '../types/inventory';
import { nowStamp, prettyStamp } from '../utils/dates';
import { nextInventoryId, uid } from '../utils/ids';

interface Draft {
  name: string;
  category: string;
  quantity: string;
  location: string;
  description: string;
  addedBy: string;
  photo: Photo | null;
  photoText: string;
}

export function ItemEditorPage({ editUid, navigate }: { editUid?: string; navigate: Navigate }) {
  const { state, dispatch } = useSession();
  const toast = useToast();
  const existing = editUid ? state.items.find((i) => i.uid === editUid) : undefined;
  const isEdit = !!editUid;
  const { requestDelete, dialog } = useItemDelete(() => navigate('/inventory'));

  const generatedId = useMemo(() => nextInventoryId(allKnownIds(state)), [state]);
  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? {
          name: existing.name,
          category: existing.category,
          quantity: String(existing.quantity),
          location: existing.location,
          description: existing.description,
          addedBy: existing.addedBy,
          photo: existing.photo,
          photoText: existing.photoText,
        }
      : { name: '', category: '', quantity: '1', location: '', description: '', addedBy: state.userName, photo: null, photoText: '' },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [addAnother, setAddAnother] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  if (isEdit && !existing) {
    return (
      <Card>
        <EmptyState icon={PackageSearch} title="Item not found" text="It may have been deleted." action={<Button onClick={() => navigate('/inventory')}>Back to inventory</Button>} />
      </Card>
    );
  }

  const validate = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = 'Name is required.';
    const q = Number(draft.quantity.replace(',', '.'));
    if (draft.quantity.trim() === '' || !Number.isFinite(q)) e.quantity = 'Quantity must be a number.';
    else if (q < 0) e.quantity = 'Quantity cannot be negative.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    const fields = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      quantity: Number(draft.quantity.replace(',', '.')),
      location: draft.location.trim(),
      description: draft.description.trim(),
      addedBy: draft.addedBy.trim(),
      photo: draft.photo,
      photoText: draft.photo ? '' : draft.photoText,
    };
    if (fields.addedBy && fields.addedBy !== state.userName) dispatch({ type: 'SET_USER', name: fields.addedBy });

    if (existing) {
      const candidate: InventoryItem = { ...existing, ...fields };
      if (itemFingerprint(candidate) === itemFingerprint(existing)) {
        toast('No changes to save', 'info');
        navigate('/inventory');
        return;
      }
      // Keep ID and CREATED_DATE; only UPDATED_DATE changes.
      dispatch({ type: 'UPDATE_ITEM', item: { ...candidate, updatedDate: nowStamp() } });
      toast(`Saved ${existing.id || existing.name}`);
      navigate('/inventory');
      return;
    }

    const stamp = nowStamp();
    const item: InventoryItem = { uid: uid('it'), id: nextInventoryId(allKnownIds(state)), ...fields, createdDate: stamp, updatedDate: stamp, extra: {} };
    dispatch({ type: 'ADD_ITEM', item });
    toast(`Added ${item.id} · ${item.name}`);
    if (addAnother) {
      setDraft((d) => ({ ...d, name: '', quantity: '1', description: '', photo: null, photoText: '' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/inventory');
    }
  };

  const qty = Number(draft.quantity) || 0;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl">
      <button type="button" onClick={() => navigate('/inventory')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Inventory
      </button>
      <PageHeader
        title={isEdit ? `Edit ${existing!.id || 'item'}` : 'Add new item'}
        subtitle={isEdit ? 'Change any field. The ID and created date stay the same.' : 'The item is added to this session. Download the Excel file to keep it.'}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader icon={Camera} title="Photo" subtitle="Take a picture with your camera or choose one from your gallery." />
          <div className="p-5">
            <PhotoPicker photo={draft.photo} photoText={draft.photoText} onChange={(p) => set('photo', p)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Item details" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="ID" hint={isEdit ? 'Existing IDs never change.' : 'Generated automatically and checked against all existing IDs.'}>
              <Input value={isEdit ? existing!.id : generatedId} readOnly disabled className="font-mono" />
            </Field>
            <Field label="Name" required error={errors.name} htmlFor="f-name">
              <Input id="f-name" value={draft.name} invalid={!!errors.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Office chair" maxLength={200} />
            </Field>
            <Field label="Category" htmlFor="f-cat">
              <ListSelect id="f-cat" list="categories" value={draft.category} onChange={(v) => set('category', v)} />
            </Field>
            <Field label="Quantity" required error={errors.quantity} htmlFor="f-qty">
              <div className="flex">
                <button type="button" aria-label="Decrease" onClick={() => set('quantity', String(Math.max(0, qty - 1)))} className="flex w-11 items-center justify-center rounded-l-lg border border-r-0 border-line text-muted hover:bg-slate-50 hover:text-ink">
                  <Minus className="size-4" />
                </button>
                <Input
                  id="f-qty"
                  inputMode="decimal"
                  value={draft.quantity}
                  invalid={!!errors.quantity}
                  onChange={(e) => set('quantity', e.target.value.replace(/[^\d.,]/g, ''))}
                  className="rounded-none text-center tabular-nums"
                />
                <button type="button" aria-label="Increase" onClick={() => set('quantity', String(qty + 1))} className="flex w-11 items-center justify-center rounded-r-lg border border-l-0 border-line text-muted hover:bg-slate-50 hover:text-ink">
                  <Plus className="size-4" />
                </button>
              </div>
            </Field>
            <Field label="Location" htmlFor="f-loc" className="sm:col-span-2">
              <ListSelect id="f-loc" list="locations" value={draft.location} onChange={(v) => set('location', v)} />
            </Field>
            <Field label="Description" htmlFor="f-desc" className="sm:col-span-2">
              <Textarea id="f-desc" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Model, serial number, condition, notes…" maxLength={2000} />
            </Field>
            <Field label="Added by" htmlFor="f-by" hint={isEdit ? undefined : 'Your name is remembered until you close this tab.'}>
              <Input id="f-by" value={draft.addedBy} onChange={(e) => set('addedBy', e.target.value)} placeholder="Your name" autoComplete="name" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Created">
                <Input value={isEdit ? prettyStamp(existing!.createdDate) : 'On save'} readOnly disabled />
              </Field>
              <Field label="Updated">
                <Input value={isEdit ? prettyStamp(existing!.updatedDate) : 'On save'} readOnly disabled />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-16 z-10 mt-5 -mx-4 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {isEdit ? (
            <Button icon={Trash2} variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => requestDelete(existing!)}>
              Delete item
            </Button>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-muted select-none">
              <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} className="size-4 rounded accent-primary" />
              Add another after saving
            </label>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button onClick={() => navigate('/inventory')} className="flex-1 sm:flex-none" size="lg">
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={Save} className="flex-1 sm:flex-none" size="lg">
              {isEdit ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </div>
      </div>
      {dialog}
    </form>
  );
}
