import { db, schema } from '../client';
import { eq, and, sql, desc, asc, ilike, or, isNull, isNotNull, lt, lte, gt, inArray } from 'drizzle-orm';
import config from '../../config';
import type { CreateJobInput, UpdateJobInput } from '../../lib/validation/job';
import { INTERVIEW_EVENT_TYPES } from '../../lib/validation/event';
import { todayInTz } from '../../lib/dates';

const stageLabel = (id: string) => config.pipeline.stages.find((s) => s.id === id)?.label ?? id;

export class NotFoundError extends Error {
  code = 'NOT_FOUND';
}

export async function createJob(input: CreateJobInput) {
  // 1. Check duplicate URL
  const cleanUrl = input.url?.trim() || null;
  if (cleanUrl) {
    const existing = await db
      .select({ id: schema.jobs.id, title: schema.jobs.title, company: schema.jobs.company })
      .from(schema.jobs)
      .where(eq(schema.jobs.url, cleanUrl))
      .limit(1);

    if (existing.length > 0) {
      const err: any = new Error(`Job already exists for URL: ${cleanUrl}`);
      err.code = 'DUPLICATE_URL';
      err.existingJob = existing[0];
      throw err;
    }
  }

  // 2. Compute board_order (place at end of the status column)
  const maxOrderRes = await db
    .select({ maxOrder: sql<number>`coalesce(max(${schema.jobs.boardOrder}), 0)` })
    .from(schema.jobs)
    .where(eq(schema.jobs.status, input.status || 'saved'));

  const nextBoardOrder = (maxOrderRes[0]?.maxOrder ?? 0) + 1;
  const isApplied = input.status === 'applied';
  const now = new Date();

  // 3. Insert job
  const [newJob] = await db
    .insert(schema.jobs)
    .values({
      title: input.title,
      company: input.company,
      location: input.location || null,
      remoteType: input.remoteType,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency || 'USD',
      salaryPeriod: input.salaryPeriod ?? null,
      url: cleanUrl,
      descriptionHtml: input.descriptionHtml || null,
      descriptionText: input.descriptionText || null,
      source: input.source || 'manual',
      fieldSources: input.fieldSources || null,
      status: input.status || 'saved',
      priority: input.priority ?? 1,
      boardOrder: nextBoardOrder,
      nextAction: input.nextAction || null,
      nextActionDate: input.nextActionDate || null,
      appliedAt: isApplied ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // 4. Handle skills
  if (input.skills && input.skills.length > 0) {
    for (const skillName of input.skills) {
      const trimmed = skillName.trim();
      if (!trimmed) continue;

      let skill = await db
        .select()
        .from(schema.skills)
        .where(eq(schema.skills.name, trimmed))
        .limit(1);

      let skillId: string;
      if (skill.length > 0) {
        skillId = skill[0].id;
      } else {
        const [insertedSkill] = await db
          .insert(schema.skills)
          .values({ name: trimmed })
          .onConflictDoNothing()
          .returning();
        if (insertedSkill) {
          skillId = insertedSkill.id;
        } else {
          const fetched = await db
            .select()
            .from(schema.skills)
            .where(eq(schema.skills.name, trimmed))
            .limit(1);
          skillId = fetched[0].id;
        }
      }

      await db
        .insert(schema.jobSkills)
        .values({ jobId: newJob.id, skillId })
        .onConflictDoNothing();
    }
  }

  // 5. Create initial event
  await db.insert(schema.events).values({
    jobId: newJob.id,
    type: isApplied ? 'applied' : 'note',
    title: isApplied ? 'Applied for role' : 'Job created',
    body: `Job added to tracker under **${stageLabel(input.status)}**`,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return newJob;
}

export async function getJobById(id: string) {
  const jobList = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (jobList.length === 0) return null;
  const job = jobList[0];

  // Fetch skills
  const skillsList = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.jobSkills)
    .innerJoin(schema.skills, eq(schema.jobSkills.skillId, schema.skills.id))
    .where(eq(schema.jobSkills.jobId, id));

  // Fetch events
  const eventsList = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.jobId, id))
    .orderBy(desc(schema.events.occurredAt));

  // Fetch highlights
  const highlightsList = await db
    .select()
    .from(schema.highlights)
    .where(eq(schema.highlights.jobId, id))
    .orderBy(asc(schema.highlights.startOffset));

  return {
    ...job,
    skills: skillsList,
    events: eventsList,
    highlights: highlightsList,
  };
}

export interface ListJobsFilters {
  status?: string;
  remoteType?: string;
  salaryMin?: number;
  search?: string;
  skill?: string;
  hasOverdueAction?: boolean;
  includeArchived?: boolean;
}

export async function listJobs(filters: ListJobsFilters = {}) {
  const conditions = [];

  if (!filters.includeArchived) {
    conditions.push(isNull(schema.jobs.archivedAt));
  }

  if (filters.status) {
    conditions.push(eq(schema.jobs.status, filters.status));
  }

  if (filters.remoteType && filters.remoteType !== 'all') {
    conditions.push(eq(schema.jobs.remoteType, filters.remoteType as any));
  }

  if (filters.salaryMin) {
    conditions.push(sql`(${schema.jobs.salaryMin} >= ${filters.salaryMin} OR ${schema.jobs.salaryMax} >= ${filters.salaryMin})`);
  }

  if (filters.skill) {
    conditions.push(sql`exists (
      select 1 from ${schema.jobSkills}
      inner join ${schema.skills} on ${schema.skills.id} = ${schema.jobSkills.skillId}
      where ${schema.jobSkills.jobId} = ${schema.jobs.id} and lower(${schema.skills.name}) = lower(${filters.skill})
    )`);
  }

  if (filters.hasOverdueAction) {
    // Overdue means strictly before today in the app timezone.
    conditions.push(
      and(
        isNotNull(schema.jobs.nextActionDate),
        lt(schema.jobs.nextActionDate, todayInTz())
      )
    );
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.jobs.title, term),
        ilike(schema.jobs.company, term),
        ilike(schema.jobs.descriptionText, term)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(schema.jobs)
    .where(whereClause)
    .orderBy(asc(schema.jobs.boardOrder), desc(schema.jobs.updatedAt));

  // Fetch skills for all returned jobs
  const jobIds = results.map((j) => j.id);
  const skillsMap: Record<string, { id: string; name: string }[]> = {};

  if (jobIds.length > 0) {
    const allSkills = await db
      .select({
        jobId: schema.jobSkills.jobId,
        id: schema.skills.id,
        name: schema.skills.name,
      })
      .from(schema.jobSkills)
      .innerJoin(schema.skills, eq(schema.jobSkills.skillId, schema.skills.id))
      .where(sql`${schema.jobSkills.jobId} IN ${jobIds}`);

    for (const s of allSkills) {
      if (!skillsMap[s.jobId]) skillsMap[s.jobId] = [];
      skillsMap[s.jobId].push({ id: s.id, name: s.name });
    }
  }

  return results.map((job) => ({
    ...job,
    skills: skillsMap[job.id] || [],
  }));
}

export async function updateJob(id: string, input: UpdateJobInput) {
  const existingList = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (existingList.length === 0) {
    throw new NotFoundError(`Job not found with id ${id}`);
  }

  const existing = existingList[0];
  const now = new Date();
  const updateValues: Record<string, any> = { updatedAt: now };

  if (input.title !== undefined) updateValues.title = input.title;
  if (input.company !== undefined) updateValues.company = input.company;
  if (input.location !== undefined) updateValues.location = input.location || null;
  if (input.remoteType !== undefined) updateValues.remoteType = input.remoteType;
  if (input.salaryMin !== undefined) updateValues.salaryMin = input.salaryMin;
  if (input.salaryMax !== undefined) updateValues.salaryMax = input.salaryMax;
  if (input.salaryCurrency !== undefined) updateValues.salaryCurrency = input.salaryCurrency;
  if (input.salaryPeriod !== undefined) updateValues.salaryPeriod = input.salaryPeriod;
  if (input.url !== undefined) updateValues.url = input.url?.trim() || null;
  if (input.descriptionHtml !== undefined) updateValues.descriptionHtml = input.descriptionHtml;
  if (input.descriptionText !== undefined) updateValues.descriptionText = input.descriptionText;
  if (input.priority !== undefined) updateValues.priority = input.priority;
  if (input.boardOrder !== undefined) updateValues.boardOrder = input.boardOrder;
  if (input.nextAction !== undefined) updateValues.nextAction = input.nextAction;
  if (input.nextActionDate !== undefined) updateValues.nextActionDate = input.nextActionDate || null;
  if (input.archivedAt !== undefined) {
    updateValues.archivedAt = input.archivedAt ? new Date(input.archivedAt) : null;
  }

  // Status transition handling
  if (input.status !== undefined && input.status !== existing.status) {
    updateValues.status = input.status;

    // Set appliedAt once if moving to applied
    if (input.status === 'applied' && !existing.appliedAt) {
      updateValues.appliedAt = now;
    }

    // Automatically log status_change event
    await db.insert(schema.events).values({
      jobId: id,
      type: 'status_change',
      title: `Moved to ${stageLabel(input.status)}`,
      body: `Status moved from **${stageLabel(existing.status)}** to **${stageLabel(input.status)}**`,
      meta: { from: existing.status, to: input.status },
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [updated] = await db
    .update(schema.jobs)
    .set(updateValues)
    .where(eq(schema.jobs.id, id))
    .returning();

  // If skills list provided, update job_skills
  if (input.skills !== undefined) {
    await db.delete(schema.jobSkills).where(eq(schema.jobSkills.jobId, id));

    for (const skillName of input.skills) {
      const trimmed = skillName.trim();
      if (!trimmed) continue;

      let skill = await db
        .select()
        .from(schema.skills)
        .where(eq(schema.skills.name, trimmed))
        .limit(1);

      let skillId: string;
      if (skill.length > 0) {
        skillId = skill[0].id;
      } else {
        const [insertedSkill] = await db
          .insert(schema.skills)
          .values({ name: trimmed })
          .onConflictDoNothing()
          .returning();
        if (insertedSkill) {
          skillId = insertedSkill.id;
        } else {
          const fetched = await db
            .select()
            .from(schema.skills)
            .where(eq(schema.skills.name, trimmed))
            .limit(1);
          skillId = fetched[0].id;
        }
      }

      await db
        .insert(schema.jobSkills)
        .values({ jobId: id, skillId })
        .onConflictDoNothing();
    }
  }

  return updated;
}

export async function deleteJob(id: string) {
  const [deleted] = await db
    .delete(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .returning();
  return deleted;
}

/** Distinct skill names attached to at least one job, for filter dropdowns. */
export async function listSkillNames() {
  const rows = await db
    .selectDistinct({ name: schema.skills.name })
    .from(schema.skills)
    .innerJoin(schema.jobSkills, eq(schema.jobSkills.skillId, schema.skills.id))
    .orderBy(asc(schema.skills.name));
  return rows.map((r) => r.name);
}

export async function getDashboardStats() {
  const today = todayInTz();
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 86400000);

  const [stageCounts, appliedCounts, actionJobs, upcoming] = await Promise.all([
    db
      .select({ status: schema.jobs.status, count: sql<number>`count(*)::int` })
      .from(schema.jobs)
      .where(isNull(schema.jobs.archivedAt))
      .groupBy(schema.jobs.status),
    db
      .select({
        last7: sql<number>`count(*) filter (where ${schema.jobs.appliedAt} >= ${days(7).toISOString()})::int`,
        last30: sql<number>`count(*) filter (where ${schema.jobs.appliedAt} >= ${days(30).toISOString()})::int`,
      })
      .from(schema.jobs),
    db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        company: schema.jobs.company,
        nextAction: schema.jobs.nextAction,
        nextActionDate: schema.jobs.nextActionDate,
      })
      .from(schema.jobs)
      .where(
        and(
          isNull(schema.jobs.archivedAt),
          isNotNull(schema.jobs.nextActionDate),
          lte(schema.jobs.nextActionDate, today)
        )
      )
      .orderBy(asc(schema.jobs.nextActionDate))
      .limit(20),
    db
      .select({
        id: schema.events.id,
        jobId: schema.events.jobId,
        type: schema.events.type,
        title: schema.events.title,
        occurredAt: schema.events.occurredAt,
        jobTitle: schema.jobs.title,
        company: schema.jobs.company,
      })
      .from(schema.events)
      .innerJoin(schema.jobs, eq(schema.events.jobId, schema.jobs.id))
      .where(
        and(
          isNull(schema.jobs.archivedAt),
          inArray(schema.events.type, [...INTERVIEW_EVENT_TYPES]),
          gt(schema.events.occurredAt, now)
        )
      )
      .orderBy(asc(schema.events.occurredAt))
      .limit(10),
  ]);

  const countsByStage: Record<string, number> = {};
  for (const row of stageCounts) countsByStage[row.status] = row.count;

  return {
    today,
    countsByStage,
    appliedLast7: appliedCounts[0]?.last7 ?? 0,
    appliedLast30: appliedCounts[0]?.last30 ?? 0,
    dueActions: actionJobs.map((j) => ({ ...j, overdue: (j.nextActionDate ?? '') < today })),
    upcomingInterviews: upcoming,
  };
}
