import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE_NAME, verifySessionToken } from './lib/auth/session';

const PUBLIC_PATHS = new Set(['/login', '/setup', '/api/auth/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Static assets and internal Astro paths bypass auth
  if (
    pathname.startsWith('/_astro') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js')
  ) {
    return next();
  }

  // 1. Check if APP_PASSWORD_HASH is configured
  const passwordHash = process.env.APP_PASSWORD_HASH;
  if (!passwordHash) {
    if (pathname === '/setup') {
      return next();
    }
    return context.redirect('/setup');
  }

  // If password hash is configured and user visits /setup, redirect to /
  if (pathname === '/setup') {
    return context.redirect('/');
  }

  // 2. CSRF protection on mutating API routes
  if (pathname.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(context.request.method)) {
    const origin = context.request.headers.get('origin');
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host !== context.url.host) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'CSRF_FORBIDDEN',
                message: 'Cross-origin request blocked.',
              },
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              code: 'CSRF_FORBIDDEN',
              message: 'Invalid origin header.',
            },
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }
  }

  // 3. Public paths
  if (PUBLIC_PATHS.has(pathname)) {
    return next();
  }

  // 4. Session check
  const sessionCookie = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthenticated = verifySessionToken(sessionCookie);

  if (!isAuthenticated) {
    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please sign in.',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const nextUrl = pathname + (context.url.search || '');
    return context.redirect(`/login?next=${encodeURIComponent(nextUrl)}`);
  }

  return next();
});
