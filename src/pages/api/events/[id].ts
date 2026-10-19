import type { APIRoute, APIContext } from 'astro';
import { getEventById, updateEvent, deleteEvent } from '../../../db/queries/events';
import { UpdateEventSchema, eventFormToObject } from '../../../lib/validation/event';
import { json, jsonError, isJsonRequest, isUuid } from '../../../lib/api';

async function handleUpdate(id: string, raw: unknown, wantsJson: boolean, ctx: APIContext) {
  const parsed = UpdateEventSchema.safeParse(raw);
  if (!parsed.success) {
    if (wantsJson) {
      return jsonError(400, 'VALIDATION_ERROR', 'Invalid event data', parsed.error.flatten().fieldErrors);
    }
    const existing = await getEventById(id);
    const msg = parsed.error.issues.map((i) => i.message).join('; ');
    return ctx.redirect(existing ? `/jobs/${existing.jobId}?eventError=${encodeURIComponent(msg)}#timeline` : '/jobs');
  }

  try {
    const event = await updateEvent(id, parsed.data);
    if (!event) return jsonError(404, 'NOT_FOUND', 'Event not found');
    return wantsJson ? json({ ok: true, event }) : ctx.redirect(`/jobs/${event.jobId}#event-${event.id}`);
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to update event');
  }
}

async function handleDelete(id: string, wantsJson: boolean, ctx: APIContext) {
  try {
    const event = await deleteEvent(id);
    if (!event) return jsonError(404, 'NOT_FOUND', 'Event not found');
    return wantsJson ? json({ ok: true }) : ctx.redirect(`/jobs/${event.jobId}#timeline`);
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to delete event');
  }
}

export const PATCH: APIRoute = async (ctx) => {
  const { id } = ctx.params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid event ID');
  let raw: unknown;
  try {
    raw = await ctx.request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }
  return handleUpdate(id, raw, true, ctx);
};

export const DELETE: APIRoute = async (ctx) => {
  const { id } = ctx.params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid event ID');
  return handleDelete(id, true, ctx);
};

/** HTML form fallback: forms can only POST, so `_method` selects PATCH or DELETE. */
export const POST: APIRoute = async (ctx) => {
  const { id } = ctx.params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid event ID');
  if (isJsonRequest(ctx.request)) return jsonError(405, 'METHOD_NOT_ALLOWED', 'Use PATCH or DELETE');

  const form = await ctx.request.formData();
  const method = String(form.get('_method') || '').toUpperCase();
  if (method === 'DELETE') return handleDelete(id, false, ctx);
  if (method === 'PATCH') return handleUpdate(id, eventFormToObject(form), false, ctx);
  return jsonError(400, 'BAD_REQUEST', '_method must be PATCH or DELETE');
};
