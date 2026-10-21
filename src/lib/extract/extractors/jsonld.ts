import type { Extractor, ExtractorOutput, ExtractedSalary } from '../types';
import { cleanLine, decodeEntities, parseDocument } from '../html-utils';
import { inferRemoteType } from '../remote';
import { inferPeriod } from '../salary';

/**
 * schema.org JobPosting from <script type="application/ld+json">, including postings
 * nested in @graph or arrays. Maps title, hiringOrganization, jobLocation,
 * jobLocationType, baseSalary, description and skills.
 */

type Json = any;

function isJobPosting(node: Json): boolean {
  const t = node?.['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

function collect(node: Json, out: Json[], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) return node.forEach((n) => collect(n, out, depth + 1));
  if (isJobPosting(node)) out.push(node);
  if (node['@graph']) collect(node['@graph'], out, depth + 1);
}

/** Lenient JSON parse: sites often leave raw newlines/tabs inside strings or trailing commas. */
function parseLoose(text: string): Json | null {
  const attempts = [
    text,
    text.replace(/[\u0000-\u001f]+/g, ' '),
    text.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1'),
  ];
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      // try the next cleanup
    }
  }
  return null;
}

export function findJobPostings(html: string): Json[] {
  const doc = parseDocument(html);
  const out: Json[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const parsed = parseLoose(script.textContent ?? '');
    if (parsed) collect(parsed, out);
  }
  return out;
}

const text = (v: Json): string | undefined => (typeof v === 'string' ? cleanLine(decodeEntities(v)) : undefined);

function orgName(v: Json): string | undefined {
  if (typeof v === 'string') return text(v);
  if (Array.isArray(v)) return orgName(v[0]);
  return text(v?.name);
}

function placeName(place: Json): string | undefined {
  if (!place) return undefined;
  if (typeof place === 'string') return text(place);
  const a = place.address ?? place;
  if (typeof a === 'string') return text(a);
  const country = typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name;
  const parts = [a.addressLocality, a.addressRegion, country].map(text).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : text(place.name);
}

function location(p: Json): string | undefined {
  const places = Array.isArray(p.jobLocation) ? p.jobLocation : p.jobLocation ? [p.jobLocation] : [];
  const names = [...new Set(places.map(placeName).filter(Boolean))] as string[];
  if (names.length) return names.join('; ');
  const req = Array.isArray(p.applicantLocationRequirements) ? p.applicantLocationRequirements : [p.applicantLocationRequirements];
  const reqNames = req.map((r: Json) => text(r?.name)).filter(Boolean);
  return reqNames.length ? `Remote (${reqNames.join(', ')})` : undefined;
}

const UNIT: Record<string, ExtractedSalary['period']> = { HOUR: 'hour', MONTH: 'month', YEAR: 'year', ANNUAL: 'year', ANNUALLY: 'year' };

const num = (v: Json): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function salary(p: Json): ExtractedSalary | undefined {
  const base = Array.isArray(p.baseSalary) ? p.baseSalary[0] : p.baseSalary ?? p.estimatedSalary;
  if (!base) return undefined;
  const value = base.value ?? base;
  const min = num(value.minValue) ?? num(value.value);
  const max = num(value.maxValue) ?? num(value.value);
  if (min === undefined && max === undefined) return undefined;
  const unit = String(value.unitText ?? base.unitText ?? '').toUpperCase();
  const period = UNIT[unit] ?? inferPeriod(unit) ?? ((max ?? min)! < 300 ? 'hour' : 'year');
  if (unit && !UNIT[unit] && /WEEK|DAY/.test(unit)) return undefined; // weekly/daily pay doesn't map to the stored periods
  return { min: min && Math.round(min), max: max && Math.round(max), currency: text(base.currency ?? value.currency), period };
}

function skills(p: Json): string[] | undefined {
  const raw = p.skills ?? p.qualifications;
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,;\n]/);
  // Free-text sentences aren't skills; keep short items only.
  const items = list.map((s: Json) => (typeof s === 'string' ? s : s?.name)).map(text).filter((s: string | undefined) => s && s.length <= 40);
  return items.length ? (items as string[]) : undefined;
}

export const jsonld: Extractor = {
  name: 'jsonld',
  enabled: () => true,
  canHandle: (input) => input.kind === 'url' && !!input.html,
  async extract(input): Promise<ExtractorOutput | null> {
    if (input.kind !== 'url' || !input.html) return null;
    const posting = findJobPostings(input.html)[0];
    if (!posting) return null;

    const loc = location(posting);
    const telecommute = /TELECOMMUTE/i.test(JSON.stringify(posting.jobLocationType ?? ''));
    const description = typeof posting.description === 'string' ? decodeEntities(posting.description) : undefined;
    return {
      title: text(posting.title),
      company: orgName(posting.hiringOrganization),
      location: loc ?? (telecommute ? 'Remote' : undefined),
      remoteType: telecommute ? 'remote' : inferRemoteType(loc),
      salary: salary(posting),
      skills: skills(posting),
      descriptionHtml: description && /<[a-z][\s\S]*>/i.test(description) ? description : undefined,
      descriptionText: description && !/<[a-z][\s\S]*>/i.test(description) ? description : undefined,
    };
  },
};
