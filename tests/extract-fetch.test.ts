import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { assertFetchableUrl, isPrivateAddress, safeFetch, FetchError } from '../src/lib/extract/fetch';

describe('isPrivateAddress', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'ff02::1', 'not-an-ip',
  ];
  const allowed = ['93.184.216.34', '8.8.8.8', '172.32.0.1', '192.169.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'];
  for (const ip of blocked) it(`blocks ${ip}`, () => expect(isPrivateAddress(ip)).toBe(true));
  for (const ip of allowed) it(`allows ${ip}`, () => expect(isPrivateAddress(ip)).toBe(false));
});

describe('assertFetchableUrl', () => {
  it('rejects non-http schemes, credentials, local names and private literal IPs', () => {
    for (const url of [
      'file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'gopher://x', 'not a url',
      'http://user:pass@example.com', 'http://localhost:3000', 'http://app.localhost', 'http://printer.local',
      'http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]',
      'http://169.254.169.254/latest/meta-data', 'http://10.1.2.3:8080',
    ]) {
      expect(() => assertFetchableUrl(url), url).toThrow(FetchError);
    }
  });
  it('accepts public http(s) URLs', () => {
    expect(assertFetchableUrl('https://example.com/jobs/1').hostname).toBe('example.com');
    expect(assertFetchableUrl('http://93.184.216.34/').hostname).toBe('93.184.216.34');
  });
});

describe('safeFetch', () => {
  let server: http.Server;
  let port = 0;
  // Tests run against 127.0.0.1, so they allow loopback and treat 10.x as the "private" range.
  const testPolicy = (ip: string) => ip.startsWith('10.');
  const resolve = async (host: string) =>
    host === 'internal.test' ? [{ address: '10.0.0.7', family: 4 }]
      : host === 'mixed.test' ? [{ address: '127.0.0.1', family: 4 }, { address: '10.0.0.8', family: 4 }]
      : [{ address: '127.0.0.1', family: 4 }];
  const opts = { timeoutMs: 2000, userAgent: 'JobTracker-test', resolve, isBlocked: testPolicy };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      if (path === '/ok') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<p>café</p>');
      if (path === '/gzip') return res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/html' }).end(zlib.gzipSync('<p>zipped</p>'));
      if (path === '/redirect-ok') return res.writeHead(302, { location: '/ok' }).end();
      if (path === '/redirect-internal') return res.writeHead(302, { location: 'http://internal.test/secret' }).end();
      if (path === '/redirect-file') return res.writeHead(302, { location: 'file:///etc/passwd' }).end();
      if (path === '/loop') return res.writeHead(302, { location: '/loop' }).end();
      if (path === '/big') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('x'.repeat(3 * 1024 * 1024));
      }
      if (path === '/slow') return setTimeout(() => res.end('late'), 3000);
      if (path === '/ua') return res.end(req.headers['user-agent']);
      res.writeHead(404).end('nope');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const at = (path: string, host = 'public.test') => `http://${host}:${port}${path}`;

  it('fetches, decodes charset and gzip, and sends the configured user agent', async () => {
    expect((await safeFetch(at('/ok'), opts)).body).toBe('<p>café</p>');
    expect((await safeFetch(at('/gzip'), opts)).body).toBe('<p>zipped</p>');
    expect((await safeFetch(at('/ua'), opts)).body).toBe('JobTracker-test');
  });

  it('follows redirects and re-checks every hop', async () => {
    expect((await safeFetch(at('/redirect-ok'), opts)).url).toBe(at('/ok'));
    await expect(safeFetch(at('/redirect-internal'), opts)).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch(at('/redirect-file'), opts)).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(safeFetch(at('/loop'), opts)).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
  });

  it('blocks hostnames that resolve to a private address, even when only one of several does', async () => {
    await expect(safeFetch(at('/ok', 'internal.test'), opts)).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch(at('/ok', 'mixed.test'), opts)).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
  });

  it('enforces the size cap, the timeout, and HTTP errors', async () => {
    await expect(safeFetch(at('/big'), opts)).rejects.toMatchObject({ code: 'TOO_LARGE' });
    await expect(safeFetch(at('/slow'), { ...opts, timeoutMs: 300 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(safeFetch(at('/missing'), opts)).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 404 });
  });

  it('blocks loopback with the production policy', async () => {
    await expect(safeFetch(at('/ok'), { timeoutMs: 2000, userAgent: 'x', resolve })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
  });
});
