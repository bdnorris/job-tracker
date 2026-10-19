import { z } from 'zod';

export const StageSchema = z.object({
  id: z.string().min(1, 'Stage id cannot be empty'),
  label: z.string().min(1, 'Stage label cannot be empty'),
  closed: z.boolean().optional().default(false),
});

export const CategorySchema = z.object({
  id: z.string().min(1, 'Category id cannot be empty'),
  label: z.string().min(1, 'Category label cannot be empty'),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Category color must be a valid hex color code'),
});

export const TrackerConfigSchema = z.object({
  app: z.object({
    name: z.string().default('Job Tracker'),
    timezone: z.string().default('America/Chicago'),
    currency: z.string().default('USD'),
  }).default({}),
  pipeline: z.object({
    stages: z.array(StageSchema).min(1, 'At least one pipeline stage is required').default([
      { id: 'saved', label: 'Saved' },
      { id: 'applied', label: 'Applied' },
      { id: 'screening', label: 'Screening' },
      { id: 'interviewing', label: 'Interviewing' },
      { id: 'offer', label: 'Offer' },
      { id: 'rejected', label: 'Rejected', closed: true },
      { id: 'withdrawn', label: 'Withdrawn', closed: true },
    ]),
    defaultStage: z.string().default('saved'),
  }).default({}).refine((data) => {
    const ids = data.stages.map((s) => s.id);
    return ids.includes(data.defaultStage);
  }, {
    message: 'pipeline.defaultStage must exist in pipeline.stages',
    path: ['defaultStage'],
  }),
  highlights: z.object({
    categories: z.array(CategorySchema).min(1, 'At least one highlight category is required').default([
      { id: 'requirement', label: 'Requirement', color: '#fde68a' },
      { id: 'nice', label: 'Nice to have', color: '#bbf7d0' },
      { id: 'redflag', label: 'Red flag', color: '#fecaca' },
      { id: 'perk', label: 'Perk', color: '#bfdbfe' },
      { id: 'keyword', label: 'Resume keyword', color: '#e9d5ff' },
    ]),
  }).default({}),
  skills: z.object({
    list: z.record(z.array(z.string())).default({
      JavaScript: ['js', 'javascript'],
      TypeScript: ['ts'],
      Astro: [],
      React: ['react.js', 'reactjs'],
    }),
  }).default({}),
  scraper: z.object({
    order: z.array(z.string()).default(['greenhouse', 'lever', 'ashby', 'jsonld', 'heuristic', 'ai']),
    fetchTimeoutMs: z.number().int().positive().default(8000),
    userAgent: z.string().default('JobTracker/1.0 (+https://github.com/<owner>/<repo>)'),
    ai: z.object({
      model: z.string().default('claude-3-5-haiku-20241022'),
      fillGapsOnly: z.boolean().default(true),
      maxInputChars: z.number().int().positive().default(30000),
    }).default({}),
  }).default({}),
  profile: z.object({
    sections: z.array(z.string()).default(['links', 'work', 'education', 'answers', 'snippets']),
  }).default({}),
  print: z.object({
    showUrls: z.boolean().default(true),
    includeNotes: z.boolean().default(true),
  }).default({}),
});

export type TrackerConfig = z.infer<typeof TrackerConfigSchema>;
export type TrackerConfigInput = z.input<typeof TrackerConfigSchema>;

export function defineConfig(config: TrackerConfigInput): TrackerConfig {
  const result = TrackerConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[tracker.config.ts] Configuration validation failed:\n${issues}`);
  }
  return result.data;
}
