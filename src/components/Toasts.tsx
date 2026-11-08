import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from '../utils/format';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const Ctx = createContext<(text: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? TriangleAlert : Info;
          return (
            <div
              key={t.id}
              className="anim-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 text-sm shadow-pop"
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon className={cx('mt-0.5 size-4 shrink-0', t.kind === 'success' && 'text-emerald-600', t.kind === 'error' && 'text-red-600', t.kind === 'info' && 'text-primary')} />
              <p className="flex-1 text-ink">{t.text}</p>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
