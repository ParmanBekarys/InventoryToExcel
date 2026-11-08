import { Minus, Plus, Scan, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { createPortal } from 'react-dom';

const MIN = 1;
const MAX = 8;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Fullscreen photo viewer: mouse wheel / pinch / double-click / buttons to zoom, drag to move.
 * Shows the full-resolution photo held in memory.
 */
export function PhotoViewer({ src, alt, caption, onClose }: { src: string | null; alt: string; caption?: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const moved = useRef(false);

  const reset = useCallback(() => setView({ s: 1, x: 0, y: 0 }), []);
  useEffect(reset, [src, reset]);

  /** Zoom to `next`, keeping the point (px, py) — relative to the viewport centre — still. */
  const zoomAt = useCallback((next: number, px = 0, py = 0) => {
    setView((v) => {
      const s = clamp(next, MIN, MAX);
      if (s === 1) return { s: 1, x: 0, y: 0 };
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  const rel = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { px: clientX - (r.left + r.width / 2), py: clientY - (r.top + r.height / 2) };
  };

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation(); // don't also close the window underneath
        onClose();
      }
      if (e.key === '+' || e.key === '=') setView((v) => ({ ...v, s: clamp(v.s * 1.5, MIN, MAX) }));
      if (e.key === '-') zoomAt(view.s / 1.5);
      if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [src, onClose, zoomAt, reset, view.s]);

  if (!src) return null;

  const onWheel = (e: RWheelEvent) => {
    const { px, py } = rel(e.clientX, e.clientY);
    zoomAt(view.s * Math.exp(-e.deltaY * 0.0015), px, py);
  };

  const onPointerDown = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const c = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, x: view.x, y: view.y, cx: c.px, cy: c.py };
      drag.current = null;
    } else {
      drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const s = clamp((g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist, MIN, MAX);
      const k = s / g.s;
      setView(s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: g.cx - (g.cx - g.x) * k, y: g.cy - (g.cy - g.y) * k });
      moved.current = true;
    } else if (drag.current && view.s > 1) {
      const dx = e.clientX - drag.current.px;
      const dy = e.clientY - drag.current.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setView((v) => ({ ...v, x: drag.current!.x + dx, y: drag.current!.y + dy }));
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const btn = 'flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-40';

  return createPortal(
    <div className="anim-fade fixed inset-0 z-[70] flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label={`Photo: ${alt}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{caption ?? alt}</p>
        <span className="hidden text-xs text-white/60 tabular-nums sm:block">{Math.round(view.s * 100)}%</span>
        <button className={btn} onClick={() => zoomAt(view.s / 1.5)} disabled={view.s <= MIN} aria-label="Zoom out">
          <Minus className="size-5" />
        </button>
        <button className={btn} onClick={() => zoomAt(view.s * 1.5)} disabled={view.s >= MAX} aria-label="Zoom in">
          <Plus className="size-5" />
        </button>
        <button className={btn} onClick={reset} disabled={view.s === 1} aria-label="Fit to screen">
          <Scan className="size-5" />
        </button>
        <button className={btn} onClick={onClose} aria-label="Close" autoFocus>
          <X className="size-5" />
        </button>
      </div>
      <div
        ref={box}
        className={`relative flex-1 touch-none overflow-hidden select-none ${view.s > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const { px, py } = rel(e.clientX, e.clientY);
          zoomAt(view.s > 1 ? 1 : 2.5, px, py);
        }}
        onClick={(e) => {
          // A plain click on the dark background (not the photo) closes the viewer.
          if (!moved.current && e.target === e.currentTarget && view.s === 1) onClose();
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain will-change-transform"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transition: pointers.current.size ? 'none' : 'transform 120ms ease-out' }}
        />
      </div>
      <p className="pb-safe px-4 py-2 text-center text-xs text-white/50">
        <span className="hidden sm:inline">Scroll or double-click to zoom · drag to move · Esc to close</span>
        <span className="sm:hidden">Pinch or double-tap to zoom · drag to move</span>
      </p>
    </div>,
    document.body,
  );
}
