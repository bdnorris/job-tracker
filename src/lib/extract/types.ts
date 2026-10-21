import type { TrackerConfig } from '../../config/schema';

export interface ExtractedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'year' | 'month' | 'hour';
}

export interface ExtractedJob {
  title?: string;
  company?: string;
  location?: string;
  remoteType?: 'remote' | 'hybrid' | 'onsite';
  salary?: ExtractedSalary;
  skills?: string[];
  descriptionHtml?: string;
  descriptionText?: string;
}

export type ExtractInput =
  | { kind: 'url'; url: string; html?: string }
  | { kind: 'text'; text: string };

export interface ExtractContext {
  config: TrackerConfig;
  /** Fetches JSON from a public API through the SSRF-safe client, within the request budget. */
  fetchJson: (url: string) => Promise<unknown>;
  /** Milliseconds left in this request's time budget. */
  remainingMs: () => number;
  /** Fields found by earlier extractors (used by the AI extractor to fill gaps). */
  found: ExtractedJob;
  /** Readable text of the posting so far, for extractors that work on text. */
  readableText: () => string;
}

/**
 * An extractor may also suggest a company name that is only used if nothing better is
 * found (e.g. the org slug from an ATS URL, since some ATS APIs don't return the name).
 */
export type ExtractorOutput = ExtractedJob & { companyFallback?: string; warnings?: string[] };

export interface Extractor {
  name: string;
  enabled(): boolean;
  canHandle(input: ExtractInput): boolean;
  extract(input: ExtractInput, ctx: ExtractContext): Promise<ExtractorOutput | null>;
}

export type FieldSources = Partial<Record<keyof ExtractedJob, string>>;

export interface ExtractResult {
  job: ExtractedJob;
  fieldSources: FieldSources;
  warnings: string[];
  attempted: { name: string; ok: boolean; ms: number; error?: string }[];
  /** AI was wanted but didn't fit in this request's budget; the client should call /api/extract/ai. */
  aiPending?: boolean;
  /** An existing job already uses this URL. */
  duplicate?: { id: string; title: string; company: string } | null;
}
