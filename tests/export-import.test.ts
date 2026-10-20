import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';
import { applyImport, exportAll, planImport } from '../src/lib/export';

// Integration test against an in-memory Postgres (PGlite) using the committed migrations.
async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db;
}

const ids = {
  job1: '11111111-1111-4111-8111-111111111111',
  job2: '22222222-2222-4222-8222-222222222222',
  skillTs: '33333333-3333-4333-8333-333333333333',
  skillGo: '44444444-4444-4444-8444-444444444444',
  hl: '55555555-5555-4555-8555-555555555555',
  ev: '66666666-6666-4666-8666-666666666666',
  prof: '77777777-7777-4777-8777-777777777777',
};

async function seed(db: Awaited<ReturnType<typeof freshDb>>) {
  await db.insert(schema.skills).values([
    { id: ids.skillTs, name: 'TypeScript' },
    { id: ids.skillGo, name: 'Go' },
  ]);
  await db.insert(schema.jobs).values([
    {
      id: ids.job1,
      url: 'https://example.com/jobs/1',
      title: 'Frontend Engineer',
      company: 'Example Corp',
      remoteType: 'remote',
      salaryMin: 100000,
      salaryMax: 120000,
      salaryPeriod: 'year',
      descriptionHtml: '<p>Use TypeScript daily.</p>',
      descriptionText: 'Use TypeScript daily.',
      fieldSources: { title: 'jsonld' },
      status: 'applied',
      priority: 2,
      boardOrder: 1.5,
      nextActionDate: '2026-11-01',
      appliedAt: new Date('2026-10-01T15:00:00Z'),
    },
    { id: ids.job2, url: null, title: 'Backend Engineer', company: 'Sample Inc', status: 'saved' },
  ]);
  await db.insert(schema.jobSkills).values([
    { jobId: ids.job1, skillId: ids.skillTs },
    { jobId: ids.job2, skillId: ids.skillGo },
  ]);
  await db.insert(schema.highlights).values({
    id: ids.hl, jobId: ids.job1, startOffset: 4, endOffset: 14, quote: 'TypeScript', prefix: 'Use ', suffix: ' daily.', category: 'requirement', note: 'Core',
  });
  await db.insert(schema.events).values({
    id: ids.ev, jobId: ids.job1, type: 'status_change', title: 'Moved to Applied', meta: { from: 'saved', to: 'applied' }, occurredAt: new Date('2026-10-01T15:00:00Z'),
  });
  await db.insert(schema.profileItems).values({
    id: ids.prof, section: 'links', sortOrder: 1, data: { label: 'Portfolio', value: 'https://example.dev' },
  });
}

/** JSON round trip, with each table sorted by a stable key, for comparing exports. */
function normalized(file: any) {
  const data = JSON.parse(JSON.stringify(file)).data;
  const key = (r: any) => r.id ?? `${r.jobId}:${r.skillId}`;
  for (const t of Object.keys(data)) data[t].sort((a: any, b: any) => key(a).localeCompare(key(b)));
  return data;
}

describe('export / import', () => {
  let source: Awaited<ReturnType<typeof freshDb>>;
  let exported: any;

  beforeAll(async () => {
    source = await freshDb();
    await seed(source);
    exported = JSON.parse(JSON.stringify(await exportAll(source)));
  }, 60000);

  it('exports a versioned file with every table', () => {
    expect(exported.format).toBe('job-tracker-export');
    expect(exported.version).toBe(1);
    expect(Object.fromEntries(Object.entries(exported.data).map(([k, v]: any) => [k, v.length]))).toEqual({
      skills: 2, jobs: 2, jobSkills: 2, highlights: 1, events: 1, profileItems: 1,
    });
  });

  it('round-trips into an empty database', async () => {
    const target = await freshDb();
    const result = await planImport(target, exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.summary.tables.jobs).toEqual({ create: 2, update: 0, reuse: 0 });

    await applyImport(target, result.plan);
    expect(normalized(await exportAll(target))).toEqual(normalized(exported));
  }, 60000);

  it('is idempotent: re-importing updates rows without duplicating them', async () => {
    const target = await freshDb();
    const first = await planImport(target, exported);
    if (!first.ok) throw new Error('plan failed');
    await applyImport(target, first.plan);

    const second = await planImport(target, exported);
    if (!second.ok) throw new Error('plan failed');
    expect(second.plan.summary.tables.jobs).toEqual({ create: 0, update: 2, reuse: 0 });
    expect(second.plan.summary.tables.skills).toEqual({ create: 0, update: 0, reuse: 2 });
    expect(second.plan.summary.tables.jobSkills).toEqual({ create: 0, update: 0, reuse: 2 });
    await applyImport(target, second.plan);
    expect(normalized(await exportAll(target))).toEqual(normalized(exported));
  }, 60000);

  it('merges into existing data by skill name and job URL', async () => {
    const target = await freshDb();
    const existingSkill = '88888888-8888-4888-8888-888888888888';
    const existingJob = '99999999-9999-4999-8999-999999999999';
    await target.insert(schema.skills).values({ id: existingSkill, name: 'TypeScript' });
    await target.insert(schema.jobs).values({ id: existingJob, url: 'https://example.com/jobs/1', title: 'Old title', company: 'Example Corp', status: 'saved' });

    const result = await planImport(target, exported);
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(result.plan.summary.tables.jobs).toEqual({ create: 1, update: 1, reuse: 0 });
    await applyImport(target, result.plan);

    const jobs = await target.select().from(schema.jobs);
    expect(jobs).toHaveLength(2);
    const merged = jobs.find((j) => j.id === existingJob)!;
    expect(merged.title).toBe('Frontend Engineer');
    const links = await target.select().from(schema.jobSkills);
    expect(links).toContainEqual({ jobId: existingJob, skillId: existingSkill });
    const [hl] = await target.select().from(schema.highlights);
    expect(hl.jobId).toBe(existingJob);
  }, 60000);

  it('rejects invalid files with readable errors', async () => {
    const target = await freshDb();
    const bad = await planImport(target, { format: 'something-else', version: 1, exportedAt: 'x', data: {} });
    expect(bad.ok).toBe(false);
    const dangling = await planImport(target, {
      ...exported,
      data: { ...exported.data, events: [{ ...exported.data.events[0], jobId: '00000000-0000-4000-8000-000000000000' }] },
    });
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) expect(dangling.errors.join(' ')).toMatch(/references missing job/);
  }, 60000);

  it('rolls back everything if any statement fails', async () => {
    const target = await freshDb();
    const result = await planImport(target, exported);
    if (!result.ok) throw new Error('plan failed');
    // Corrupt the plan after validation so the highlights insert violates its foreign key.
    result.plan.data.highlights[0].jobId = '00000000-0000-4000-8000-000000000000';
    await expect(applyImport(target, result.plan)).rejects.toThrow();
    expect(await target.select().from(schema.jobs)).toHaveLength(0);
    expect(await target.select().from(schema.skills)).toHaveLength(0);
  }, 60000);
});
