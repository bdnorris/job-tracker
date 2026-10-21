import type { APIRoute } from 'astro';
import { deleteHighlight, updateHighlight, HighlightError } from '../../../db/queries/highlights';
import { UpdateHighlightSchema } from '../../../lib/validation/highlight';
import { json, jsonError, isUuid } from '../../../lib/api';

const STATUS = { NOT_FOUND: 404, QUOTE_MISMATCH: 409, NO_DESCRIPTION: 409 } as const;

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid highlight ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  const parsed = UpdateHighlightSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid update', parsed.error.flatten().fieldErrors);
  }

  try {
    return json({ ok: true, highlight: await updateHighlight(id, parsed.data) });
  } catch (err: any) {
    if (err instanceof HighlightError) return jsonError(STATUS[err.code], err.code, err.message);
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to update highlight');
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid highlight ID');
  try {
    await deleteHighlight(id);
    return json({ ok: true });
  } catch (err: any) {
    if (err instanceof HighlightError) return jsonError(STATUS[err.code], err.code, err.message);
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to delete highlight');
  }
};
