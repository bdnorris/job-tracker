import { z } from 'zod';

export const RemoteTypeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
export const SalaryPeriodSchema = z.enum(['year', 'month', 'hour']);

export const CreateJobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  company: z.string().min(1, 'Company is required'),
  location: z.string().optional().nullable(),
  remoteType: RemoteTypeSchema.default('unknown'),
  salaryMin: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryCurrency: z.string().default('USD'),
  salaryPeriod: SalaryPeriodSchema.optional().nullable(),
  url: z.string().url('Invalid URL format').optional().nullable().or(z.literal('')),
  descriptionHtml: z.string().optional().nullable(),
  descriptionText: z.string().optional().nullable(),
  status: z.string().min(1).default('saved'),
  priority: z.coerce.number().int().min(0).max(3).default(1),
  nextAction: z.string().optional().nullable(),
  nextActionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable().or(z.literal('')),
  skills: z.array(z.string()).default([]),
  source: z.string().default('manual'),
  fieldSources: z.record(z.string()).optional().nullable(),
});

export const UpdateJobSchema = CreateJobSchema.partial().extend({
  archivedAt: z.string().datetime().optional().nullable(),
  boardOrder: z.number().optional(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;
