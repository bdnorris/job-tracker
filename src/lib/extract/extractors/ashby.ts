import type { Extractor, ExtractInput, ExtractorOutput, ExtractedSalary } from '../types';
import { cleanLine, titleCaseSlug } from '../html-utils';

/**
 * Ashby public job posting API (no auth). There is no single-posting endpoint, so the
 * board is fetched and the posting picked out by id:
 *   GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 * Verified fields per job: id, title, location, secondaryLocations[{location}], isRemote,
 * workplaceType (OnSite | Remote | Hybrid), descriptionHtml, jobUrl,
 * compensation.summaryComponents[{compensationType: "Salary", interval: "1 YEAR",
 * currencyCode, minValue, maxValue}]. The board response has no company name.
 */

export function parseAshbyUrl(raw: string): { board: string; jobId: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== 'jobs.ashbyhq.com') return null;
  const m = /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url.pathname);
  return m ? { board: decodeURIComponent(m[1]), jobId: m[2].toLowerCase() } : null;
}

interface AshbyComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  descriptionHtml?: string;
  jobUrl?: string;
  compensation?: { summaryComponents?: AshbyComponent[] };
}

const WORKPLACE: Record<string, ExtractorOutput['remoteType']> = {
  remote: 'remote',
  hybrid: 'hybrid',
  onsite: 'onsite',
};

function salaryFrom(components: AshbyComponent[] | undefined): ExtractedSalary | undefined {
  const c = components?.find((x) => /salary/i.test(x.compensationType ?? '') && (x.minValue != null || x.maxValue != null));
  if (!c) return undefined;
  const interval = (c.interval ?? '').toUpperCase();
  const period = interval.includes('HOUR') ? 'hour' : interval.includes('MONTH') ? 'month' : interval.includes('YEAR') ? 'year' : undefined;
  if (!period) return undefined;
  return { min: c.minValue ?? undefined, max: c.maxValue ?? undefined, currency: c.currencyCode ?? undefined, period };
}

export const ashby: Extractor = {
  name: 'ashby',
  enabled: () => true,
  canHandle: (input: ExtractInput) => input.kind === 'url' && parseAshbyUrl(input.url) !== null,
  async extract(input, ctx): Promise<ExtractorOutput | null> {
    if (input.kind !== 'url') return null;
    const ids = parseAshbyUrl(input.url);
    if (!ids) return null;

    const board = (await ctx.fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ids.board)}?includeCompensation=true`
    )) as { jobs?: AshbyJob[] };
    const job = board.jobs?.find((j) => j.id?.toLowerCase() === ids.jobId || j.jobUrl?.toLowerCase().includes(ids.jobId));
    if (!job) throw new Error('Posting not found on the Ashby board (it may be closed or unlisted).');

    const locations = [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean);
    return {
      title: cleanLine(job.title),
      location: cleanLine(locations.join('; ')),
      remoteType: WORKPLACE[(job.workplaceType ?? '').toLowerCase()] ?? (job.isRemote ? 'remote' : undefined),
      salary: salaryFrom(job.compensation?.summaryComponents),
      descriptionHtml: job.descriptionHtml || undefined,
      companyFallback: titleCaseSlug(ids.board),
    };
  },
};
