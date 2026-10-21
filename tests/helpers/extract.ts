import fs from 'node:fs';
import path from 'node:path';
import config from '../../src/config';
import type { ExtractContext, ExtractedJob } from '../../src/lib/extract/types';

export const fixture = (name: string) => fs.readFileSync(path.join('tests/fixtures', name), 'utf8');
export const fixtureJson = (name: string) => JSON.parse(fixture(name));

/** A context whose fetchJson serves canned responses by URL and records what was requested. */
export function fakeContext(responses: Record<string, unknown> = {}, found: ExtractedJob = {}) {
  const requested: string[] = [];
  const ctx: ExtractContext = {
    config,
    remainingMs: () => 8000,
    found,
    readableText: () => found.descriptionText ?? '',
    fetchJson: async (url) => {
      requested.push(url);
      if (!(url in responses)) throw new Error(`unexpected fetch ${url}`);
      return responses[url];
    },
  };
  return { ctx, requested };
}
