import { describe, it, expect } from 'vitest';
import { jsonld, findJobPostings } from '../src/lib/extract/extractors/jsonld';
import { heuristic, splitTitle } from '../src/lib/extract/extractors/heuristic';
import { inferRemoteType } from '../src/lib/extract/remote';
import { normalizeSkills, findSkillsInText } from '../src/lib/skills/match';
import { fakeContext, fixture } from './helpers/extract';

const url = (html: string, u = 'https://careers.example.org/jobs/1') => ({ kind: 'url' as const, url: u, html });

describe('jsonld', () => {
  it('finds a JobPosting inside @graph and maps every field', async () => {
    const out = await jsonld.extract(url(fixture('jsonld-graph.html')), fakeContext().ctx);
    expect(out).toMatchObject({
      title: 'Data Engineer',
      company: 'Fictional Analytics',
      location: 'Remote (USA)',
      remoteType: 'remote',
      salary: { min: 115000, max: 135000, currency: 'USD', period: 'year' },
      skills: ['PostgreSQL', 'Python', 'dbt'],
    });
    expect(out!.descriptionHtml).toContain('<b>Python</b>');
  });

  it('handles arrays, @type arrays, string organizations, multiple places, and sloppy JSON', async () => {
    const html = fixture('jsonld-array.html');
    expect(findJobPostings(html)).toHaveLength(1);
    const out = await jsonld.extract(url(html), fakeContext().ctx);
    expect(out).toMatchObject({
      title: 'Support Specialist',
      company: 'Placeholder Health',
      location: 'Denver, CO, US; Boise, ID, US',
      salary: { min: 29, max: 29, currency: 'USD', period: 'hour' },
    });
    // Plain-text descriptions come through as text, not HTML.
    expect(out!.descriptionText).toMatch(/Help customers/);
    expect(out!.descriptionHtml).toBeUndefined();
  });

  it('returns null when a page has no JobPosting', async () => {
    expect(await jsonld.extract(url(fixture('heuristic-page.html')), fakeContext().ctx)).toBeNull();
    expect(jsonld.canHandle({ kind: 'text', text: 'x' })).toBe(false);
  });
});

describe('heuristic', () => {
  it('extracts from a page without structured data', async () => {
    const out = await heuristic.extract(url(fixture('heuristic-page.html')), fakeContext().ctx);
    expect(out).toMatchObject({
      title: 'Staff Software Engineer',
      company: 'Imaginary Labs',
      remoteType: 'remote',
      salary: { min: 180000, max: 215000, currency: 'USD', period: 'year' },
    });
    expect(out!.skills).toEqual(['TypeScript', 'React']);
    // Readability keeps the article and drops page chrome.
    expect(out!.descriptionHtml).toContain('Lead technical design reviews');
    expect(out!.descriptionHtml).not.toContain('All rights reserved');
  });

  it('extracts from pasted text', async () => {
    const out = await heuristic.extract({ kind: 'text', text: fixture('posting.txt') }, fakeContext().ctx);
    expect(out).toMatchObject({
      title: 'Backend Developer',
      company: 'Sample Robotics',
      location: 'Pittsburgh, PA (Hybrid)',
      remoteType: 'hybrid',
      salary: { min: 110000, max: 135000, currency: 'USD', period: 'year' },
      skills: ['JavaScript', 'TypeScript'],
    });
    expect(out!.descriptionText).toContain('warehouse automation');
  });

  it('splits common title formats', () => {
    expect(splitTitle('Senior Engineer at Example Corp')).toEqual({ title: 'Senior Engineer', company: 'Example Corp' });
    expect(splitTitle('Senior Engineer - Example Corp | Careers')).toEqual({ title: 'Senior Engineer', company: 'Example Corp' });
    expect(splitTitle('Example Corp - Senior Engineer', 'Example Corp')).toEqual({ title: 'Senior Engineer', company: 'Example Corp' });
    expect(splitTitle('Job Application for Designer at Sample Inc')).toEqual({ title: 'Job Application for Designer', company: 'Sample Inc' });
    expect(splitTitle('Designer')).toEqual({ title: 'Designer', company: undefined });
  });
});

describe('remote type and skills helpers', () => {
  it('infers remote type from locations and text', () => {
    expect(inferRemoteType('Remote, United States')).toBe('remote');
    expect(inferRemoteType('Remote - EU')).toBe('remote');
    expect(inferRemoteType('San Francisco (Hybrid)')).toBe('hybrid');
    expect(inferRemoteType('Hybrid: remote two days a week')).toBe('hybrid');
    expect(inferRemoteType('This is an on-site role in Austin')).toBe('onsite');
    expect(inferRemoteType('Dublin')).toBeUndefined();
    expect(inferRemoteType('We value remote collaboration tools')).toBeUndefined();
  });

  it('matches config skills with aliases and word boundaries', () => {
    expect(findSkillsInText('We use TS, React.js and Astro.')).toEqual(['TypeScript', 'Astro', 'React']);
    expect(findSkillsInText('Node.js services; parts and lists')).toEqual([]);
    expect(findSkillsInText('JAVASCRIPT experience')).toEqual(['JavaScript']);
    expect(findSkillsInText('TS is fine but ts in lowercase prose is not a TypeScript signal')).toEqual(['TypeScript']);
  });

  it('normalizes skills to canonical names and dedupes', () => {
    expect(normalizeSkills(['reactjs', 'React', ' typescript ', 'ts', 'Rust', 'rust', ''])).toEqual(['React', 'TypeScript', 'Rust']);
  });
});
