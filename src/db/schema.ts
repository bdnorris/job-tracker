import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  doublePrecision,
  date,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const remoteTypeEnum = pgEnum('remote_type', ['remote', 'hybrid', 'onsite', 'unknown']);
export const salaryPeriodEnum = pgEnum('salary_period', ['year', 'month', 'hour']);
export const eventTypeEnum = pgEnum('event_type', [
  'note',
  'applied',
  'status_change',
  'screen',
  'interview',
  'offer',
  'rejection',
  'follow_up',
  'other',
]);

// 1. jobs table
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    url: text('url'),
    title: text('title').notNull(),
    company: text('company').notNull(),
    location: text('location'),
    remoteType: remoteTypeEnum('remote_type').default('unknown').notNull(),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: text('salary_currency').default('USD').notNull(),
    salaryPeriod: salaryPeriodEnum('salary_period'),
    descriptionHtml: text('description_html'),
    descriptionText: text('description_text'),
    source: text('source').default('manual'),
    fieldSources: jsonb('field_sources').$type<Record<string, string>>(),
    status: text('status').default('saved').notNull(),
    priority: smallint('priority').default(1).notNull(),
    boardOrder: doublePrecision('board_order').default(0).notNull(),
    nextAction: text('next_action'),
    nextActionDate: date('next_action_date'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('jobs_status_board_order_idx').on(table.status, table.boardOrder),
    index('jobs_next_action_date_idx').on(table.nextActionDate),
    uniqueIndex('jobs_url_unique_idx').on(table.url),
  ]
);

// 2. skills table
export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
});

// 3. job_skills table (composite pk)
export const jobSkills = pgTable(
  'job_skills',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.skillId] }),
    index('job_skills_job_id_idx').on(table.jobId),
    index('job_skills_skill_id_idx').on(table.skillId),
  ]
);

// 4. highlights table
export const highlights = pgTable(
  'highlights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    quote: text('quote').notNull(),
    prefix: text('prefix').default('').notNull(),
    suffix: text('suffix').default('').notNull(),
    category: text('category').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('highlights_job_id_idx').on(table.jobId)]
);

// 5. events table
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    type: eventTypeEnum('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    title: text('title').notNull(),
    body: text('body').default('').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactRole: text('contact_role'),
    meta: jsonb('meta').$type<Record<string, any>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('events_job_id_occurred_at_idx').on(table.jobId, table.occurredAt)]
);

// 6. profile_items table
export const profileItems = pgTable(
  'profile_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    section: text('section').notNull(),
    sortOrder: doublePrecision('sort_order').default(0).notNull(),
    data: jsonb('data').notNull().$type<Record<string, any>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('profile_items_section_sort_order_idx').on(table.section, table.sortOrder)]
);

// Relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  jobSkills: many(jobSkills),
  highlights: many(highlights),
  events: many(events),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  jobSkills: many(jobSkills),
}));

export const jobSkillsRelations = relations(jobSkills, ({ one }) => ({
  job: one(jobs, {
    fields: [jobSkills.jobId],
    references: [jobs.id],
  }),
  skill: one(skills, {
    fields: [jobSkills.skillId],
    references: [skills.id],
  }),
}));

export const highlightsRelations = relations(highlights, ({ one }) => ({
  job: one(jobs, {
    fields: [highlights.jobId],
    references: [jobs.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  job: one(jobs, {
    fields: [events.jobId],
    references: [jobs.id],
  }),
}));
