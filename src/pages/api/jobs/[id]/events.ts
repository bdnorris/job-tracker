import type { APIRoute } from 'astro';
import { getJobById } from '../../../../db/queries/jobs';
import { createEvent } from '../../../../db/queries/events';
import { CreateEventSchema, eventFormToObject } from '../../../../lib/validation/event';
import { json, jsonError, isJsonRequest, isUuid, safeReturnTo } from '../../../../lib/api';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid job ID');

  const wantsJson = isJsonRequest(request);
  let raw: Record<string, unknown>;
  let returnTo = `/jobs/${id}#timeline`;

  if (wantsJson) {
    try {
      raw = await request.json();
    } catch {
      return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
    }
  } else {
    const form = await request.formData();
    raw = eventFormToObject(form);
    returnTo = safeReturnTo(form.get('returnTo'), returnTo);
  }

  const parsed = CreateEventSchema.safeParse(raw);
  if (!parsed.success) {
    if (wantsJson) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid event data', parsed.error.flatten().fieldErrors);
    }
    const msg = parsed.error.issues.map((i) => i.message).join('; ');
    return redirect(`/jobs/${id}?eventError=${encodeURIComponent(msg)}#add-event`);
  }

  try {
    const job = await getJobById(id);
    if (!job) return jsonError(404, 'NOT_FOUND', 'Job not found');

    const event = await createEvent(id, parsed.data);
    return wantsJson ? json({ ok: true, event }, 201) : redirect(returnTo);
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to create event');
  }
};
