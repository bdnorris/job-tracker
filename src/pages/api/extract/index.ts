import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runExtraction } from '../../../lib/extract';
import { MAX_TEXT_INPUT } from '../../../lib/extract/run';
import { normalizeJobUrl } from '../../../lib/extract/url';
import { findJobByUrl } from '../../../db/queries/jobs';
import { json, jsonError } from '../../../lib/api';

const BodySchema = z.union([
  z.object({ url: z.string().trim().url('Enter a valid URL').max(2048) }),
  // Longer text is truncated to MAX_TEXT_INPUT by the runner; this only bounds the request.
  z.object({ text: z.string().trim().min(20, 'Paste more of the posting').max(MAX_TEXT_INPUT * 2) }),
]);

/**
 * POST { url } or { text }; `?force=ai` makes the AI extractor run and override earlier
 * values. Always 200 with an ExtractResult (warnings explain what went wrong), except for
 * malformed input.
 */
export const POST: APIRoute = async ({ request, url }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.find((i) => i.code !== 'invalid_union')?.message ?? 'Send { url } or { text }.';
    return jsonError(400, 'VALIDATION_ERROR', msg);
  }

  const forceAi = url.searchParams.get('force') === 'ai';
  const input = 'url' in parsed.data ? ({ kind: 'url', url: parsed.data.url } as const) : ({ kind: 'text', text: parsed.data.text } as const);

  const [result, duplicate] = await Promise.all([
    runExtraction(input, { forceAi }),
    input.kind === 'url' ? findJobByUrl(input.url).catch(() => null) : Promise.resolve(null),
  ]);
  return json({ ...result, duplicate, url: input.kind === 'url' ? normalizeJobUrl(input.url) : null });
};
