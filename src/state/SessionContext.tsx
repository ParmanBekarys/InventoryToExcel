import { createContext, useCallback, useContext, useMemo, useReducer, useState, type ReactNode } from 'react';
import { blankSession } from '../services/blankWorkbook';
import { buildWorkbook, downloadBytes, exportFileName } from '../services/excelExport';
import { buildExportZip, importUpload } from '../services/zipPackage';
import { convertToPng } from '../services/imageProcessing';
import { useBeforeUnload } from '../hooks/useBeforeUnload';
import { initialSession, sessionReducer, summarizeChanges, type ChangeSummary, type SessionAction, type SessionState } from './sessionReducer';

interface SessionApi {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
  changes: ChangeSummary;
  exporting: boolean;
  loadFile: (file: File) => Promise<void>;
  startBlank: () => void;
  /** Builds and downloads the updated workbook. Keeps the session in memory. */
  exportWorkbook: () => Promise<string>;
  downloadTemplate: () => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [exporting, setExporting] = useState(false);
  const changes = useMemo(() => summarizeChanges(state), [state]);

  useBeforeUnload(changes.unsaved);

  const loadFile = useCallback(async (file: File) => {
    // File.arrayBuffer() returns a private in-memory copy; the file on disk is never touched.
    const buffer = await file.arrayBuffer();
    const session = await importUpload(buffer, file.name, { convertImage: convertToPng });
    dispatch({ type: 'LOAD', session });
  }, []);

  const startBlank = useCallback(() => dispatch({ type: 'LOAD', session: blankSession(), blank: true }), []);

  const exportWorkbook = useCallback(async () => {
    if (!state.context) throw new Error('No inventory is loaded.');
    setExporting(true);
    try {
      const input = { items: state.items, categories: state.categories, locations: state.locations, context: state.context, photoMode: state.photoMode };
      const zip = state.photoMode === 'zip';
      const name = exportFileName(state.report?.fileName, zip ? 'zip' : 'xlsx');
      const bytes = zip ? await buildExportZip(input, exportFileName(state.report?.fileName, 'xlsx')) : await buildWorkbook(input);
      downloadBytes(bytes, name);
      dispatch({ type: 'MARK_EXPORTED', fileName: name });
      return name;
    } finally {
      setExporting(false);
    }
  }, [state]);

  const downloadTemplate = useCallback(async () => {
    const s = blankSession();
    const bytes = await buildWorkbook(s);
    downloadBytes(bytes, 'Inventory_Template.xlsx');
  }, []);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  const api = useMemo<SessionApi>(
    () => ({ state, dispatch, changes, exporting, loadFile, startBlank, exportWorkbook, downloadTemplate, reset }),
    [state, changes, exporting, loadFile, startBlank, exportWorkbook, downloadTemplate, reset],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside <SessionProvider>');
  return v;
}
