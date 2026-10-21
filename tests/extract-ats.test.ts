import { describe, it, expect } from 'vitest';
import { greenhouse, parseGreenhouseUrl } from '../src/lib/extract/extractors/greenhouse';
import { lever, parseLeverUrl } from '../src/lib/extract/extractors/lever';
import { ashby, parseAshbyUrl } from '../src/lib/extract/extractors/ashby';
import { fakeContext, fixtureJson } from './helpers/extract';

describe('greenhouse', () => {
  const API = 'https://boards-api.greenhouse.io/v1/boards/examplecorp/jobs/4012345678?pay_transparency=true';

  it('parses board URLs, embed URLs, and gh_jid pages with an embed script', () => {
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/examplecorp/jobs/4012345678')).toEqual({ board: 'examplecorp', jobId: '4012345678' });
    expect(parseGreenhouseUrl('https://job-boards.greenhouse.io/examplecorp/jobs/4012345678?gh_src=x')).toEqual({ board: 'examplecorp', jobId: '4012345678' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/embed/job_app?for=examplecorp&token=4012345678')).toEqual({ board: 'examplecorp', jobId: '4012345678' });
    const html = '<script src="https://boards.greenhouse.io/embed/job_board/js?for=examplecorp"></script>';
    expect(parseGreenhouseUrl('https://www.example.com/careers?gh_jid=4012345678', html)).toEqual({ board: 'examplecorp', jobId: '4012345678' });
    expect(parseGreenhouseUrl('https://www.example.com/careers?gh_jid=4012345678')).toBeNull();
    expect(parseGreenhouseUrl('https://example.com/jobs/1')).toBeNull();
  });

  it('maps the job board API response', async () => {
    const { ctx, requested } = fakeContext({ [API]: fixtureJson('greenhouse-job.json') });
    const out = await greenhouse.extract({ kind: 'url', url: 'https://job-boards.greenhouse.io/examplecorp/jobs/4012345678' }, ctx);
    expect(requested).toEqual([API]);
    expect(out).toMatchObject({
      title: 'Senior Frontend Engineer',
      company: 'Example Corp',
      location: 'Remote, United States',
      remoteType: 'remote',
      salary: { min: 140000, max: 175000, currency: 'USD', period: 'year' },
    });
    // Entity-encoded content is decoded to HTML (sanitizing happens later in the runner).
    expect(out!.descriptionHtml).toContain('<h2><strong>About the role</strong></h2>');
    expect(out!.descriptionHtml).toContain('401(k) match &amp; more');
  });

  it('handles jobs without pay ranges', async () => {
    const job = { ...fixtureJson('greenhouse-job.json'), pay_input_ranges: [] };
    const { ctx } = fakeContext({ [API]: job });
    const out = await greenhouse.extract({ kind: 'url', url: 'https://boards.greenhouse.io/examplecorp/jobs/4012345678' }, ctx);
    expect(out!.salary).toBeUndefined();
  });
});

describe('lever', () => {
  const ID = '0b6c2a8e-1f3d-4c5b-9a7e-2d4f6a8c0e12';

  it('parses hosted posting URLs (global and EU)', () => {
    expect(parseLeverUrl(`https://jobs.lever.co/sample-inc/${ID}`)).toEqual({ site: 'sample-inc', postingId: ID, eu: false });
    expect(parseLeverUrl(`https://jobs.lever.co/sample-inc/${ID}/apply?lever-source=x`)).toMatchObject({ postingId: ID });
    expect(parseLeverUrl(`https://jobs.eu.lever.co/sample-inc/${ID}`)).toMatchObject({ eu: true });
    expect(parseLeverUrl('https://jobs.lever.co/sample-inc')).toBeNull();
  });

  it('maps the postings API response, including lists, and offers the slug as company fallback', async () => {
    const { ctx, requested } = fakeContext({ [`https://api.lever.co/v0/postings/sample-inc/${ID}`]: fixtureJson('lever-posting.json') });
    const out = await lever.extract({ kind: 'url', url: `https://jobs.lever.co/sample-inc/${ID}` }, ctx);
    expect(requested).toHaveLength(1);
    expect(out).toMatchObject({
      title: 'Platform Engineer',
      location: 'Chicago, IL; Austin, TX',
      remoteType: 'hybrid',
      salary: { min: 130000, max: 160000, currency: 'USD', period: 'year' },
      companyFallback: 'Sample Inc',
    });
    expect(out!.company).toBeUndefined();
    expect(out!.descriptionHtml).toContain("<h3>What you'll do</h3><ul><li>Run our Kubernetes clusters</li>");
    expect(out!.descriptionHtml).toContain('flexible hours');
  });

  it('uses the EU API host for EU postings and skips one-time pay', async () => {
    const posting = { ...fixtureJson('lever-posting.json'), salaryRange: { min: 5000, max: 5000, currency: 'EUR', interval: 'one-time' } };
    const { ctx, requested } = fakeContext({ [`https://api.eu.lever.co/v0/postings/sample-inc/${ID}`]: posting });
    const out = await lever.extract({ kind: 'url', url: `https://jobs.eu.lever.co/sample-inc/${ID}` }, ctx);
    expect(requested[0]).toContain('api.eu.lever.co');
    expect(out!.salary).toBeUndefined();
  });
});

describe('ashby', () => {
  const API = 'https://api.ashbyhq.com/posting-api/job-board/demo-co?includeCompensation=true';
  const JOB = '22222222-bbbb-4ccc-8ddd-000000000002';

  it('parses hosted job URLs', () => {
    expect(parseAshbyUrl(`https://jobs.ashbyhq.com/demo-co/${JOB}`)).toEqual({ board: 'demo-co', jobId: JOB });
    expect(parseAshbyUrl(`https://jobs.ashbyhq.com/demo-co/${JOB.toUpperCase()}/application`)).toEqual({ board: 'demo-co', jobId: JOB });
    expect(parseAshbyUrl('https://jobs.ashbyhq.com/demo-co')).toBeNull();
  });

  it('finds the posting on the board and maps compensation', async () => {
    const { ctx } = fakeContext({ [API]: fixtureJson('ashby-board.json') });
    const out = await ashby.extract({ kind: 'url', url: `https://jobs.ashbyhq.com/demo-co/${JOB}` }, ctx);
    expect(out).toMatchObject({
      title: 'Product Designer',
      location: 'Remote - US; Remote - Canada',
      remoteType: 'remote',
      salary: { min: 120000, max: 150000, currency: 'USD', period: 'year' },
      companyFallback: 'Demo Co',
    });
    expect(out!.descriptionHtml).toContain('Design tools for small teams');
  });

  it('maps OnSite and reports a missing posting', async () => {
    const { ctx } = fakeContext({ [API]: fixtureJson('ashby-board.json') });
    const onsite = await ashby.extract({ kind: 'url', url: 'https://jobs.ashbyhq.com/demo-co/11111111-aaaa-4bbb-8ccc-000000000001' }, ctx);
    expect(onsite).toMatchObject({ remoteType: 'onsite', salary: undefined });
    await expect(ashby.extract({ kind: 'url', url: 'https://jobs.ashbyhq.com/demo-co/33333333-cccc-4ddd-8eee-000000000003' }, ctx)).rejects.toThrow(/not found/);
  });
});
