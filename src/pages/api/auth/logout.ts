import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME } from '../../../lib/auth/session';

export const POST: APIRoute = async (context) => {
  context.cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });

  const contentType = context.request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return context.redirect('/login');
};
