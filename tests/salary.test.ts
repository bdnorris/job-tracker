import { describe, it, expect } from 'vitest';
import { parseSalary } from '../src/lib/extract/salary';

describe('parseSalary: formats from the spec', () => {
  const cases: [string, object][] = [
    ['$120,000 - $150,000', { min: 120000, max: 150000, currency: 'USD', period: 'year' }],
    ['$120k–$150k', { min: 120000, max: 150000, currency: 'USD', period: 'year' }],
    ['$120K to $150K per year', { min: 120000, max: 150000, currency: 'USD', period: 'year' }],
    ['$60/hr', { min: 60, max: 60, currency: 'USD', period: 'hour' }],
    ['$60 - $75 an hour', { min: 60, max: 75, currency: 'USD', period: 'hour' }],
    ['USD 120000-150000', { min: 120000, max: 150000, currency: 'USD', period: 'year' }],
    ['£50,000', { min: 50000, max: 50000, currency: 'GBP', period: 'year' }],
    ['$130,000', { min: 130000, max: 130000, currency: 'USD', period: 'year' }],
  ];
  for (const [input, expected] of cases) {
    it(input, () => expect(parseSalary(input)).toEqual(expected));
  }
});

describe('parseSalary: more formats', () => {
  it('reads salaries inside sentences', () => {
    expect(parseSalary('The base salary range for this role is $140,000 – $175,000 annually, plus equity.')).toEqual({
      min: 140000, max: 175000, currency: 'USD', period: 'year',
    });
  });
  it('applies a trailing k to both ends', () => {
    expect(parseSalary('Compensation: $120-150k')).toEqual({ min: 120000, max: 150000, currency: 'USD', period: 'year' });
  });
  it('handles codes after the amount and other currencies', () => {
    expect(parseSalary('120,000 - 150,000 CAD per year')).toMatchObject({ min: 120000, max: 150000, currency: 'CAD' });
    expect(parseSalary('€60.000 – €75.000 brutto per year')).toMatchObject({ min: 60000, max: 75000, currency: 'EUR', period: 'year' });
    expect(parseSalary('CA$95,000 to CA$110,000')).toMatchObject({ currency: 'CAD', min: 95000, max: 110000 });
  });
  it('handles monthly and decimal hourly pay', () => {
    expect(parseSalary('$8,000 per month')).toMatchObject({ min: 8000, max: 8000, period: 'month' });
    expect(parseSalary('Pay: $45.50 - $52.25 hourly')).toMatchObject({ min: 46, max: 52, period: 'hour' });
  });
  it('accepts a bare range when a salary keyword is nearby', () => {
    expect(parseSalary('Salary range: 90,000 - 110,000')).toEqual({ min: 90000, max: 110000, period: 'year' });
  });
  it('prefers the range near salary wording over other money', () => {
    expect(parseSalary('We raised $50,000 for charity last year. Salary: $130k - $160k.')).toMatchObject({ min: 130000, max: 160000 });
  });
});

describe('parseSalary: things that are not salaries', () => {
  const negatives = [
    'Generous 401k match and 401(k) plan',
    'We are a team of 10,000 employees across 30 countries.',
    'Backed by $250M in funding from top investors.',
    'We raised $2 billion last year.',
    'Founded in 2015, we serve 120,000 customers.',
    'Version 2.5 released; call 555-1234.',
    'Great benefits and unlimited PTO.',
    '',
  ];
  for (const input of negatives) {
    it(JSON.stringify(input), () => expect(parseSalary(input)).toBeNull());
  }
  it('ignores implausible values', () => {
    expect(parseSalary('$3 per year')).toBeNull();
    expect(parseSalary('$10,000 - $900,000')).toBeNull();
  });
});
