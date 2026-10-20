import { asc, getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../../db/schema';
import { EXPORT_FORMAT, EXPORT_VERSION, ExportFileSchema, type ExportData } from './schema';

/**
 * Export and import of all app data. Functions take the database as a parameter so they
 * can run against Neon in the app and PGlite in tests.
 */
type Db = any;

export const IMPORT_TABLES = ['skills', 'jobs', 'jobSkills', 'highlights', 'events', 'profileItems'] as const;
export type ImportTable = (typeof IMPORT_TABLES)[number];

export async function exportAll(db: Db) {
  const [skills, jobs, jobSkills, highlights, events, profileItems] = await Promise.all([
    db.select().from(schema.skills).orderBy(asc(schema.skills.name)),
    db.select().from(schema.jobs).orderBy(asc(schema.jobs.createdAt), asc(schema.jobs.id)),
    db.select().from(schema.jobSkills).orderBy(asc(schema.jobSkills.jobId), asc(schema.jobSkills.skillId)),
    db.select().from(schema.highlights).orderBy(asc(schema.highlights.jobId), asc(schema.highlights.startOffset)),
    db.select().from(schema.events).orderBy(asc(schema.events.jobId), asc(schema.events.occurredAt)),
    db.select().from(schema.profileItems).orderBy(asc(schema.profileItems.section), asc(schema.profileItems.sortOrder)),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: { skills, jobs, jobSkills, highlights, events, profileItems },
  };
}

export interface ImportSummary {
  tables: Record<ImportTable, { create: number; update: number; reuse: number }>;
  warnings: string[];
}

export interface ImportPlan {
  data: ExportData;
  summary: ImportSummary;
}

export type ParseResult = { ok: true; plan: ImportPlan } | { ok: false; errors: string[] };

const idsIn = async (db: Db, table: any, ids: string[]) => {
  if (ids.length === 0) return new Set<string>();
  const found = new Set<string>();
  // Chunked so very large files stay under the Postgres parameter limit.
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db.select({ id: table.id }).from(table).where(inArray(table.id, ids.slice(i, i + 1000)));
    for (const r of rows) found.add(r.id);
  }
  return found;
};

/**
 * Validates an export file and works out what importing it would do, without writing.
 * Skills are matched to existing skills by name and jobs to existing jobs by URL, so a
 * file from another instance merges instead of colliding on unique constraints.
 */
export async function planImport(db: Db, raw: unknown, opts: { stageIds?: string[]; profileSections?: string[] } = {}): Promise<ParseResult> {
  const parsed = ExportFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)) };
  }
  const input = parsed.data.data;
  const warnings: string[] = [];

  // Skills: reuse an existing skill with the same name; avoid id collisions with a different name.
  const existingSkills: { id: string; name: string }[] = await db.select().from(schema.skills);
  const skillByName = new Map(existingSkills.map((s) => [s.name, s.id]));
  const existingSkillIds = new Set(existingSkills.map((s) => s.id));
  const skillIdMap = new Map<string, string>();
  const skills: ExportData['skills'] = [];
  let skillsReused = 0;
  for (const s of input.skills) {
    const match = skillByName.get(s.name);
    if (match) {
      skillIdMap.set(s.id, match);
      skillsReused++;
    } else {
      const id = existingSkillIds.has(s.id) ? crypto.randomUUID() : s.id;
      skillIdMap.set(s.id, id);
      skills.push({ ...s, id });
    }
  }

  // Jobs: a job whose URL already exists updates that job.
  const urls = input.jobs.map((j) => j.url).filter((u): u is string => !!u);
  const urlMatches: { id: string; url: string }[] = urls.length
    ? await db.select({ id: schema.jobs.id, url: schema.jobs.url }).from(schema.jobs).where(inArray(schema.jobs.url, urls))
    : [];
  const jobByUrl = new Map(urlMatches.map((j) => [j.url, j.id]));
  const jobIdMap = new Map<string, string>();
  for (const j of input.jobs) jobIdMap.set(j.id, (j.url && jobByUrl.get(j.url)) || j.id);
  const jobs = input.jobs.map((j) => ({ ...j, id: jobIdMap.get(j.id)! }));

  const targetIds = jobs.map((j) => j.id);
  if (new Set(targetIds).size !== targetIds.length) {
    return { ok: false, errors: ['Two jobs in the file map to the same existing job (matching id and URL). Remove one and try again.'] };
  }

  const jobSkillKeys = new Set<string>();
  const jobSkills = input.jobSkills
    .map((js) => ({ jobId: jobIdMap.get(js.jobId)!, skillId: skillIdMap.get(js.skillId)! }))
    .filter((js) => {
      const key = `${js.jobId}:${js.skillId}`;
      if (jobSkillKeys.has(key)) return false;
      jobSkillKeys.add(key);
      return true;
    });
  const highlights = input.highlights.map((h) => ({ ...h, jobId: jobIdMap.get(h.jobId)! }));
  const events = input.events.map((e) => ({ ...e, jobId: jobIdMap.get(e.jobId)! }));
  const profileItems = input.profileItems;

  if (opts.stageIds) {
    const unknown = [...new Set(jobs.map((j) => j.status).filter((s) => !opts.stageIds!.includes(s)))];
    if (unknown.length) warnings.push(`Jobs use stages not in tracker.config.ts (${unknown.join(', ')}); they will appear in the list view only.`);
  }
  if (opts.profileSections) {
    const unknown = [...new Set(profileItems.map((p) => p.section).filter((s) => !opts.profileSections!.includes(s)))];
    if (unknown.length) warnings.push(`Profile items use sections not in tracker.config.ts (${unknown.join(', ')}); they will be stored but hidden.`);
  }

  const [existingJobs, existingHighlights, existingEvents, existingProfile, existingLinks] = await Promise.all([
    idsIn(db, schema.jobs, targetIds),
    idsIn(db, schema.highlights, highlights.map((h) => h.id)),
    idsIn(db, schema.events, events.map((e) => e.id)),
    idsIn(db, schema.profileItems, profileItems.map((p) => p.id)),
    targetIds.length
      ? db
          .select({ jobId: schema.jobSkills.jobId, skillId: schema.jobSkills.skillId })
          .from(schema.jobSkills)
          .where(inArray(schema.jobSkills.jobId, targetIds))
      : Promise.resolve([]),
  ]);
  const linkKeys = new Set((existingLinks as { jobId: string; skillId: string }[]).map((l) => `${l.jobId}:${l.skillId}`));
  const linksExisting = jobSkills.filter((js) => linkKeys.has(`${js.jobId}:${js.skillId}`)).length;

  const count = (rows: { id: string }[], existing: Set<string>) => {
    const update = rows.filter((r) => existing.has(r.id)).length;
    return { create: rows.length - update, update, reuse: 0 };
  };

  return {
    ok: true,
    plan: {
      data: { skills, jobs, jobSkills, highlights, events, profileItems },
      summary: {
        tables: {
          skills: { create: skills.length, update: 0, reuse: skillsReused },
          jobs: count(jobs, existingJobs),
          jobSkills: { create: jobSkills.length - linksExisting, update: 0, reuse: linksExisting },
          highlights: count(highlights, existingHighlights),
          events: count(events, existingEvents),
          profileItems: count(profileItems, existingProfile),
        },
        warnings,
      },
    },
  };
}

/** `SET col = excluded.col` for every column except the primary key. */
function excludedSet(table: PgTable) {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === 'id') continue;
    set[key] = sql.raw(`excluded."${(column as any).name}"`);
  }
  return set;
}

const CHUNK = 100;
function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** Applies a plan atomically: one Neon HTTP batch (a single transaction), or a transaction elsewhere. */
export async function applyImport(db: Db, plan: ImportPlan) {
  const { data } = plan;
  const build = (d: Db) => {
    const queries: any[] = [];
    for (const c of chunks(data.skills)) queries.push(d.insert(schema.skills).values(c).onConflictDoNothing());
    for (const c of chunks(data.jobs)) {
      queries.push(d.insert(schema.jobs).values(c).onConflictDoUpdate({ target: schema.jobs.id, set: excludedSet(schema.jobs) }));
    }
    for (const c of chunks(data.jobSkills)) queries.push(d.insert(schema.jobSkills).values(c).onConflictDoNothing());
    for (const [table, rows] of [
      [schema.highlights, data.highlights],
      [schema.events, data.events],
      [schema.profileItems, data.profileItems],
    ] as const) {
      for (const c of chunks(rows as any[])) {
        queries.push(d.insert(table).values(c).onConflictDoUpdate({ target: (table as any).id, set: excludedSet(table) }));
      }
    }
    return queries;
  };

  if (typeof db.batch === 'function') {
    const queries = build(db);
    if (queries.length > 0) await db.batch(queries);
  } else {
    await db.transaction(async (tx: Db) => {
      for (const q of build(tx)) await q;
    });
  }
}
