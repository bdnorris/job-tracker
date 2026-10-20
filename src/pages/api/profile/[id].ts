import type { APIRoute } from 'astro';
import { getProfileItem, updateProfileItem, deleteProfileItem } from '../../../db/queries/profile';
import { UpdateProfileItemSchema, isProfileSection, validateProfileData } from '../../../lib/validation/profile';
import { json, jsonError, isUuid } from '../../../lib/api';

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid item ID');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }

  const parsed = UpdateProfileItemSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Expected { data }');

  try {
    const existing = await getProfileItem(id);
    if (!existing) return jsonError(404, 'NOT_FOUND', 'Item not found');
    if (!isProfileSection(existing.section)) {
      return jsonError(400, 'VALIDATION_ERROR', `Unknown profile section: ${existing.section}`);
    }

    // PATCH merges into the stored item, then the whole item is validated.
    const result = validateProfileData(existing.section, { ...existing.data, ...parsed.data.data });
    if (!result.ok) return jsonError(400, 'VALIDATION_ERROR', 'Invalid item', result.fields);

    return json({ ok: true, item: await updateProfileItem(id, result.data) });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to update item');
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!isUuid(id)) return jsonError(400, 'BAD_REQUEST', 'Invalid item ID');
  try {
    const item = await deleteProfileItem(id);
    if (!item) return jsonError(404, 'NOT_FOUND', 'Item not found');
    return json({ ok: true });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to delete item');
  }
};
