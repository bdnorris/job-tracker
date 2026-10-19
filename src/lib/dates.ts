import config from '../config';

const DEFAULT_TZ = config.app.timezone;

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset in ms between wall-clock time in `timeZone` and UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar date (YYYY-MM-DD) for an instant in the configured timezone. */
export function toZonedDate(date: Date = new Date(), timeZone = DEFAULT_TZ): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today's date (YYYY-MM-DD) in the configured timezone. */
export function todayInTz(timeZone = DEFAULT_TZ, now: Date = new Date()): string {
  return toZonedDate(now, timeZone);
}

/** Value for an `<input type="datetime-local">` (YYYY-MM-DDTHH:mm) in the configured timezone. */
export function toDateTimeLocalValue(date: Date, timeZone = DEFAULT_TZ): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Interprets a wall-clock `YYYY-MM-DDTHH:mm[:ss]` string as local time in `timeZone`
 * and returns the corresponding instant. Returns null for unparseable input.
 */
export function fromDateTimeLocalValue(value: string, timeZone = DEFAULT_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // Two passes handle instants near DST transitions.
  let guess = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), timeZone);
  guess = wallAsUtc - tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Adds whole days to a YYYY-MM-DD date string. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatDate(date: Date | string, timeZone = DEFAULT_TZ): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Plain calendar date: format without shifting across timezones.
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return new Date(date).toLocaleDateString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string, timeZone = DEFAULT_TZ): string {
  return new Date(date).toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
