import type { APIRoute } from 'astro';
import { reorderProfileItems } from '../../../db/queries/profile';
import { ReorderProfileSchema } from '../../../lib/validation/profile';
import { json, jsonError } from '../../../lib/api';

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }

  const parsed = ReorderProfileSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Expected { section, ids[] }', parsed.error.flatten().fieldErrors);
  }

  try {
    const ok = await reorderProfileItems(parsed.data.section, parsed.data.ids);
    if (!ok) {
      return jsonError(409, 'STALE_ORDER', 'The item list changed. Reload the page and try again.');
    }
    return json({ ok: true });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to reorder items');
  }
};
