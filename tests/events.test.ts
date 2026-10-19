import { describe, it, expect } from 'vitest';
import { CreateEventSchema, UpdateEventSchema } from '../src/lib/validation/event';
import { splitTimeline } from '../src/lib/timeline';
import { renderMarkdown } from '../src/lib/markdown';
import { ReorderJobSchema, UpdateJobSchema } from '../src/lib/validation/job';

describe('event validation', () => {
  it('accepts a datetime-local value and blank optional contact fields', () => {
    const r = CreateEventSchema.safeParse({
      type: 'interview',
      occurredAt: '2026-07-01T09:30',
      title: 'Panel interview',
      contactName: '',
      contactEmail: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.occurredAt).toBeInstanceOf(Date);
      expect(r.data.contactEmail).toBeNull();
      expect(r.data.body).toBe('');
    }
  });

  it('accepts ISO datetimes with offsets', () => {
    const r = CreateEventSchema.safeParse({ occurredAt: '2026-07-01T14:30:00.000Z', title: 'Note' });
    expect(r.success && r.data.occurredAt.toISOString()).toBe('2026-07-01T14:30:00.000Z');
  });

  it('rejects missing title, bad type, bad email and bad dates', () => {
    expect(CreateEventSchema.safeParse({ occurredAt: '2026-07-01T09:30', title: ' ' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ occurredAt: '2026-07-01T09:30', title: 'x', type: 'party' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ occurredAt: '2026-07-01T09:30', title: 'x', contactEmail: 'nope' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ occurredAt: 'tomorrow-ish', title: 'x' }).success).toBe(false);
  });

  it('allows partial updates', () => {
    expect(UpdateEventSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
  });
});

describe('job status validation', () => {
  it('only accepts config stage ids', () => {
    expect(ReorderJobSchema.safeParse({ status: 'applied', boardOrder: 1.5 }).success).toBe(true);
    expect(ReorderJobSchema.safeParse({ status: 'nonexistent', boardOrder: 1 }).success).toBe(false);
    expect(ReorderJobSchema.safeParse({ status: 'applied', boardOrder: Infinity }).success).toBe(false);
    expect(UpdateJobSchema.safeParse({ status: 'nonexistent' }).success).toBe(false);
  });
});

describe('timeline split', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const events = [
    { id: 'past-note', type: 'note', occurredAt: new Date('2026-05-01T00:00:00Z') },
    { id: 'future-interview', type: 'interview', occurredAt: new Date('2026-06-10T00:00:00Z') },
    { id: 'future-screen', type: 'screen', occurredAt: new Date('2026-06-03T00:00:00Z') },
    { id: 'future-note', type: 'note', occurredAt: new Date('2026-06-05T00:00:00Z') },
    { id: 'past-interview', type: 'interview', occurredAt: new Date('2026-05-20T00:00:00Z') },
  ];

  it('pins future interviews soonest-first and keeps the rest reverse-chronological', () => {
    const { upcoming, past } = splitTimeline(events, now);
    expect(upcoming.map((e) => e.id)).toEqual(['future-screen', 'future-interview']);
    expect(past.map((e) => e.id)).toEqual(['future-note', 'past-interview', 'past-note']);
  });
});

describe('markdown rendering', () => {
  it('renders basic markdown', () => {
    expect(renderMarkdown('**bold** and _em_')).toContain('<strong>bold</strong>');
  });

  it('strips scripts, handlers and javascript: links', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script|onerror|<img/i);
    const link = renderMarkdown('[x](javascript:alert(1))');
    expect(link).not.toMatch(/href="javascript:/i);
  });

  it('adds safe rel to links', () => {
    expect(renderMarkdown('[site](https://example.com)')).toContain('rel="noopener noreferrer"');
  });

  it('returns empty string for blank input', () => {
    expect(renderMarkdown('   ')).toBe('');
  });
});
