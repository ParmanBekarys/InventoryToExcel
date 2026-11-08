import { FileSpreadsheet, FileUp, FilePlus2, Loader2, Lock, Repeat, ShieldCheck, Upload, Users, WifiOff, X, TriangleAlert, Download } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Button, Card } from '../components/ui';
import { useToast } from '../components/Toasts';
import { useSession } from '../state/SessionContext';
import { formatBytes } from '../utils/format';

export function UploadPage({ onLoaded }: { onLoaded: () => void }) {
  const { loadFile, startBlank, downloadTemplate } = useSession();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const choose = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (!/\.(xlsx|zip)$/i.test(f.name)) {
      setFile(null);
      setError(
        /\.xls$/i.test(f.name)
          ? 'Old .xls files are not supported. Open the file in Excel and choose “Save As → Excel Workbook (.xlsx)”.'
          : /\.(xlsm|xlsb|csv|ods)$/i.test(f.name)
            ? 'Only .xlsx workbooks are supported. Save the file as “Excel Workbook (.xlsx)” and try again.'
            : 'Please choose an Excel workbook (.xlsx) or a ZIP file (Excel + assets folder).',
      );
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    choose(e.dataTransfer.files?.[0]);
  };

  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await loadFile(file);
      onLoaded();
    } catch (e) {
      setError((e as Error).message || 'The file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-14">
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm shadow-primary/30">
            <FileSpreadsheet className="size-5" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Inventory Manager</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Welcome to Inventory Manager</h1>
            <p className="mt-3 text-base text-muted">Upload your Excel inventory file to get started.</p>

            <Card className="mt-8 p-2">
              <div
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => !file && input.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !file && input.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  drag ? 'border-primary bg-primary-soft' : file ? 'border-line bg-white' : 'cursor-pointer border-slate-300 bg-slate-50/60 hover:border-primary/60 hover:bg-primary-soft/40'
                }`}
              >
                <input ref={input} type="file" accept=".xlsx,.zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,application/x-zip-compressed" className="hidden" onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ''))} />
                {file ? (
                  <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-white p-3 text-left shadow-card">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <FileSpreadsheet className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                      <p className="text-xs text-muted">{formatBytes(file.size)} · {/\.zip$/i.test(file.name) ? 'ZIP (Excel + photos)' : 'Excel workbook'}</p>
                    </div>
                    <button onClick={(e) => (e.stopPropagation(), setFile(null), setError(''))} className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Remove file">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white text-primary shadow-card">
                      <Upload className="size-6" />
                    </div>
                    <p className="text-sm font-medium text-ink">
                      <span className="hidden sm:inline">Drag and drop your file here, or </span>
                      <span className="text-primary">browse files</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">Supported: .xlsx, or .zip (Excel file + assets folder with photos)</p>
                  </>
                )}
              </div>

              {error && (
                <div className="mx-2 mt-2 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex flex-col gap-2 p-2 pt-3 sm:flex-row">
                <Button icon={FileUp} onClick={() => input.current?.click()} size="lg" className="sm:flex-1">
                  Browse Files
                </Button>
                <Button variant="primary" icon={busy ? Loader2 : FileSpreadsheet} onClick={doImport} disabled={!file} loading={busy} size="lg" className="sm:flex-1">
                  {busy ? 'Reading workbook…' : 'Import'}
                </Button>
              </div>
            </Card>

            <div className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="text-muted">No file yet?</span>
              <button className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" onClick={() => (startBlank(), onLoaded())}>
                <FilePlus2 className="size-4" /> Start a new blank inventory
              </button>
              <button
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                onClick={() => downloadTemplate().catch((e) => toast(`Could not create template: ${(e as Error).message}`, 'error'))}
              >
                <Download className="size-4" /> Download blank template
              </button>
            </div>
          </div>

          <div className="space-y-3 lg:pt-24">
            {[
              { icon: Lock, title: 'Your file never leaves this device', text: 'The workbook and photos are read and edited in your browser only. Nothing is uploaded to a server.' },
              { icon: ShieldCheck, title: 'Nothing is stored', text: 'No database, no cloud, no browser storage. Closing or refreshing the page clears everything that was not downloaded.' },
              { icon: Repeat, title: 'Your original stays untouched', text: 'Changes are kept in memory. Click “Download Updated Excel” to get a new file with everything included.' },
              { icon: Users, title: 'Working with others', text: 'Other people do not see your changes automatically. Send them the downloaded file — it becomes the latest version.' },
              { icon: WifiOff, title: 'Works offline', text: 'Once this page has loaded, you can keep working without an internet connection.' },
            ].map(({ icon: I, title, text }) => (
              <div key={title} className="flex gap-3 rounded-xl p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-card">
                  <I className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
