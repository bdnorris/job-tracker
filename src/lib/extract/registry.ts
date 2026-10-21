import type { Extractor } from './types';
import { greenhouse } from './extractors/greenhouse';
import { lever } from './extractors/lever';
import { ashby } from './extractors/ashby';
import { jsonld } from './extractors/jsonld';
import { heuristic } from './extractors/heuristic';
import { ai } from './extractors/ai';

/** All known extractors by name; `scraper.order` in config decides which run and in what order. */
export const EXTRACTORS: Record<string, Extractor> = { greenhouse, lever, ashby, jsonld, heuristic, ai };
