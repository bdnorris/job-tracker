import type { Extractor, ExtractInput, ExtractorOutput, ExtractedSalary } from '../types';
import { cleanLine, decodeEntities } from '../html-utils';
import { inferPeriod } from '../salary';
import { inferRemoteType } from '../remote';

/**
 * Greenhouse Job Board API (public, no auth):
 *   GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?pay_transparency=true
 * Verified fields: title, company_name, location.name, content (entity-encoded HTML),
 * absolute_url, pay_input_ranges[{min_cents, max_cents, currency_type, title, blurb}].
 */

const HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io']);

export function parseGreenhouseUrl(raw: string, html?: string): { board: string; jobId: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (HOSTS.has(url.hostname)) {
    // /{board}/jobs/{id}
    const m = /^\/([^/]+)\/jobs\/(\d+)/.exec(url.pathname);
    if (m && m[1] !== 'embed') return { board: m[1], jobId: m[2] };
    // /embed/job_app?for={board}&token={id}
    if (url.pathname.startsWith('/embed/job_app')) {
      const board = url.searchParams.get('for');
      const jobId = url.searchParams.get('token');
      if (board && jobId && /^\d+$/.test(jobId)) return { board, jobId };
    }
    return null;
  }

  // Company career pages that embed Greenhouse: ?gh_jid={id} plus an embed script naming the board.
  const jobId = url.searchParams.get('gh_jid');
  if (jobId && /^\d+$/.test(jobId) && html) {
    const board = /greenhouse\.io\/embed\/job_board(?:\/js)?\?[^"'\s>]*\bfor=([\w-]+)/i.exec(html)?.[1];
    if (board) return { board, jobId };
  }
  return null;
}

interface GreenhouseJob {
  title?: string;
  company_name?: string;
  location?: { name?: string } | null;
  content?: string;
  pay_input_ranges?: { min_cents?: number; max_cents?: number; currency_type?: string; title?: string; blurb?: string }[];
}

function salaryFrom(ranges: GreenhouseJob['pay_input_ranges']): ExtractedSalary | undefined {
  const r = ranges?.find((p) => typeof p.min_cents === 'number' || typeof p.max_cents === 'number');
  if (!r) return undefined;
  const min = typeof r.min_cents === 'number' ? Math.round(r.min_cents / 100) : undefined;
  const max = typeof r.max_cents === 'number' ? Math.round(r.max_cents / 100) : undefined;
  // Greenhouse doesn't state a period; use the range's own wording, then the amount's size.
  const words = `${r.title ?? ''} ${(r.blurb ?? '').replace(/<[^>]+>/g, ' ')}`;
  const period = inferPeriod(words) ?? ((max ?? min ?? 0) < 300 ? 'hour' : 'year');
  return { min, max, currency: r.currency_type || undefined, period };
}

export const greenhouse: Extractor = {
  name: 'greenhouse',
  enabled: () => true,
  canHandle: (input: ExtractInput) => input.kind === 'url' && parseGreenhouseUrl(input.url, input.html) !== null,
  async extract(input, ctx): Promise<ExtractorOutput | null> {
    if (input.kind !== 'url') return null;
    const ids = parseGreenhouseUrl(input.url, input.html);
    if (!ids) return null;

    const job = (await ctx.fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ids.board)}/jobs/${ids.jobId}?pay_transparency=true`
    )) as GreenhouseJob;

    const location = cleanLine(job.location?.name);
    return {
      title: cleanLine(job.title),
      company: cleanLine(job.company_name),
      location,
      remoteType: inferRemoteType(location),
      salary: salaryFrom(job.pay_input_ranges),
      descriptionHtml: job.content ? decodeEntities(job.content) : undefined,
    };
  },
};
