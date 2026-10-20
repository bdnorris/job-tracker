import { z } from 'zod';

/**
 * Application kit item schemas, one per section. This module has no config import
 * so the /profile island can use it for live validation in the browser.
 */

const required = (label: string) => z.string().trim().min(1, `${label} is required`).max(5000);
const optional = z.string().trim().max(5000).default('');

const YearMonth = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

const YearMonthOrPresent = z
  .string()
  .trim()
  .regex(/^(\d{4}-(0[1-9]|1[0-2])|Present)$/i, 'Use YYYY-MM or "Present"')
  .transform((v) => (v.toLowerCase() === 'present' ? 'Present' : v));

const optionalYearMonth = z.union([z.literal(''), YearMonth]).default('');
const optionalYearMonthOrPresent = z.union([z.literal(''), YearMonthOrPresent]).default('');

const Bullets = z
  .array(z.string())
  .default([])
  .transform((lines) => lines.map((l) => l.trim()).filter(Boolean));

export const LinkItemSchema = z.object({
  label: required('Label'),
  value: required('Value'),
});

export const WorkItemSchema = z.object({
  company: required('Company'),
  title: required('Title'),
  location: optional,
  start: YearMonth,
  end: YearMonthOrPresent,
  summary: optional,
  bullets: Bullets,
});

export const EducationItemSchema = z.object({
  school: required('School'),
  credential: optional,
  field: optional,
  location: optional,
  start: optionalYearMonth,
  end: optionalYearMonthOrPresent,
  notes: optional,
});

export const AnswerItemSchema = z.object({
  question: required('Question'),
  answer: required('Answer'),
});

export const SnippetItemSchema = z.object({
  label: required('Label'),
  body: required('Body'),
});

export const PROFILE_ITEM_SCHEMAS = {
  links: LinkItemSchema,
  work: WorkItemSchema,
  education: EducationItemSchema,
  answers: AnswerItemSchema,
  snippets: SnippetItemSchema,
} as const;

export type ProfileSection = keyof typeof PROFILE_ITEM_SCHEMAS;
export type LinkItem = z.infer<typeof LinkItemSchema>;
export type WorkItem = z.infer<typeof WorkItemSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type AnswerItem = z.infer<typeof AnswerItemSchema>;
export type SnippetItem = z.infer<typeof SnippetItemSchema>;

export function isProfileSection(s: string): s is ProfileSection {
  return Object.prototype.hasOwnProperty.call(PROFILE_ITEM_SCHEMAS, s);
}

/** Validates item data for a section. Returns parsed data or per-field error messages. */
export function validateProfileData(section: ProfileSection, data: unknown) {
  const result = PROFILE_ITEM_SCHEMAS[section].safeParse(data);
  if (result.success) return { ok: true as const, data: result.data as Record<string, unknown> };
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    fields[key] ??= issue.message;
  }
  return { ok: false as const, fields };
}

export const CreateProfileItemSchema = z.object({
  section: z.string(),
  data: z.record(z.unknown()),
});

export const UpdateProfileItemSchema = z.object({
  data: z.record(z.unknown()),
});

export const ReorderProfileSchema = z.object({
  section: z.string(),
  ids: z.array(z.string().uuid()).min(1),
});
