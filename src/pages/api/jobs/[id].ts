import type { APIRoute } from 'astro';
import { getJobById, updateJob, deleteJob } from '../../../db/queries/jobs';
import { UpdateJobSchema } from '../../../lib/validation/job';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Missing job ID' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const job = await getJobById(id);
    if (!job) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Job not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ job }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get job' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Missing job ID' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  let rawData: any = {};

  if (contentType.includes('application/json')) {
    try {
      rawData = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // Form submission
    const formData = await request.formData();
    const skillsRaw = formData.get('skills');
    rawData = {};
    if (formData.has('title')) rawData.title = formData.get('title');
    if (formData.has('company')) rawData.company = formData.get('company');
    if (formData.has('location')) rawData.location = formData.get('location') || undefined;
    if (formData.has('remoteType')) rawData.remoteType = formData.get('remoteType');
    if (formData.has('salaryMin')) rawData.salaryMin = formData.get('salaryMin') || undefined;
    if (formData.has('salaryMax')) rawData.salaryMax = formData.get('salaryMax') || undefined;
    if (formData.has('salaryCurrency')) rawData.salaryCurrency = formData.get('salaryCurrency');
    if (formData.has('salaryPeriod')) rawData.salaryPeriod = formData.get('salaryPeriod') || undefined;
    if (formData.has('url')) rawData.url = formData.get('url') || undefined;
    if (formData.has('descriptionHtml')) rawData.descriptionHtml = formData.get('descriptionHtml') || undefined;
    if (formData.has('descriptionText')) rawData.descriptionText = formData.get('descriptionText') || undefined;
    if (formData.has('status')) rawData.status = formData.get('status');
    if (formData.has('priority')) rawData.priority = formData.get('priority');
    if (formData.has('nextAction')) rawData.nextAction = formData.get('nextAction') || undefined;
    if (formData.has('nextActionDate')) rawData.nextActionDate = formData.get('nextActionDate') || undefined;
    if (skillsRaw !== null && skillsRaw !== undefined) {
      const s = skillsRaw as string;
      rawData.skills = s
        ? s
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    }
  }

  const parsed = UpdateJobSchema.safeParse(rawData);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    if (contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid update data', fields },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return redirect(`/jobs/${id}/edit?error=${encodeURIComponent('Please check your inputs.')}`);
  }

  try {
    const updated = await updateJob(id, parsed.data);
    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, job: updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/jobs/${id}`);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update job' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Missing job ID' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await deleteJob(id);
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect('/jobs');
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to delete job' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
