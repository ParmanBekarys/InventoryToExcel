import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../utils/format';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cx('anim-pop relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-card shadow-pop outline-none sm:rounded-2xl', widths[size])}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-slate-50/60 px-5 py-3.5 pb-safe sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
