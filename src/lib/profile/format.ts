import type { EducationItem, WorkItem } from '../validation/profile';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2022-03" → "Mar 2022"; "Present" and other values pass through. */
export function formatYearMonth(value: string | undefined | null): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatDateRange(start?: string | null, end?: string | null): string {
  const s = formatYearMonth(start);
  const e = formatYearMonth(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

/** Strips leading bullet characters a user may have pasted in. */
export function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•·–—▪◦‣]|\d+[.)])\s+/, '').trim();
}

/** "Copy bullets": one bullet per line, no bullet characters. */
export function formatBullets(bullets: string[] | undefined | null): string {
  return (bullets ?? []).map(stripBullet).filter(Boolean).join('\n');
}

const joinParts = (parts: (string | undefined | null)[], sep: string) =>
  parts.map((p) => p?.trim()).filter(Boolean).join(sep);

/** "Copy entry" for a work history item, as plain text. */
export function formatWorkEntry(item: Partial<WorkItem>): string {
  const lines = [
    item.title,
    joinParts([item.company, item.location], ' · '),
    formatDateRange(item.start, item.end),
    item.summary,
    ...(item.bullets ?? []).map(stripBullet).filter(Boolean).map((b) => `- ${b}`),
  ];
  return lines.map((l) => l?.trim()).filter(Boolean).join('\n');
}

/** "Copy entry" for an education item, as plain text. */
export function formatEducationEntry(item: Partial<EducationItem>): string {
  const lines = [
    joinParts([item.credential, item.field], ', '),
    joinParts([item.school, item.location], ' · '),
    formatDateRange(item.start, item.end),
    item.notes,
  ];
  return lines.map((l) => l?.trim()).filter(Boolean).join('\n');
}
