import type { APIRoute } from 'astro';
import config from '../../../config';
import { listProfileItems, createProfileItem } from '../../../db/queries/profile';
import { CreateProfileItemSchema, isProfileSection, validateProfileData } from '../../../lib/validation/profile';
import { json, jsonError } from '../../../lib/api';

export const GET: APIRoute = async () => {
  try {
    return json({ sections: await listProfileItems() });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to load profile');
  }
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'Invalid JSON');
  }

  const parsed = CreateProfileItemSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'VALIDATION_ERROR', 'Expected { section, data }');

  const { section, data } = parsed.data;
  if (!isProfileSection(section) || !(config.profile.sections as string[]).includes(section)) {
    return jsonError(400, 'VALIDATION_ERROR', `Unknown profile section: ${section}`);
  }

  const result = validateProfileData(section, data);
  if (!result.ok) return jsonError(400, 'VALIDATION_ERROR', 'Invalid item', result.fields);

  try {
    return json({ ok: true, item: await createProfileItem(section, result.data) }, 201);
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Failed to create item');
  }
};
