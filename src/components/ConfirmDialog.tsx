import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 p-5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-50 text-red-600' : 'bg-primary-soft text-primary'}`}>
          <TriangleAlert className="size-5" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <div className="mt-1.5 text-sm leading-relaxed text-muted">{message}</div>
        </div>
      </div>
    </Modal>
  );
}
