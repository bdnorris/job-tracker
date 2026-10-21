/** Query parameters that only track where a click came from; dropping them makes duplicate URLs match. */
const TRACKING_PARAMS = /^(utm_[a-z]+|gh_src|source|src|ref|referrer|lever-source|lever-origin|ashby_jid_source|fbclid|gclid|mc_[a-z]+|trk)$/i;

/**
 * Canonical form of a posting URL for storage and duplicate checks: no fragment, no tracking
 * parameters, no trailing slash, lowercase host. Non-URLs are returned trimmed.
 */
export function normalizeJobUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  let out = url.toString();
  if (url.pathname !== '/' && out.endsWith('/') && !url.search) out = out.slice(0, -1);
  return out;
}
