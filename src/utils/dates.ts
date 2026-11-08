const pad = (n: number) => String(n).padStart(2, '0');

/** Current local wall-clock time as "YYYY-MM-DD HH:mm". */
export function nowStamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * ExcelJS returns Excel dates as JS Dates whose UTC fields equal the wall-clock
 * value shown in Excel, so we read them with UTC getters.
 */
export function excelDateToStamp(d: Date): string {
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return base;
  return `${base} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Excel serial date number → stamp (1900 date system). */
export function serialToStamp(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return excelDateToStamp(new Date(ms));
}

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Stamp → Date suitable for ExcelJS (UTC fields = wall clock). Null if not a stamp. */
export function stampToExcelDate(stamp: string): { date: Date; hasTime: boolean } | null {
  const m = STAMP_RE.exec(stamp.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0, s ? +s : 0));
  if (Number.isNaN(date.getTime())) return null;
  return { date, hasTime: h !== undefined };
}

/** Sortable numeric value for a stamp (unparseable text sorts first). */
export function stampSortValue(stamp: string): number {
  const r = stampToExcelDate(stamp);
  return r ? r.date.getTime() : -Infinity;
}

/** "6 Nov 2026, 16:11" — fixed English format to match the interface language. */
export function prettyStamp(stamp: string, withTime = true): string {
  const r = stampToExcelDate(stamp);
  if (!r) return stamp || '—';
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (r.hasTime && withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return new Intl.DateTimeFormat('en-GB', opts).format(r.date);
}
