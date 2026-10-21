import type { Extractor, ExtractInput, ExtractorOutput, ExtractedSalary } from '../types';
import { cleanLine, titleCaseSlug } from '../html-utils';

/**
 * Lever Postings API (public, no auth):
 *   GET https://api.lever.co/v0/postings/{site}/{posting_id}   (EU: api.eu.lever.co)
 * Verified fields: text, categories.location/allLocations, workplaceType
 * (unspecified | on-site | remote | hybrid), description (HTML), lists[{text, content}],
 * additional, salaryRange{min, max, currency, interval: "per-year-salary" ...}.
 * The API doesn't return the company name, so the site slug is offered as a fallback.
 */

export function parseLeverUrl(raw: string): { site: string; postingId: string; eu: boolean } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const eu = url.hostname === 'jobs.eu.lever.co';
  if (url.hostname !== 'jobs.lever.co' && !eu) return null;
  const m = /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url.pathname);
  return m ? { site: m[1], postingId: m[2], eu } : null;
}

interface LeverPosting {
  text?: string;
  categories?: { location?: string; allLocations?: string[] };
  workplaceType?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additional?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

const WORKPLACE: Record<string, ExtractorOutput['remoteType']> = {
  remote: 'remote',
  hybrid: 'hybrid',
  'on-site': 'onsite',
};

function salaryFrom(r: LeverPosting['salaryRange']): ExtractedSalary | undefined {
  if (!r || (typeof r.min !== 'number' && typeof r.max !== 'number')) return undefined;
  const interval = (r.interval ?? '').toLowerCase();
  const period = interval.includes('hour') ? 'hour' : interval.includes('month') ? 'month' : interval.includes('year') ? 'year' : undefined;
  if (!period) return undefined; // e.g. one-time or weekly amounts don't map to the job's salary fields
  return { min: r.min, max: r.max, currency: r.currency || undefined, period };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const lever: Extractor = {
  name: 'lever',
  enabled: () => true,
  canHandle: (input: ExtractInput) => input.kind === 'url' && parseLeverUrl(input.url) !== null,
  async extract(input, ctx): Promise<ExtractorOutput | null> {
    if (input.kind !== 'url') return null;
    const ids = parseLeverUrl(input.url);
    if (!ids) return null;

    const host = ids.eu ? 'api.eu.lever.co' : 'api.lever.co';
    const p = (await ctx.fetchJson(`https://${host}/v0/postings/${encodeURIComponent(ids.site)}/${ids.postingId}`)) as LeverPosting;

    const sections = (p.lists ?? [])
      .filter((l) => l.content)
      .map((l) => `${l.text ? `<h3>${escapeHtml(l.text)}</h3>` : ''}<ul>${l.content}</ul>`);
    const descriptionHtml = [p.description, ...sections, p.additional].filter(Boolean).join('\n') || undefined;

    const locations = p.categories?.allLocations?.length ? p.categories.allLocations : p.categories?.location ? [p.categories.location] : [];
    return {
      title: cleanLine(p.text),
      location: cleanLine(locations.join('; ')),
      remoteType: WORKPLACE[(p.workplaceType ?? '').toLowerCase()],
      salary: salaryFrom(p.salaryRange),
      descriptionHtml,
      companyFallback: titleCaseSlug(ids.site),
    };
  },
};
