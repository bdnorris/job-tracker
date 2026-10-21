import { z } from 'zod';
import config from '../../config';
import type { TrackerConfig } from '../../config/schema';
import { findSkillsInText, normalizeSkills } from '../skills/match';
import { htmlToText, prepareDescription } from '../highlights/html';
import { FetchError, safeFetch } from './fetch';
import { EXTRACTORS } from './registry';
import type { ExtractContext, ExtractInput, ExtractResult, ExtractedJob, Extractor, ExtractorOutput, FieldSources } from './types';

/** Fields that mean the job is "complete enough" that AI isn't needed (spec: Extraction runner step 4). */
const REQUIRED: (keyof ExtractedJob)[] = ['title', 'company', 'descriptionText'];
/** Below this much remaining budget, AI is deferred to a follow-up request instead. */
export const AI_MIN_BUDGET_MS = 4000;
export const MAX_TEXT_INPUT = 100_000;

const SalarySchema = z
  .object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    period: z.enum(['year', 'month', 'hour']).optional(),
  })
  .refine((s) => s.min !== undefined || s.max !== undefined)
  .refine((s) => s.min === undefined || s.max === undefined || s.max >= s.min, 'max below min');

const FIELD_SCHEMAS: Record<keyof ExtractedJob, z.ZodTypeAny> = {
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  location: z.string().min(1).max(500),
  remoteType: z.enum(['remote', 'hybrid', 'onsite']),
  salary: SalarySchema,
  skills: z.array(z.string().min(1).max(60)).max(100),
  descriptionHtml: z.string().max(500_000),
  descriptionText: z.string().max(500_000),
};

const MERGE_FIELDS: (keyof ExtractedJob)[] = ['title', 'company', 'location', 'remoteType', 'salary', 'descriptionHtml', 'descriptionText'];

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as object).every((x) => x === undefined || x === null || x === '');
  return false;
}

export interface RunOptions {
  forceAi?: boolean;
  /** Injected for tests. */
  extractors?: Record<string, Extractor>;
  fetchPage?: (url: string, timeoutMs: number) => Promise<string>;
  fetchJson?: (url: string, timeoutMs: number) => Promise<unknown>;
  config?: TrackerConfig;
  now?: () => number;
}

interface Accumulator {
  job: ExtractedJob;
  fieldSources: FieldSources;
  skills: string[];
  warnings: string[];
  attempted: ExtractResult['attempted'];
  companyFallback?: { value: string; source: string };
}

/** Merges one extractor's output: first non-empty value wins; `override` lets AI replace earlier values. */
function merge(acc: Accumulator, name: string, out: ExtractorOutput, override: boolean) {
  for (const key of MERGE_FIELDS) {
    const value = out[key];
    if (isEmpty(value)) continue;
    const parsed = FIELD_SCHEMAS[key].safeParse(value);
    if (!parsed.success) {
      acc.warnings.push(`${name} returned an invalid ${key}; it was ignored.`);
      continue;
    }
    if (isEmpty(acc.job[key]) || override) {
      (acc.job as any)[key] = parsed.data;
      acc.fieldSources[key] = name;
    }
  }
  if (out.skills?.length) {
    acc.skills.push(...out.skills);
    acc.fieldSources.skills ??= name;
  }
  if (out.companyFallback && !acc.companyFallback) acc.companyFallback = { value: out.companyFallback, source: name };
  if (out.warnings) acc.warnings.push(...out.warnings);
}

/** AI is needed when a required field, salary, or skills are still missing (fillGapsOnly mode). */
function needsAi(acc: Accumulator): boolean {
  const { job } = acc;
  const description = job.descriptionText || (job.descriptionHtml ? htmlToText(job.descriptionHtml) : '');
  const missing = REQUIRED.some((k) => (k === 'descriptionText' ? !description.trim() : isEmpty(job[k])));
  const skills = acc.skills.length > 0 || findSkillsInText(description).length > 0;
  return missing || isEmpty(job.salary) || !skills;
}

/** Plain text for AI: the extracted description, else the pasted text, else the page's text. */
function readableTextFor(input: ExtractInput, job: ExtractedJob): string {
  if (job.descriptionText) return [job.title, job.company, job.location, job.descriptionText].filter(Boolean).join('\n');
  if (input.kind === 'text') return input.text;
  return input.html ? htmlToText(input.html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')) : '';
}

function makeContext(acc: Accumulator, input: ExtractInput, cfg: TrackerConfig, deadline: number, now: () => number, fetchJson: RunOptions['fetchJson']): ExtractContext {
  const remainingMs = () => deadline - now();
  return {
    config: cfg,
    remainingMs,
    found: acc.job,
    readableText: () => readableTextFor(input, acc.job),
    fetchJson: (url) => fetchJson!(url, Math.max(500, Math.min(cfg.scraper.fetchTimeoutMs, remainingMs()))),
  };
}

async function attempt(acc: Accumulator, ex: Extractor, input: ExtractInput, ctx: ExtractContext, override: boolean, now: () => number) {
  const started = now();
  try {
    const out = await ex.extract(input, ctx);
    if (out) merge(acc, ex.name, out, override);
    acc.attempted.push({ name: ex.name, ok: out !== null, ms: now() - started });
  } catch (err: any) {
    acc.attempted.push({ name: ex.name, ok: false, ms: now() - started, error: err?.message ?? String(err) });
    acc.warnings.push(ex.name === 'ai' ? err?.message ?? 'AI extraction failed.' : `${ex.name}: ${err?.message ?? 'failed'}`);
  }
}

/** Sanitizes the description, derives its text, normalizes skills and applies the company fallback. */
function finish(acc: Accumulator): ExtractResult {
  const job = { ...acc.job };
  const fieldSources = { ...acc.fieldSources };

  if (job.descriptionHtml || job.descriptionText) {
    const { descriptionHtml, descriptionText } = prepareDescription({ html: job.descriptionHtml, text: job.descriptionText });
    const source = fieldSources.descriptionHtml ?? fieldSources.descriptionText;
    job.descriptionHtml = descriptionHtml ?? undefined;
    job.descriptionText = descriptionText ?? undefined;
    if (source) fieldSources.descriptionHtml = fieldSources.descriptionText = source;
  }

  // ATS APIs don't list skills, so config skills mentioned in the final description count too.
  const fromText = job.descriptionText ? findSkillsInText(`${job.title ?? ''}\n${job.descriptionText}`) : [];
  const skills = normalizeSkills([...acc.skills, ...fromText]);
  if (skills.length) {
    job.skills = skills;
    fieldSources.skills ??= 'heuristic';
  } else delete fieldSources.skills;

  if (isEmpty(job.company) && acc.companyFallback) {
    job.company = acc.companyFallback.value;
    fieldSources.company = `${acc.companyFallback.source}-url`;
    acc.warnings.push('The company name was guessed from the URL; please check it.');
  }

  return { job, fieldSources, warnings: acc.warnings, attempted: acc.attempted };
}

const defaultFetchPage = async (url: string, timeoutMs: number, cfg: TrackerConfig) =>
  (await safeFetch(url, { timeoutMs, userAgent: cfg.scraper.userAgent })).body;

const defaultFetchJson = async (url: string, timeoutMs: number, cfg: TrackerConfig) => {
  const page = await safeFetch(url, { timeoutMs, userAgent: cfg.scraper.userAgent, accept: 'application/json', maxBytes: 8 * 1024 * 1024 });
  try {
    return JSON.parse(page.body);
  } catch {
    throw new Error('The API returned invalid JSON.');
  }
};

/**
 * Runs the extraction pipeline. Never throws: whatever was found comes back with warnings
 * and a per-extractor record. AI runs last, only when fields are missing (or when forced),
 * and only if enough of the request budget is left; otherwise `aiPending` is set.
 */
export async function runExtraction(input: ExtractInput, opts: RunOptions = {}): Promise<ExtractResult> {
  const cfg = opts.config ?? config;
  const now = opts.now ?? Date.now;
  const deadline = now() + cfg.scraper.requestBudgetMs;
  const extractors = opts.extractors ?? EXTRACTORS;
  const fetchPage = opts.fetchPage ?? ((u, t) => defaultFetchPage(u, t, cfg));
  const fetchJson = opts.fetchJson ?? ((u, t) => defaultFetchJson(u, t, cfg));
  const acc: Accumulator = { job: {}, fieldSources: {}, skills: [], warnings: [], attempted: [] };

  let working: ExtractInput = input;
  if (input.kind === 'text' && input.text.length > MAX_TEXT_INPUT) {
    working = { kind: 'text', text: input.text.slice(0, MAX_TEXT_INPUT) };
    acc.warnings.push(`Pasted text was longer than ${MAX_TEXT_INPUT.toLocaleString('en-US')} characters and was truncated.`);
  }

  if (working.kind === 'url' && working.html === undefined) {
    // Leave time for ATS APIs and AI after the page fetch.
    const timeout = Math.max(1000, Math.min(cfg.scraper.fetchTimeoutMs, deadline - now() - 1500));
    try {
      working = { ...working, html: await fetchPage(working.url, timeout) };
    } catch (err: any) {
      if (err instanceof FetchError && (err.code === 'INVALID_URL' || err.code === 'BLOCKED_ADDRESS')) {
        acc.warnings.push(err.message);
        return { ...finish(acc), aiPending: false };
      }
      acc.warnings.push(`Could not fetch the page (${err?.message ?? 'error'}). Sites like LinkedIn and Indeed block servers; paste the text instead.`);
    }
  }

  const ctx = makeContext(acc, working, cfg, deadline, now, fetchJson);
  let aiPending = false;

  for (const name of cfg.scraper.order) {
    const ex = extractors[name];
    if (!ex || !ex.enabled() || !ex.canHandle(working)) continue;

    if (name === 'ai') {
      const wanted = opts.forceAi || !cfg.scraper.ai.fillGapsOnly || needsAi(acc);
      if (!wanted) continue;
      if (ctx.remainingMs() < AI_MIN_BUDGET_MS) {
        aiPending = true;
        continue;
      }
      await attempt(acc, ex, working, ctx, Boolean(opts.forceAi), now);
      continue;
    }
    await attempt(acc, ex, working, ctx, false, now);
  }

  if (opts.forceAi && !(extractors.ai?.enabled() ?? false)) acc.warnings.push('AI extraction is not configured (set ANTHROPIC_API_KEY).');
  return { ...finish(acc), aiPending };
}

/**
 * Follow-up AI pass for when the first request ran out of budget. Takes the text and the
 * fields already found (from the review form) so the page doesn't need to be fetched again.
 */
export async function runAiFollowUp(
  args: { text: string; job: ExtractedJob; fieldSources: FieldSources; force?: boolean },
  opts: Pick<RunOptions, 'extractors' | 'config' | 'now'> = {}
): Promise<ExtractResult> {
  const cfg = opts.config ?? config;
  const now = opts.now ?? Date.now;
  const extractors = opts.extractors ?? EXTRACTORS;
  const ex = extractors.ai;
  const acc: Accumulator = {
    job: { ...args.job },
    fieldSources: { ...args.fieldSources },
    skills: [...(args.job.skills ?? [])],
    warnings: [],
    attempted: [],
  };
  if (!ex?.enabled()) {
    acc.warnings.push('AI extraction is not configured (set ANTHROPIC_API_KEY).');
    return { ...finish(acc), aiPending: false };
  }

  const input: ExtractInput = { kind: 'text', text: args.text.slice(0, MAX_TEXT_INPUT) };
  const ctx = makeContext(acc, input, cfg, now() + cfg.scraper.requestBudgetMs, now, async () => {
    throw new Error('Not available in the AI follow-up.');
  });
  // Use the posting text as given rather than rebuilding it from fields.
  ctx.readableText = () => args.text;
  await attempt(acc, ex, input, ctx, Boolean(args.force), now);
  return { ...finish(acc), aiPending: false };
}
