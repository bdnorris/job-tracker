import type { APIRoute } from 'astro';
import { updateJob, NotFoundError } from '../../../../db/queries/jobs';
import { ReorderJobSchema } from '../../../../lib/validation/job';
import { json, jsonError, isUuid } from '../../../../lib/api';

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid job ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }

  const parsed = ReorderJobSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'VALIDATION_ERROR', 'Invalid reorder data', parsed.error.flatten().fieldErrors);
  }

  try {
    // updateJob handles status_change events and applied_at.
    const job = await updateJob(id, parsed.data);
    return json({ ok: true, job });
  } catch (err: any) {
    if (err instanceof NotFoundError) return jsonError(404, 'NOT_FOUND', 'Job not found');
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to reorder job');
  }
};
