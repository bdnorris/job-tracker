import type { APIRoute } from 'astro';
import { verifyPassword } from '../../../lib/auth/password';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../../../lib/auth/session';
import { isRateLimited, recordLoginFailure, clearLoginFailures } from '../../../lib/auth/rate-limit';

export const POST: APIRoute = async (context) => {
  const clientIp =
    context.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    context.request.headers.get('x-real-ip') ||
    '127.0.0.1';

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many failed login attempts. Please wait 15 minutes before trying again.',
        },
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const expectedHash = process.env.APP_PASSWORD_HASH;
  if (!expectedHash) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'APP_NOT_CONFIGURED',
          message: 'Application is not configured. APP_PASSWORD_HASH is missing.',
        },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let password = '';
  let nextUrl = '/';
  const contentType = context.request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      const body = await context.request.json();
      password = body.password || '';
      if (body.next) nextUrl = body.next;
    } catch {
      return new Response(
        JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // Form submission
    const formData = await context.request.formData();
    password = (formData.get('password') as string) || '';
    nextUrl = (formData.get('next') as string) || '/';
  }

  const isValid = await verifyPassword(password, expectedHash);

  if (!isValid) {
    recordLoginFailure(clientIp);

    if (contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid password. Please try again.',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return context.redirect(
      `/login?error=${encodeURIComponent('Invalid password. Please try again.')}&next=${encodeURIComponent(nextUrl)}`
    );
  }

  // Password valid! Clear rate limit and issue session cookie
  clearLoginFailures(clientIp);
  const token = createSessionToken();

  context.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: import.meta.env.PROD || context.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });

  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, redirect: nextUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return context.redirect(nextUrl || '/');
};
