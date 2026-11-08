import { CheckCircle2, Download, Circle } from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { cx } from '../utils/format';
import { useToast } from './Toasts';
import { Button, type ButtonProps } from './ui';

/** "Download Updated Excel" — builds the workbook in the browser and saves it. The session stays open. */
export function ExportButton({ label = 'Download Updated Excel', ...rest }: Omit<ButtonProps, 'onClick'> & { label?: string }) {
  const { exportWorkbook, exporting } = useSession();
  const toast = useToast();
  return (
    <Button
      variant="primary"
      icon={Download}
      loading={exporting}
      onClick={async () => {
        try {
          const name = await exportWorkbook();
          toast(
            /\.zip$/i.test(name)
              ? `Downloaded ${name}. Extract the ZIP (right-click → Extract All) before opening the Excel file, so photo links work.`
              : `Downloaded ${name}. Share this file to pass your changes on.`,
          );
        } catch (e) {
          toast(`Export failed: ${(e as Error).message}`, 'error');
        }
      }}
      {...rest}
    >
      {label}
    </Button>
  );
}

/** New / Edited / Deleted counters plus whether the latest changes are in a downloaded file. */
export function ChangeCounters({ compact }: { compact?: boolean }) {
  const { changes } = useSession();
  const pills = [
    { label: 'New', n: changes.added, cls: 'text-emerald-700 bg-emerald-50' },
    { label: 'Edited', n: changes.edited, cls: 'text-amber-800 bg-amber-50' },
    { label: 'Deleted', n: changes.deleted, cls: 'text-red-700 bg-red-50' },
  ];
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', compact && 'text-xs')}>
      {pills.map((p) => (
        <span key={p.label} className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', p.n ? p.cls : 'bg-slate-100 text-slate-500')}>
          {p.label}: <span className="tabular-nums">{p.n}</span>
        </span>
      ))}
    </div>
  );
}

export function SaveState() {
  const { changes, state } = useSession();
  if (changes.unsaved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <Circle className="size-2 fill-amber-500 text-amber-500" />
        Unsaved changes — download to keep them
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="size-3.5" />
      {state.lastExport ? `All changes downloaded (${state.lastExport.at.slice(11)})` : changes.total ? 'Saved' : 'No changes'}
    </span>
  );
}
