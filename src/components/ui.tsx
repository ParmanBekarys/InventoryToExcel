import { Loader2, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../utils/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20',
  secondary: 'bg-card text-ink border border-line hover:bg-slate-50 hover:border-slate-300 shadow-card',
  ghost: 'text-muted hover:text-ink hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  soft: 'bg-primary-soft text-primary hover:bg-blue-100',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, className, ...rest }: { icon: LucideIcon; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-slate-100 hover:text-ink', className)}
      {...rest}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-line bg-card shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const fieldBase =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, 'h-11 sm:h-10', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'min-h-24 py-2.5 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        fieldBase,
        'h-11 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%2364748b%22%3E%3Cpath%20d%3D%22M5.3%207.3a1%201%200%20011.4%200L10%2010.6l3.3-3.3a1%201%200%20111.4%201.4l-4%204a1%201%200%2001-1.4%200l-4-4a1%201%200%20010-1.4z%22%2F%3E%3C%2Fsvg%3E")] bg-[length:1.1rem] bg-[right_0.6rem_center] bg-no-repeat pr-9 sm:h-10',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, error, required, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'violet'; className?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/10',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={cx('inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-6" />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
