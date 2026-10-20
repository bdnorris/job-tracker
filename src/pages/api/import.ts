import type { APIRoute } from 'astro';
import config from '../../config';
import { db } from '../../db/client';
import { applyImport, planImport } from '../../lib/export';
import { json, jsonError } from '../../lib/api';

/**
 * POST an export file as JSON. With `?dryRun=1` nothing is written and the response is a
 * summary of what would change; without it the same plan is applied in one transaction.
 */
export const POST: APIRoute = async ({ request, url }) => {
  const dryRun = url.searchParams.get('dryRun') === '1';

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'BAD_REQUEST', 'The file is not valid JSON.');
  }

  try {
    const result = await planImport(db, raw, {
      stageIds: config.pipeline.stages.map((s) => s.id),
      profileSections: config.profile.sections,
    });
    if (!result.ok) {
      return jsonError(400, 'VALIDATION_ERROR', 'The file is not a valid export.', { errors: result.errors });
    }
    if (dryRun) return json({ ok: true, dryRun: true, summary: result.plan.summary });

    await applyImport(db, result.plan);
    return json({ ok: true, dryRun: false, summary: result.plan.summary });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Import failed; no changes were saved.');
  }
};
