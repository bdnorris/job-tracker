import type { ExtractedJob } from './types';

/**
 * Infers remote/hybrid/onsite from location strings or text. Hybrid wins over remote
 * ("Hybrid - remote 2 days a week"), and explicit onsite wording wins over a passing
 * mention of remote work only when remote isn't stated as the arrangement.
 */
export function inferRemoteType(...texts: (string | null | undefined)[]): ExtractedJob['remoteType'] {
  const t = texts.filter(Boolean).join(' \n ').toLowerCase();
  if (!t.trim()) return undefined;
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\b(fully[- ]remote|100% remote|remote[- ]first|remote[- ]friendly|work from (?:home|anywhere)|wfh|telecommute|remote\s*(?:\(|-|,|–|\/|\bin\b|$|\n|\bonly\b|\bposition\b|\brole\b|\bus\b|\busa\b))/.test(t)) {
    return 'remote';
  }
  if (/^\s*remote\b/.test(t)) return 'remote';
  if (/\b(on[- ]?site|in[- ]office|in[- ]person|onsite only)\b/.test(t)) return 'onsite';
  return undefined;
}
