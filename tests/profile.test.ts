import { describe, it, expect } from 'vitest';
import { PROFILE_SECTIONS } from '../src/config/schema';
import { PROFILE_ITEM_SCHEMAS, validateProfileData } from '../src/lib/validation/profile';
import {
  formatBullets,
  formatDateRange,
  formatEducationEntry,
  formatWorkEntry,
  formatYearMonth,
  stripBullet,
} from '../src/lib/profile/format';

const work = {
  company: 'Example Corp',
  title: 'Senior Engineer',
  location: 'Remote',
  start: '2022-03',
  end: 'present',
  summary: 'Led the web platform team.',
  bullets: ['• Cut load times by 40%', '', '  - Mentored 4 engineers  ', '3) Shipped a design system'],
};

describe('profile section schemas', () => {
  it('covers every section the config allows', () => {
    expect(Object.keys(PROFILE_ITEM_SCHEMAS).sort()).toEqual([...PROFILE_SECTIONS].sort());
  });

  it('validates and normalizes work items', () => {
    const r = validateProfileData('work', work);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.end).toBe('Present');
      expect(r.data.bullets).toEqual(['• Cut load times by 40%', '- Mentored 4 engineers', '3) Shipped a design system']);
    }
  });

  it('reports per-field errors', () => {
    const r = validateProfileData('work', { ...work, company: ' ', start: '03/2022', end: '2024-13' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.fields).sort()).toEqual(['company', 'end', 'start']);
      expect(r.fields.start).toBe('Use YYYY-MM');
    }
  });

  it('allows optional education dates and requires a school', () => {
    expect(validateProfileData('education', { school: 'State University' }).ok).toBe(true);
    expect(validateProfileData('education', { school: '' }).ok).toBe(false);
    expect(validateProfileData('education', { school: 'X', start: '2019' }).ok).toBe(false);
  });

  it('requires both parts of links, answers and snippets', () => {
    expect(validateProfileData('links', { label: 'Email', value: 'me@example.com' }).ok).toBe(true);
    expect(validateProfileData('links', { label: 'Email' }).ok).toBe(false);
    expect(validateProfileData('answers', { question: 'Relocate?', answer: '' }).ok).toBe(false);
    expect(validateProfileData('snippets', { label: 'Why us', body: 'Because.' }).ok).toBe(true);
  });
});

describe('copy formatting', () => {
  it('formats year-months and ranges', () => {
    expect(formatYearMonth('2022-03')).toBe('Mar 2022');
    expect(formatYearMonth('Present')).toBe('Present');
    expect(formatDateRange('2022-03', 'Present')).toBe('Mar 2022 – Present');
    expect(formatDateRange('', '2020-05')).toBe('May 2020');
    expect(formatDateRange('', '')).toBe('');
  });

  it('strips bullet characters', () => {
    for (const line of ['• a', '- a', '* a', '– a', '1. a', '2) a', '   ▪ a']) expect(stripBullet(line)).toBe('a');
    expect(stripBullet('401k match')).toBe('401k match');
    expect(stripBullet('-5% churn')).toBe('-5% churn');
  });

  it('copies bullets one per line with no bullet characters', () => {
    expect(formatBullets(work.bullets)).toBe('Cut load times by 40%\nMentored 4 engineers\nShipped a design system');
    expect(formatBullets(undefined)).toBe('');
  });

  it('copies a work entry as clean plain text', () => {
    expect(formatWorkEntry({ ...work, end: 'Present' })).toBe(
      [
        'Senior Engineer',
        'Example Corp · Remote',
        'Mar 2022 – Present',
        'Led the web platform team.',
        '- Cut load times by 40%',
        '- Mentored 4 engineers',
        '- Shipped a design system',
      ].join('\n')
    );
  });

  it('copies an education entry, skipping empty parts', () => {
    expect(formatEducationEntry({ school: 'State University', credential: 'B.S.', field: 'Computer Science', start: '2016-08', end: '2020-05' })).toBe(
      'B.S., Computer Science\nState University\nAug 2016 – May 2020'
    );
    expect(formatEducationEntry({ school: 'Online Academy' })).toBe('Online Academy');
  });
});
