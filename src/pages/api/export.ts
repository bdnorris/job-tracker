import type { APIRoute } from 'astro';
import { db } from '../../db/client';
import { exportAll } from '../../lib/export';
import { jsonError } from '../../lib/api';
import { todayInTz } from '../../lib/dates';

export const GET: APIRoute = async () => {
  try {
    const file = await exportAll(db);
    return new Response(JSON.stringify(file, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="job-tracker-export-${todayInTz()}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return jsonError(500, 'INTERNAL_ERROR', err.message || 'Export failed');
  }
};
