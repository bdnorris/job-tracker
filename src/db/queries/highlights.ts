import { db, schema } from '../client';
import { asc, eq } from 'drizzle-orm';
import { prepareDescription, renderDescription } from '../../lib/highlights/html';
import { reanchorAll } from '../../lib/highlights/anchor';
import type { CreateHighlightInput, UpdateHighlightInput } from '../../lib/validation/highlight';

export class HighlightError extends Error {
  constructor(message: string, public code: 'NOT_FOUND' | 'QUOTE_MISMATCH' | 'NO_DESCRIPTION') {
    super(message);
  }
}

/** Writes new anchors for highlights whose text moved; orphans are left as-is (shown as "Needs review"). */
export async function reanchorJobHighlights(jobId: string, text: string | null) {
  const rows = await db.select().from(schema.highlights).where(eq(schema.highlights.jobId, jobId));
  const { updates, orphaned } = reanchorAll(rows, text);
  if (updates.length > 0) {
    const queries = updates.map(({ id, anchor }) => db.update(schema.highlights).set(anchor).where(eq(schema.highlights.id, id)));
    await db.batch(queries as [(typeof queries)[number], ...typeof queries]);
  }
  return { moved: updates.length, orphaned: orphaned.length };
}

/**
 * The text highlight offsets index into. Rows saved before descriptions were normalized
 * (raw pasted text, unsanitized HTML) are normalized on first use, re-anchoring any
 * existing highlights, so the stored text always matches what the page renders.
 */
async function canonicalText(job: { id: string; descriptionHtml: string | null; descriptionText: string | null }) {
  const { text } = renderDescription(job);
  if (!text) return null;
  if (text !== job.descriptionText) {
    const normalized = prepareDescription(job.descriptionHtml?.trim() ? { html: job.descriptionHtml } : { text: job.descriptionText });
    await db.update(schema.jobs).set(normalized).where(eq(schema.jobs.id, job.id));
    await reanchorJobHighlights(job.id, normalized.descriptionText);
    return normalized.descriptionText;
  }
  return text;
}

async function loadJob(jobId: string) {
  const [job] = await db
    .select({ id: schema.jobs.id, descriptionHtml: schema.jobs.descriptionHtml, descriptionText: schema.jobs.descriptionText })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);
  if (!job) throw new HighlightError('Job not found', 'NOT_FOUND');
  return job;
}

function verify(text: string | null, start: number, end: number, quote: string) {
  if (!text) throw new HighlightError('This job has no description to highlight.', 'NO_DESCRIPTION');
  if (text.slice(start, end) !== quote) {
    throw new HighlightError('The selected text does not match the description. Reload the page and try again.', 'QUOTE_MISMATCH');
  }
}

export async function createHighlight(jobId: string, input: CreateHighlightInput) {
  const text = await canonicalText(await loadJob(jobId));
  verify(text, input.startOffset, input.endOffset, input.quote);
  const [row] = await db
    .insert(schema.highlights)
    .values({
      jobId,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      quote: input.quote,
      prefix: input.prefix,
      suffix: input.suffix,
      category: input.category,
      note: input.note ?? null,
    })
    .returning();
  return row;
}

export async function updateHighlight(id: string, input: UpdateHighlightInput) {
  const [existing] = await db.select().from(schema.highlights).where(eq(schema.highlights.id, id)).limit(1);
  if (!existing) throw new HighlightError('Highlight not found', 'NOT_FOUND');

  const values: Record<string, unknown> = {};
  if (input.category !== undefined) values.category = input.category;
  if (input.note !== undefined) values.note = input.note;
  if (input.quote !== undefined) {
    const text = await canonicalText(await loadJob(existing.jobId));
    verify(text, input.startOffset!, input.endOffset!, input.quote);
    Object.assign(values, {
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      quote: input.quote,
      prefix: input.prefix ?? '',
      suffix: input.suffix ?? '',
    });
  }
  if (Object.keys(values).length === 0) return existing;

  const [row] = await db.update(schema.highlights).set(values).where(eq(schema.highlights.id, id)).returning();
  return row;
}

export async function deleteHighlight(id: string) {
  const [row] = await db.delete(schema.highlights).where(eq(schema.highlights.id, id)).returning();
  if (!row) throw new HighlightError('Highlight not found', 'NOT_FOUND');
  return row;
}

export async function listHighlights(jobId: string) {
  return db.select().from(schema.highlights).where(eq(schema.highlights.jobId, jobId)).orderBy(asc(schema.highlights.startOffset));
}
