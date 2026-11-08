import { ArrowRight, CheckCircle2, Image as ImageIcon, FilePlus2, FileSpreadsheet, Info, RotateCcw, ShieldCheck, TriangleAlert, User, Users } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChangeCounters, ExportButton, SaveState } from '../components/SessionWidgets';
import { Badge, Card, CardHeader, Field, Input, PageHeader, Button } from '../components/ui';
import { useSession } from '../state/SessionContext';
import { prettyStamp } from '../utils/dates';
import { formatBytes, formatNumber } from '../utils/format';

export function SessionPage({ onReset }: { onReset: () => void }) {
  const { state, dispatch, changes, reset } = useSession();
  const [confirm, setConfirm] = useState(false);
  const r = state.report;
  const warnings = r?.issues.filter((i) => i.level !== 'info') ?? [];
  const infos = r?.issues.filter((i) => i.level === 'info') ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings & session" subtitle="Everything here exists only in this browser tab." />

      <Card>
        <CardHeader icon={FileSpreadsheet} title="Current file" />
        <div className="grid gap-4 p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">Source</p>
            <p className="mt-0.5 truncate font-medium text-ink">{state.blank ? 'New blank inventory (template)' : r?.fileName}</p>
            {!state.blank && r && (
              <p className="text-xs text-muted">
                {formatBytes(r.fileSize)} · opened {prettyStamp(r.importedAt)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted">Loaded from file</p>
            <p className="mt-0.5 font-medium text-ink">
              {formatNumber(r?.itemCount ?? 0)} items · {formatNumber(r?.photoCount ?? 0)} photos
            </p>
            <p className="text-xs text-muted">Sheets: {state.context?.sheetOrder.join(', ')}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={CheckCircle2} title="Unsaved changes" subtitle="Compared with the uploaded file" />
        <div className="space-y-4 p-5">
          {changes.total === 0 ? <p className="text-sm text-muted">No changes.</p> : <ChangeCounters />}
          {(changes.categoriesAdded > 0 || changes.categoriesRemoved > 0 || changes.locationsAdded > 0 || changes.locationsRemoved > 0) && (
            <p className="text-xs text-muted">
              Categories: +{changes.categoriesAdded} / −{changes.categoriesRemoved} · Locations: +{changes.locationsAdded} / −{changes.locationsRemoved}
            </p>
          )}
          <SaveState />
          {state.lastExport && <p className="text-xs text-muted">Last download: {state.lastExport.fileName}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <ExportButton />
            <Button icon={FilePlus2} onClick={() => setConfirm(true)}>
              Start New Inventory
            </Button>
          </div>
          <p className="text-xs text-muted">
            After downloading, everything stays open so you can keep editing and download again. Refreshing or closing this page clears all changes that were not downloaded.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={User} title="Your name" subtitle="Filled into ADDED_BY for new items. Not saved after you close the tab." />
        <div className="p-5">
          <Field label="Name" htmlFor="user-name">
            <Input id="user-name" value={state.userName} onChange={(e) => dispatch({ type: 'SET_USER', name: e.target.value })} placeholder="e.g. Aigerim S." className="sm:max-w-sm" autoComplete="name" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Users} title="Working with several people" />
        <div className="space-y-3 p-5 text-sm leading-relaxed text-muted">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
            Different people <strong>do not</strong> see each other’s changes automatically. There is no shared database — the Excel file is the only copy.
          </p>
          <ol className="space-y-2">
            {['Get the latest Excel file', 'Upload it here', 'Add or edit items', 'Download Updated Excel', 'Send the new file to the next person or your manager'].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                <span className="text-ink">{s}</span>
                {i < 4 && <ArrowRight className="hidden size-3.5 text-slate-300 sm:block" />}
              </li>
            ))}
          </ol>
          <p>If two people edit separate copies at the same time, their files will differ and must be merged by hand. Agree on who holds the latest file.</p>
        </div>
      </Card>

      {r && r.issues.length > 0 && (
        <Card>
          <CardHeader icon={TriangleAlert} title="Import report" subtitle={`${warnings.length} warning(s), ${infos.length} note(s)`} />
          <ul className="divide-y divide-line">
            {[...warnings, ...infos].map((i, k) => (
              <li key={k} className="flex gap-3 px-5 py-3 text-sm">
                {i.level === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-primary" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                <p className="text-ink">{i.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader icon={ImageIcon} title="How photos are saved in Excel" subtitle="Applies to the next download. Both formats keep full photo quality." />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {(
            [
              {
                mode: 'zip',
                title: 'ZIP: Excel + assets folder',
                text: 'Downloads a ZIP with the Excel file and an assets folder of full-size photos. PHOTO cells are clickable links (assets/INV-001.jpg) that open the photo. Extract the ZIP before opening the Excel file.',
              },
              {
                mode: 'in-cell',
                title: 'Place in Cell (Excel 365)',
                text: 'Photo sits inside the cell. In Excel 365, select the cell and click the card icon next to it to see the photo large. Older Excel, Google Sheets and LibreOffice show #VALUE! instead.',
              },
              {
                mode: 'floating',
                title: 'Picture over the cell (all versions)',
                text: 'Works in every Excel version, Google Sheets and LibreOffice. Photo is fitted to the cell; to see it larger, drag its corner or use Format Picture → Size → Reset.',
              },
            ] as const
          ).map((o) => (
            <label
              key={o.mode}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${state.photoMode === o.mode ? 'border-primary bg-primary-soft/60 ring-1 ring-primary' : 'border-line hover:border-slate-300'}`}
            >
              <input type="radio" name="photo-mode" className="mt-0.5 size-4 accent-primary" checked={state.photoMode === o.mode} onChange={() => dispatch({ type: 'SET_PHOTO_MODE', mode: o.mode })} />
              <span>
                <span className="block text-sm font-medium text-ink">{o.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{o.text}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted sm:col-span-3">
            Files in either format can be uploaded here again. New photos are resized to at most 1600 px. <Badge>JPG</Badge> <Badge>PNG</Badge> <Badge>GIF</Badge>
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={ShieldCheck} title="Privacy" />
        <div className="p-5 text-sm leading-relaxed text-muted">
          <p>Your workbook and photos are processed in this browser only. Nothing is uploaded, and nothing is kept in browser storage, cookies or databases.</p>
        </div>
      </Card>

      <ConfirmDialog
        open={confirm}
        title="Start a new inventory?"
        confirmLabel={changes.unsaved ? 'Discard changes and start over' : 'Start over'}
        message={
          changes.unsaved ? (
            <>
              You have <strong className="text-ink">changes that were not downloaded</strong>. They will be lost. Your original file is not affected.
            </>
          ) : (
            'The current inventory will be closed. Your files are not affected.'
          )
        }
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          reset();
          onReset();
        }}
      />
      <div className="flex justify-center pt-2">
        <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
          <RotateCcw className="size-3" /> Close this inventory
        </button>
      </div>
    </div>
  );
}
