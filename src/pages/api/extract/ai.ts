import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runAiFollowUp } from '../../../lib/extract';
import { MAX_TEXT_INPUT } from '../../../lib/extract/run';
import { json, jsonError } from '../../../lib/api';

const BodySchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_INPUT * 2),
  job: z.record(z.unknown()).default({}),
  fieldSources: z.record(z.string()).default({}),
  force: z.boolean().default(false),
});

/**
 * AI pass as a separate request, used when /api/extract ran out of its time budget before
 * AI could run, or for "Re-run with AI" once text is already in the review form.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Expected { text, job, fieldSources, force }');

  const result = await runAiFollowUp({
    text: parsed.data.text,
    job: parsed.data.job as any,
    fieldSources: parsed.data.fieldSources,
    force: parsed.data.force,
  });
  return json(result);
};
