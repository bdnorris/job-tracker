import { describe, it, expect } from 'vitest';
import { fromDateTimeLocalValue, toDateTimeLocalValue, todayInTz, addDays, formatDate } from '../src/lib/dates';

describe('timezone helpers', () => {
  it('interprets datetime-local values in the given timezone', () => {
    // Chicago is UTC-5 in July (CDT) and UTC-6 in January (CST).
    expect(fromDateTimeLocalValue('2026-07-01T09:30', 'America/Chicago')?.toISOString()).toBe('2026-07-01T14:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-01-15T09:30', 'America/Chicago')?.toISOString()).toBe('2026-01-15T15:30:00.000Z');
    expect(fromDateTimeLocalValue('2026-07-01T09:30', 'UTC')?.toISOString()).toBe('2026-07-01T09:30:00.000Z');
  });

  it('round-trips through toDateTimeLocalValue', () => {
    for (const tz of ['America/Chicago', 'Europe/London', 'Asia/Kolkata', 'UTC']) {
      const d = fromDateTimeLocalValue('2026-03-10T18:05', tz)!;
      expect(toDateTimeLocalValue(d, tz)).toBe('2026-03-10T18:05');
    }
  });

  it('rejects malformed input', () => {
    expect(fromDateTimeLocalValue('2026-07-01', 'UTC')).toBeNull();
    expect(fromDateTimeLocalValue('not a date', 'UTC')).toBeNull();
  });

  it('computes today in the configured timezone, not UTC', () => {
    // 03:00 UTC on Jul 2 is still Jul 1 in Chicago.
    const instant = new Date('2026-07-02T03:00:00Z');
    expect(todayInTz('America/Chicago', instant)).toBe('2026-07-01');
    expect(todayInTz('UTC', instant)).toBe('2026-07-02');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats plain dates without shifting the day', () => {
    expect(formatDate('2026-07-01')).toBe('Jul 1, 2026');
  });
});
