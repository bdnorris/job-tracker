import { z } from 'zod';

export const EXPORT_FORMAT = 'job-tracker-export';
export const EXPORT_VERSION = 1;

const ts = z.coerce.date();
const tsNullable = z.coerce.date().nullable();
const uuid = z.string().uuid();
const nullableText = z.string().nullable();

const SkillRow = z.object({ id: uuid, name: z.string().min(1) });

const JobRow = z.object({
  id: uuid,
  url: nullableText,
  title: z.string().min(1),
  company: z.string().min(1),
  location: nullableText,
  remoteType: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  salaryCurrency: z.string(),
  salaryPeriod: z.enum(['year', 'month', 'hour']).nullable(),
  descriptionHtml: nullableText,
  descriptionText: nullableText,
  source: nullableText,
  fieldSources: z.record(z.string()).nullable(),
  status: z.string().min(1),
  priority: z.number().int().min(0).max(3),
  boardOrder: z.number(),
  nextAction: nullableText,
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  appliedAt: tsNullable,
  archivedAt: tsNullable,
  scrapedAt: tsNullable,
  createdAt: ts,
  updatedAt: ts,
});

const JobSkillRow = z.object({ jobId: uuid, skillId: uuid });

const HighlightRow = z.object({
  id: uuid,
  jobId: uuid,
  startOffset: z.number().int(),
  endOffset: z.number().int(),
  quote: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  category: z.string(),
  note: nullableText,
  createdAt: ts,
});

const EventRow = z.object({
  id: uuid,
  jobId: uuid,
  type: z.enum(['note', 'applied', 'status_change', 'screen', 'interview', 'offer', 'rejection', 'follow_up', 'other']),
  occurredAt: ts,
  title: z.string(),
  body: z.string(),
  contactName: nullableText,
  contactEmail: nullableText,
  contactRole: nullableText,
  meta: z.record(z.unknown()).nullable(),
  createdAt: ts,
  updatedAt: ts,
});

const ProfileItemRow = z.object({
  id: uuid,
  section: z.string(),
  sortOrder: z.number(),
  data: z.record(z.unknown()),
  createdAt: ts,
  updatedAt: ts,
});

export const ExportFileSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT, { errorMap: () => ({ message: 'Not a Job Tracker export file' }) }),
    version: z.literal(EXPORT_VERSION, { errorMap: () => ({ message: `Unsupported export version (expected ${EXPORT_VERSION})` }) }),
    exportedAt: ts,
    data: z.object({
      skills: z.array(SkillRow).default([]),
      jobs: z.array(JobRow).default([]),
      jobSkills: z.array(JobSkillRow).default([]),
      highlights: z.array(HighlightRow).default([]),
      events: z.array(EventRow).default([]),
      profileItems: z.array(ProfileItemRow).default([]),
    }),
  })
  .superRefine((file, ctx) => {
    const { data } = file;
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    const dupes = (label: string, values: (string | null)[]) => {
      const seen = new Set<string>();
      for (const v of values) {
        if (v === null) continue;
        if (seen.has(v)) issue(`Duplicate ${label}: ${v}`);
        seen.add(v);
      }
    };
    dupes('skill id', data.skills.map((s) => s.id));
    dupes('skill name', data.skills.map((s) => s.name));
    dupes('job id', data.jobs.map((j) => j.id));
    dupes('job URL', data.jobs.map((j) => j.url));
    dupes('highlight id', data.highlights.map((h) => h.id));
    dupes('event id', data.events.map((e) => e.id));
    dupes('profile item id', data.profileItems.map((p) => p.id));

    const jobIds = new Set(data.jobs.map((j) => j.id));
    const skillIds = new Set(data.skills.map((s) => s.id));
    for (const js of data.jobSkills) {
      if (!jobIds.has(js.jobId) || !skillIds.has(js.skillId)) issue(`jobSkills row references a missing job or skill (${js.jobId}, ${js.skillId})`);
    }
    for (const h of data.highlights) if (!jobIds.has(h.jobId)) issue(`Highlight ${h.id} references missing job ${h.jobId}`);
    for (const e of data.events) if (!jobIds.has(e.jobId)) issue(`Event ${e.id} references missing job ${e.jobId}`);
  });

export type ExportFile = z.infer<typeof ExportFileSchema>;
export type ExportData = ExportFile['data'];
