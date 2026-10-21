import type { APIRoute } from 'astro';
import { createHighlight, HighlightError } from '../../../../db/queries/highlights';
import { CreateHighlightSchema } from '../../../../lib/validation/highlight';
import { json, jsonError, isUuid } from '../../../../lib/api';

const STATUS = { NOT_FOUND: 404, QUOTE_MISMATCH: 409, NO_DESCRIPTION: 409 } as const;

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid job ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const parsed = CreateHighlightSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Invalid highlight', parsed.error.flatten().fieldErrors);

  try {
    return json({ ok: true, highlight: await createHighlight(id, parsed.data) }, 201);
  } catch (err: any) {
    if (err instanceof HighlightError) return jsonError(STATUS[err.code], err.code, err.message);
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to create highlight');
  }
};
