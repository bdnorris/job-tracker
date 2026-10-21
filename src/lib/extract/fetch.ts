import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';

/**
 * Server-side fetch for user-supplied URLs, hardened against SSRF:
 * - only http/https;
 * - every address a hostname resolves to must be public, checked inside the socket's DNS
 *   lookup so the connection uses exactly the address that was checked (no rebinding window);
 * - redirects are followed manually and each hop is re-checked;
 * - a wall-clock timeout and a response size cap apply.
 */

export class FetchError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_URL' | 'BLOCKED_ADDRESS' | 'TIMEOUT' | 'TOO_LARGE' | 'HTTP_ERROR' | 'TOO_MANY_REDIRECTS' | 'NETWORK',
    public status?: number
  ) {
    super(message);
  }
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPrivateIPv4([a, b]: number[]): boolean {
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved, incl. broadcast
  );
}

/** True for loopback, private, link-local, unique-local, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPrivateIPv4(v4);

  if (!net.isIPv6(ip)) return true; // not an IP at all: refuse
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;

  // IPv4-mapped / -compatible (::ffff:10.0.0.1, ::ffff:a00:1)
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateAddress(mapped[1]);
  const mappedHex = /^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }

  const first = parseInt(lower.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    lower.startsWith('64:ff9b:') || // NAT64 can reach IPv4 private space
    lower.startsWith('2001:db8:') // documentation
  );
}

/** Validates scheme and literal-IP hosts before any network activity. */
export function assertFetchableUrl(raw: string, isBlocked: (ip: string) => boolean = isPrivateAddress): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError('Not a valid URL.', 'INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http and https URLs can be fetched.', 'INVALID_URL');
  }
  if (url.username || url.password) throw new FetchError('URLs with credentials are not allowed.', 'INVALID_URL');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchError('That address is not publicly reachable.', 'BLOCKED_ADDRESS');
  }
  if ((net.isIP(host) || /^[\d.]+$/.test(host) || /^0x/i.test(host)) && isBlocked(host)) {
    throw new FetchError('That address is not publicly reachable.', 'BLOCKED_ADDRESS');
  }
  return url;
}

type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
const systemResolver: Resolver = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/** A socket lookup that refuses hostnames resolving to any non-public address. */
export function makeSafeLookup(resolve: Resolver = systemResolver, isBlocked: (ip: string) => boolean = isPrivateAddress): LookupFunction {
  return ((hostname: string, options: any, callback: any) => {
    resolve(hostname)
      .then((addresses) => {
        if (addresses.length === 0) throw new FetchError(`Could not resolve ${hostname}.`, 'NETWORK');
        const blocked = addresses.find((a) => isBlocked(a.address));
        if (blocked) throw new FetchError('That address is not publicly reachable.', 'BLOCKED_ADDRESS');
        if (options?.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      })
      .catch((err) => callback(err));
  }) as LookupFunction;
}

export interface FetchOptions {
  timeoutMs: number;
  maxBytes?: number;
  userAgent: string;
  accept?: string;
  maxRedirects?: number;
  /** Injected for tests. */
  resolve?: Resolver;
  /** Injected for tests; production always uses isPrivateAddress. */
  isBlocked?: (ip: string) => boolean;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function requestOnce(url: URL, opts: FetchOptions, deadline: number) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new FetchError('Fetching the page timed out.', 'TIMEOUT'));
    const lib = url.protocol === 'https:' ? https : http;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

    const req = lib.request(
      url,
      {
        method: 'GET',
        // No connection pooling: every request opens a fresh socket, so the address check in
        // `lookup` runs for every connection and a pooled socket can never skip it.
        agent: false,
        lookup: makeSafeLookup(opts.resolve, opts.isBlocked),
        headers: {
          'User-Agent': opts.userAgent,
          Accept: opts.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.8',
        },
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new FetchError('The page is too large to fetch.', 'TOO_LARGE'));
        }

        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new FetchError('The page is too large to fetch.', 'TOO_LARGE'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        stream.on('error', (err) => reject(err instanceof FetchError ? err : new FetchError('Could not read the response.', 'NETWORK')));
      }
    );
    req.on('timeout', () => req.destroy(new FetchError('Fetching the page timed out.', 'TIMEOUT')));
    req.on('error', (err) => reject(err instanceof FetchError ? err : new FetchError(`Could not connect: ${err.message}`, 'NETWORK')));
    req.end();
  });
}

function decodeBody(body: Buffer, contentType: string): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const sniffed = declared ? undefined : /<meta[^>]+charset=["']?([\w-]+)/i.exec(body.subarray(0, 2048).toString('latin1'))?.[1];
  const charset = (declared ?? sniffed ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

export async function safeFetch(rawUrl: string, opts: FetchOptions): Promise<FetchedPage> {
  const deadline = Date.now() + opts.timeoutMs;
  let url = assertFetchableUrl(rawUrl, opts.isBlocked);
  const maxRedirects = opts.maxRedirects ?? 5;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await requestOnce(url, opts, deadline);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (!location) throw new FetchError(`Redirect without a location (HTTP ${res.status}).`, 'HTTP_ERROR', res.status);
      url = assertFetchableUrl(new URL(location, url).toString(), opts.isBlocked);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      throw new FetchError(`The server returned HTTP ${res.status}.`, 'HTTP_ERROR', res.status);
    }
    const contentType = String(res.headers['content-type'] ?? '');
    return { url: url.toString(), status: res.status, contentType, body: decodeBody(res.body, contentType) };
  }
  throw new FetchError('Too many redirects.', 'TOO_MANY_REDIRECTS');
}
