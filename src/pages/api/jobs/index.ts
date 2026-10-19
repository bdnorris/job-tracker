import type { APIRoute } from 'astro';
import { createJob, listJobs } from '../../../db/queries/jobs';
import { CreateJobSchema } from '../../../lib/validation/job';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || undefined;
    const remoteType = url.searchParams.get('remoteType') || undefined;
    const salaryMinStr = url.searchParams.get('salaryMin');
    const salaryMin = salaryMinStr ? parseInt(salaryMinStr, 10) : undefined;
    const search = url.searchParams.get('search') || undefined;
    const hasOverdueAction = url.searchParams.get('hasOverdueAction') === 'true';
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    const jobs = await listJobs({
      status,
      remoteType,
      salaryMin,
      search,
      hasOverdueAction,
      includeArchived,
    });

    return new Response(JSON.stringify({ jobs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to list jobs' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, redirect }) => {
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
    const skillsRaw = (formData.get('skills') as string) || '';
    rawData = {
      title: formData.get('title'),
      company: formData.get('company'),
      location: formData.get('location') || undefined,
      remoteType: formData.get('remoteType') || 'unknown',
      salaryMin: formData.get('salaryMin') || undefined,
      salaryMax: formData.get('salaryMax') || undefined,
      salaryCurrency: formData.get('salaryCurrency') || 'USD',
      salaryPeriod: formData.get('salaryPeriod') || undefined,
      url: formData.get('url') || undefined,
      descriptionHtml: formData.get('descriptionHtml') || undefined,
      descriptionText: formData.get('descriptionText') || undefined,
      status: formData.get('status') || 'saved',
      priority: formData.get('priority') || 1,
      nextAction: formData.get('nextAction') || undefined,
      nextActionDate: formData.get('nextActionDate') || undefined,
      skills: skillsRaw
        ? skillsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    };
  }

  const parsed = CreateJobSchema.safeParse(rawData);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    if (contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job data',
            fields,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return redirect(`/jobs/new?error=${encodeURIComponent('Please check the required fields.')}`);
  }

  try {
    const job = await createJob(parsed.data);
    if (contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: true, job }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/jobs/${job.id}`);
  } catch (err: any) {
    if (err.code === 'DUPLICATE_URL') {
      if (contentType.includes('application/json')) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'DUPLICATE_URL',
              message: err.message,
              existingJob: err.existingJob,
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return redirect(
        `/jobs/${err.existingJob.id}?warning=${encodeURIComponent('A job with this posting URL already exists.')}`
      );
    }

    return new Response(
      JSON.stringify({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to create job' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
