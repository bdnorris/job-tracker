import type { ExtractedSalary } from './types';

/**
 * Finds a salary in free text. Handles ranges and single values with currency symbols or
 * codes, k suffixes, and period words ("$120k–$150k", "$60 - $75 an hour", "USD 120000-150000",
 * "£50,000", "$130,000"). To avoid false positives (401k, headcounts, funding), a number only
 * counts when a currency marker is attached or a salary keyword is nearby.
 */

const SYMBOLS: [RegExp, string][] = [
  [/^(?:US\$|USD\$)$/i, 'USD'],
  [/^(?:CA\$|C\$|CAD\$)$/i, 'CAD'],
  [/^(?:AU\$|A\$)$/i, 'AUD'],
  [/^NZ\$$/i, 'NZD'],
  [/^\$$/, 'USD'],
  [/^£$/, 'GBP'],
  [/^€$/, 'EUR'],
  [/^₹$/, 'INR'],
  [/^¥$/, 'JPY'],
];
const CODES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD', 'CHF', 'INR', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'SGD', 'MXN', 'BRL'];

const CUR = String.raw`(?:US\$|USD\$|CA\$|C\$|CAD\$|AU\$|A\$|NZ\$|[$£€₹¥])`;
const CODE = String.raw`(?:${CODES.join('|')})`;
const NUM = String.raw`(\d{1,3}(?:[,.]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const K = String.raw`\s?([kK])?`;
// Amount with an optional currency before it (symbol or code) and an optional code after.
const AMOUNT = String.raw`(${CUR}|${CODE}\s?)?\s?${NUM}${K}(?:\s?(${CODE})\b)?`;
const SEP = String.raw`\s*(?:-|–|—|to|and)\s*`;
const RANGE_RE = new RegExp(String.raw`${AMOUNT}(?:${SEP}${AMOUNT})?`, 'gi');

const SALARY_KEYWORDS = /\b(salary|salaries|compensation|pay|paid|base|wage|wages|ote|range|rate|per (?:year|annum|hour|month)|annual(?:ly)?|hourly|monthly|yearly)\b/i;
const LARGE_UNIT_AFTER = /^\s?(?:m|mm|mn|million|b|bn|billion|\+?\s?(?:employees|people|users|customers|members))\b/i;

function currencyFrom(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const t = token.trim();
  for (const [re, code] of SYMBOLS) if (re.test(t)) return code;
  const upper = t.toUpperCase();
  return CODES.includes(upper) ? upper : undefined;
}

function toNumber(raw: string, k: string | undefined): number {
  let s = raw;
  // "60.000" / "120,000" are thousands separators; "60.50" is a decimal.
  if (/^\d{1,3}(?:[,.]\d{3})+(?:\.\d{1,2})?$/.test(s)) {
    const decimal = /\.\d{1,2}$/.test(s) && /,/.test(s) ? s.slice(s.lastIndexOf('.')) : '';
    s = s.slice(0, s.length - decimal.length).replace(/[,.]/g, '') + decimal;
  }
  const n = parseFloat(s);
  return k ? n * 1000 : n;
}

export function inferPeriod(text: string): ExtractedSalary['period'] | undefined {
  const t = text.toLowerCase();
  if (/\b(per|an|a|\/)\s?(hour|hr)\b|\/\s?h\b|\bhourly\b|\bph\b/.test(t)) return 'hour';
  if (/\b(per|a|\/)\s?(month|mo)\b|\bmonthly\b/.test(t)) return 'month';
  if (/\b(per|a|an|\/)\s?(year|yr|annum)\b|\bannual(ly)?\b|\byearly\b|\bp\.?a\.?\b/.test(t)) return 'year';
  return undefined;
}

function periodFromMagnitude(n: number): 'hour' | 'year' {
  if (n < 300) return 'hour';
  return 'year';
}

function plausible(min: number, max: number, period: ExtractedSalary['period']): boolean {
  if (!(min > 0) || !(max >= min)) return false;
  if (max > min * 5) return false;
  switch (period) {
    case 'hour':
      return min >= 5 && max <= 2000;
    case 'month':
      return min >= 300 && max <= 200000;
    default:
      return min >= 5000 && max <= 5000000;
  }
}

interface Candidate extends Required<Pick<ExtractedSalary, 'min' | 'max' | 'period'>> {
  currency?: string;
  score: number;
}

export function parseSalary(text: string | null | undefined): ExtractedSalary | null {
  if (!text) return null;
  const candidates: Candidate[] = [];

  for (const m of text.matchAll(RANGE_RE)) {
    const [whole, cur1, num1, k1, code1, cur2, num2, k2, code2] = m;
    const index = m.index ?? 0;
    const after = text.slice(index + whole.length, index + whole.length + 40);
    const before = text.slice(Math.max(0, index - 60), index);

    // "401k" / "401(k)": a k-suffixed 401 with no currency is a retirement plan.
    if (/^401$/.test(num1) && !cur1 && !num2) continue;
    if (LARGE_UNIT_AFTER.test(after)) continue;
    // Part of a larger token like a version number, date, or id.
    if (/[\d.,/]$/.test(before) || /^[\d%]/.test(after)) continue;

    const currency = currencyFrom(cur1) ?? currencyFrom(code1) ?? currencyFrom(cur2) ?? currencyFrom(code2);
    const keywordNearby = SALARY_KEYWORDS.test(before + whole + after);
    if (!currency && !keywordNearby) continue;
    // A bare number with only a nearby keyword needs to look like money (k suffix or 4+ digits).
    if (!currency && !k1 && !k2 && toNumber(num1, undefined) < 1000) continue;

    // "$120-150k": a k on the second amount applies to the first.
    let min = toNumber(num1, k1 ?? (num2 && k2 && !k1 && toNumber(num1, undefined) < 1000 ? k2 : undefined));
    let max = num2 ? toNumber(num2, k2) : min;
    if (max < min) [min, max] = [max, min];

    const period = inferPeriod(after) ?? inferPeriod(whole) ?? inferPeriod(before.slice(-25)) ?? periodFromMagnitude(max);
    if (!plausible(min, max, period)) continue;

    const score = (currency ? 2 : 0) + (keywordNearby ? 2 : 0) + (num2 ? 1 : 0) + (inferPeriod(after + whole) ? 1 : 0);
    candidates.push({ min: Math.round(min), max: Math.round(max), currency, period, score });
  }

  if (candidates.length === 0) return null;
  // Highest score wins; ties go to the first occurrence.
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const { score: _score, ...salary } = best;
  return salary.currency ? salary : { min: salary.min, max: salary.max, period: salary.period };
}
