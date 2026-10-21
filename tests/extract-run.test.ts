import { describe, it, expect, afterEach } from 'vitest';
import config from '../src/config';
import { runExtraction, runAiFollowUp, AI_MIN_BUDGET_MS } from '../src/lib/extract/run';
import { EXTRACTORS } from '../src/lib/extract/registry';
import { FetchError } from '../src/lib/extract/fetch';
import type { Extractor, ExtractorOutput } from '../src/lib/extract/types';
import { fixture, fixtureJson } from './helpers/extract';

function fake(name: string, out: ExtractorOutput | null | (() => never), opts: { enabled?: boolean; handles?: boolean } = {}) {
  const calls: number[] = [];
  const ex: Extractor = {
    name,
    enabled: () => opts.enabled ?? true,
    canHandle: () => opts.handles ?? true,
    async extract() {
      calls.push(1);
      if (typeof out === 'function') out();
      return out as ExtractorOutput | null;
    },
  };
  return Object.assign(ex, { calls });
}

const cfg = (over: Partial<typeof config.scraper> = {}, aiOver: Partial<typeof config.scraper.ai> = {}) => ({
  ...config,
  scraper: { ...config.scraper, ...over, ai: { ...config.scraper.ai, ...aiOver } },
});

const textInput = { kind: 'text' as const, text: 'A pasted posting with enough words to process.' };
const desc = '<p>Build things with TypeScript.</p>';

describe('runExtraction merge rules', () => {
  it('takes each field from the first extractor that has it and records the source', async () => {
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['greenhouse', 'jsonld', 'heuristic'] }),
      extractors: {
        greenhouse: fake('greenhouse', { title: 'From GH', salary: { min: 100000, max: 120000, currency: 'USD', period: 'year' } }),
        jsonld: fake('jsonld', { title: 'From JSON-LD', company: 'Example Corp', descriptionHtml: desc, skills: ['reactjs'] }),
        heuristic: fake('heuristic', { company: 'Ignored', location: 'Remote', skills: ['Rust', 'React'] }),
      },
    });
    expect(result.job).toMatchObject({ title: 'From GH', company: 'Example Corp', location: 'Remote' });
    expect(result.fieldSources).toMatchObject({ title: 'greenhouse', salary: 'greenhouse', company: 'jsonld', location: 'heuristic', descriptionHtml: 'jsonld' });
    // Skills: union of every extractor plus config skills in the description, normalized to canonical names.
    expect(result.job.skills).toEqual(['React', 'Rust', 'TypeScript']);
    expect(result.attempted.map((a) => a.name)).toEqual(['greenhouse', 'jsonld', 'heuristic']);
  });

  it('sanitizes the description and derives its text', async () => {
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['jsonld'] }),
      extractors: { jsonld: fake('jsonld', { descriptionHtml: '<p onclick="x()">Hi <script>bad()</script>there</p><ul><li>One</li></ul>' }) },
    });
    expect(result.job.descriptionHtml).toBe('<p>Hi there</p><ul><li>One</li></ul>');
    expect(result.job.descriptionText).toBe('Hi there\nOne');
    expect(result.fieldSources.descriptionText).toBe('jsonld');
  });

  it('drops invalid values with a warning instead of failing', async () => {
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['jsonld', 'heuristic'] }),
      extractors: {
        jsonld: fake('jsonld', { salary: { min: 200000, max: 100000 }, title: 'x'.repeat(400) }),
        heuristic: fake('heuristic', { salary: { min: 90000, max: 110000, period: 'year' }, title: 'Engineer' }),
      },
    });
    expect(result.job.salary).toEqual({ min: 90000, max: 110000, period: 'year' });
    expect(result.job.title).toBe('Engineer');
    expect(result.warnings.join(' ')).toMatch(/jsonld returned an invalid salary/);
  });

  it('never throws: extractor errors become warnings and later extractors still run', async () => {
    const later = fake('heuristic', { title: 'Still found' });
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['lever', 'heuristic'] }),
      extractors: { lever: fake('lever', () => { throw new Error('API down'); }), heuristic: later },
    });
    expect(result.job.title).toBe('Still found');
    expect(result.attempted[0]).toMatchObject({ name: 'lever', ok: false, error: 'API down' });
    expect(result.warnings).toContain('lever: API down');
  });

  it('uses an ATS slug as the company only when nothing better is found', async () => {
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['lever'] }),
      extractors: { lever: fake('lever', { title: 'Engineer', companyFallback: 'Sample Inc' }) },
    });
    expect(result.job.company).toBe('Sample Inc');
    expect(result.fieldSources.company).toBe('lever-url');
    expect(result.warnings.join(' ')).toMatch(/guessed from the URL/);
  });

  it('truncates pasted text over 100k characters', async () => {
    let seen = 0;
    const heuristic: Extractor = { name: 'heuristic', enabled: () => true, canHandle: () => true, async extract(input) { seen = input.kind === 'text' ? input.text.length : 0; return {}; } };
    const result = await runExtraction({ kind: 'text', text: 'a'.repeat(150_000) }, { config: cfg({ order: ['heuristic'] }), extractors: { heuristic } });
    expect(seen).toBe(100_000);
    expect(result.warnings[0]).toMatch(/truncated/);
  });
});

describe('runExtraction fetching', () => {
  it('fetches the page once and passes the HTML to every extractor', async () => {
    let fetches = 0;
    const seen: (string | undefined)[] = [];
    const spy = (name: string): Extractor => ({ name, enabled: () => true, canHandle: () => true, async extract(input) { seen.push(input.kind === 'url' ? input.html : undefined); return null; } });
    await runExtraction({ kind: 'url', url: 'https://example.com/jobs/1' }, {
      config: cfg({ order: ['jsonld', 'heuristic'] }),
      extractors: { jsonld: spy('jsonld'), heuristic: spy('heuristic') },
      fetchPage: async () => { fetches++; return '<html>page</html>'; },
    });
    expect(fetches).toBe(1);
    expect(seen).toEqual(['<html>page</html>', '<html>page</html>']);
  });

  it('treats a failed fetch as a warning; ATS API extractors still run', async () => {
    const job = fixtureJson('greenhouse-job.json');
    const result = await runExtraction({ kind: 'url', url: 'https://job-boards.greenhouse.io/examplecorp/jobs/4012345678' }, {
      config: cfg({ order: ['greenhouse', 'jsonld', 'heuristic'] }),
      extractors: EXTRACTORS,
      fetchPage: async () => { throw new FetchError('The server returned HTTP 403.', 'HTTP_ERROR', 403); },
      fetchJson: async () => job,
    });
    expect(result.warnings[0]).toMatch(/Could not fetch the page.*paste the text/);
    expect(result.job).toMatchObject({ title: 'Senior Frontend Engineer', company: 'Example Corp', salary: { min: 140000 } });
    // Decoded, sanitized description; config skills found in it.
    expect(result.job.descriptionHtml).toContain('<h2><strong>About the role</strong></h2>');
    expect(result.job.descriptionHtml).not.toMatch(/onclick|style=/);
    expect(result.job.skills).toEqual(['TypeScript', 'Astro', 'React']);
    expect(result.attempted.map((a) => a.name)).toEqual(['greenhouse']);
  });

  it('stops before any extractor for blocked or invalid URLs', async () => {
    const ex = fake('heuristic', { title: 'x' });
    const result = await runExtraction({ kind: 'url', url: 'http://169.254.169.254/latest/meta-data' }, {
      config: cfg({ order: ['heuristic'] }),
      extractors: { heuristic: ex },
      fetchPage: async () => { throw new FetchError('That address is not publicly reachable.', 'BLOCKED_ADDRESS'); },
    });
    expect(result.warnings).toEqual(['That address is not publicly reachable.']);
    expect(ex.calls).toHaveLength(0);
  });
});

describe('runExtraction AI step', () => {
  const complete: ExtractorOutput = {
    title: 'Engineer', company: 'Example Corp', descriptionHtml: desc,
    salary: { min: 1e5, max: 1.2e5, currency: 'USD', period: 'year' }, skills: ['TypeScript'],
  };

  it('skips AI silently when it is not configured', async () => {
    const ai = fake('ai', { title: 'AI' }, { enabled: false });
    const result = await runExtraction(textInput, { config: cfg({ order: ['heuristic', 'ai'] }), extractors: { heuristic: fake('heuristic', {}), ai } });
    expect(ai.calls).toHaveLength(0);
    expect(result.warnings).toEqual([]);
    expect(result.attempted.map((a) => a.name)).toEqual(['heuristic']);
    expect(result.aiPending).toBe(false);
  });

  it('fills only missing fields by default', async () => {
    const ai = fake('ai', { title: 'AI title', company: 'AI company', location: 'Austin, TX' });
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['heuristic', 'ai'] }),
      extractors: { heuristic: fake('heuristic', { title: 'Engineer', descriptionHtml: desc }), ai },
    });
    expect(ai.calls).toHaveLength(1);
    expect(result.job).toMatchObject({ title: 'Engineer', company: 'AI company', location: 'Austin, TX' });
    expect(result.fieldSources).toMatchObject({ title: 'heuristic', company: 'ai' });
  });

  it('does not run AI when nothing is missing', async () => {
    const ai = fake('ai', { title: 'AI title' });
    await runExtraction(textInput, { config: cfg({ order: ['heuristic', 'ai'] }), extractors: { heuristic: fake('heuristic', complete), ai } });
    expect(ai.calls).toHaveLength(0);
  });

  it('with force, runs AI and lets its values override', async () => {
    const ai = fake('ai', { title: 'AI title' });
    const result = await runExtraction(textInput, { forceAi: true, config: cfg({ order: ['heuristic', 'ai'] }), extractors: { heuristic: fake('heuristic', complete), ai } });
    expect(result.job.title).toBe('AI title');
    expect(result.fieldSources.title).toBe('ai');
    expect(result.job.company).toBe('Example Corp');
  });

  it('defers AI to a follow-up request when the budget is nearly spent', async () => {
    let t = 0;
    const slow: Extractor = { name: 'heuristic', enabled: () => true, canHandle: () => true, async extract() { t += config.scraper.requestBudgetMs - AI_MIN_BUDGET_MS + 1; return { title: 'Engineer' }; } };
    const ai = fake('ai', { company: 'AI company' });
    const result = await runExtraction(textInput, { now: () => t, config: cfg({ order: ['heuristic', 'ai'] }), extractors: { heuristic: slow, ai } });
    expect(ai.calls).toHaveLength(0);
    expect(result.aiPending).toBe(true);
  });

  it('turns AI failures into a warning', async () => {
    const result = await runExtraction(textInput, {
      config: cfg({ order: ['heuristic', 'ai'] }),
      extractors: { heuristic: fake('heuristic', {}), ai: fake('ai', () => { throw new Error('AI extraction timed out.'); }) },
    });
    expect(result.warnings).toContain('AI extraction timed out.');
  });

  it('runs the follow-up AI pass against existing fields', async () => {
    const ai = fake('ai', { title: 'AI title', company: 'AI company', skills: ['Go'] });
    const base = { text: 'posting text', job: { title: 'Engineer', skills: ['TypeScript'] }, fieldSources: { title: 'heuristic', skills: 'heuristic' } };
    const fill = await runAiFollowUp(base, { extractors: { ai } });
    expect(fill.job).toMatchObject({ title: 'Engineer', company: 'AI company', skills: ['TypeScript', 'Go'] });
    const forced = await runAiFollowUp({ ...base, force: true }, { extractors: { ai } });
    expect(forced.job.title).toBe('AI title');
    const off = await runAiFollowUp(base, { extractors: { ai: fake('ai', {}, { enabled: false }) } });
    expect(off.warnings[0]).toMatch(/not configured/);
  });
});

describe('end to end on fixtures with the real extractors', () => {
  it('pasted text', async () => {
    const result = await runExtraction({ kind: 'text', text: fixture('posting.txt') });
    expect(result.job).toMatchObject({ title: 'Backend Developer', company: 'Sample Robotics', remoteType: 'hybrid', salary: { min: 110000, max: 135000 } });
    expect(result.job.descriptionHtml).toMatch(/^<p>Backend Developer at Sample Robotics<br\s*\/?>/);
  });

  it('a JSON-LD page', async () => {
    const result = await runExtraction({ kind: 'url', url: 'https://careers.example.org/jobs/1', html: fixture('jsonld-graph.html') });
    expect(result.fieldSources).toMatchObject({ title: 'jsonld', company: 'jsonld', salary: 'jsonld' });
    expect(result.job.skills).toEqual(expect.arrayContaining(['PostgreSQL', 'Python', 'dbt']));
  });
});

afterEach(() => {
  delete process.env.__unused;
});
