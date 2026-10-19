interface RateLimitEntry {
  failures: number;
  firstFailureTime: number;
}

const failureMap = new Map<string, RateLimitEntry>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;

export function isRateLimited(ip: string): boolean {
  const entry = failureMap.get(ip);
  if (!entry) return false;

  const now = Date.now();
  if (now - entry.firstFailureTime > WINDOW_MS) {
    failureMap.delete(ip);
    return false;
  }

  return entry.failures >= MAX_FAILURES;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = failureMap.get(ip);

  if (!entry || now - entry.firstFailureTime > WINDOW_MS) {
    failureMap.set(ip, { failures: 1, firstFailureTime: now });
  } else {
    entry.failures += 1;
  }
}

export function clearLoginFailures(ip: string): void {
  failureMap.delete(ip);
}
