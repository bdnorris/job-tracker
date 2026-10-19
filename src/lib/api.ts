/** JSON response helpers for API routes. Errors follow `{ error: { code, message, fields? } }`. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(status: number, code: string, message: string, fields?: Record<string, unknown>): Response {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
}

export function isJsonRequest(request: Request): boolean {
  return (request.headers.get('content-type') || '').includes('application/json');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string | undefined): id is string {
  return !!id && UUID_RE.test(id);
}

/**
 * Builds a same-site redirect target for HTML form posts. Only relative paths are
 * honored so a crafted `returnTo` can't redirect off-site.
 */
export function safeReturnTo(value: FormDataEntryValue | null, fallback: string): string {
  const v = typeof value === 'string' ? value : '';
  return v.startsWith('/') && !v.startsWith('//') ? v : fallback;
}
