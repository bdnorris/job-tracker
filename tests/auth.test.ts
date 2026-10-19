import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from '../src/lib/auth/session';
import {
  isRateLimited,
  recordLoginFailure,
  clearLoginFailures,
} from '../src/lib/auth/rate-limit';

describe('Password hashing and verification', () => {
  it('hashes password with scrypt and verifies correctly', async () => {
    const raw = 'SuperSecretPass123!';
    const hash = await hashPassword(raw);

    expect(hash.startsWith('scrypt:')).toBe(true);
    const valid = await verifyPassword(raw, hash);
    expect(valid).toBe(true);

    const wrong = await verifyPassword('WrongPassword', hash);
    expect(wrong).toBe(false);
  });

  it('rejects malformed hashes safely', async () => {
    expect(await verifyPassword('test', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('test', 'scrypt:short')).toBe(false);
  });
});

describe('Session management', () => {
  const secretBackup = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'a_very_long_random_session_secret_that_has_at_least_32_characters';
  });

  it('creates and verifies HMAC-signed session tokens', () => {
    const token = createSessionToken();
    expect(token).toBeDefined();
    expect(verifySessionToken(token)).toBe(true);
  });

  it('rejects tampered or malformed session tokens', () => {
    const token = createSessionToken();
    const [ts, sig] = token.split('.');
    const tampered = `${ts}.${sig.slice(0, -4)}abcd`;

    expect(verifySessionToken(tampered)).toBe(false);
    expect(verifySessionToken('invalid-token')).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
  });
});

describe('Login rate limiting', () => {
  const testIp = '192.168.1.100';

  beforeEach(() => {
    clearLoginFailures(testIp);
  });

  it('allows initial attempts then rate-limits after 5 failures', () => {
    expect(isRateLimited(testIp)).toBe(false);

    for (let i = 0; i < 4; i++) {
      recordLoginFailure(testIp);
      expect(isRateLimited(testIp)).toBe(false);
    }

    recordLoginFailure(testIp); // 5th failure
    expect(isRateLimited(testIp)).toBe(true);

    clearLoginFailures(testIp);
    expect(isRateLimited(testIp)).toBe(false);
  });
});
