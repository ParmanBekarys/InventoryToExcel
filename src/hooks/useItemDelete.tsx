import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toasts';
import { useSession } from '../state/SessionContext';
import type { InventoryItem } from '../types/inventory';

/** Delete with confirmation. Removes only the chosen record (and only its photo). */
export function useItemDelete(onDeleted?: () => void) {
  const { dispatch, state } = useSession();
  const toast = useToast();
  const [target, setTarget] = useState<InventoryItem | null>(null);
  const fromFile = target ? state.original.fingerprints.has(target.uid) : false;

  const dialog = (
    <ConfirmDialog
      open={!!target}
      title="Delete this item?"
      confirmLabel="Delete item"
      message={
        target && (
          <>
            <strong className="text-ink">
              {target.id} · {target.name}
            </strong>{' '}
            {target.photo ? 'and its photo ' : ''}will be removed from this session.
            {fromFile && ' Your original Excel file is not changed; the item will be missing from the next file you download.'}
          </>
        )
      }
      onCancel={() => setTarget(null)}
      onConfirm={() => {
        if (target) {
          dispatch({ type: 'DELETE_ITEM', uid: target.uid });
          toast(`Deleted ${target.id || target.name}`);
          onDeleted?.();
        }
        setTarget(null);
      }}
    />
  );
  return { requestDelete: setTarget, dialog };
}
