import config from '../../config';

const canonicalMap = new Map<string, string>();

for (const [canonical, aliases] of Object.entries(config.skills.list)) {
  canonicalMap.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    canonicalMap.set(alias.toLowerCase(), canonical);
  }
}

export function isSkillMatched(skillName: string): boolean {
  return canonicalMap.has(skillName.trim().toLowerCase());
}

export function computeMatchScore(skills: { name: string }[] | string[]): number {
  if (!skills || skills.length === 0) return 0;

  let matched = 0;
  for (const s of skills) {
    const name = typeof s === 'string' ? s : s.name;
    if (isSkillMatched(name)) {
      matched += 1;
    }
  }

  return Math.round((matched / skills.length) * 100);
}

/**
 * Maps skill names to canonical names from config (via aliases), trims them, and removes
 * case-insensitive duplicates. Skills not in config are kept as written.
 */
export function normalizeSkills(names: string[]): string[] {
  const out = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60) continue;
    const canonical = canonicalMap.get(name.toLowerCase()) ?? name;
    const key = canonical.toLowerCase();
    if (!out.has(key)) out.set(key, canonical);
  }
  return [...out.values()];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const textPatterns: { canonical: string; re: RegExp }[] = [];
for (const [canonical, aliases] of Object.entries(config.skills.list)) {
  for (const term of [canonical, ...aliases]) {
    // Terms of 1-2 characters ("ts", "Go") match only as written in config or in all
    // caps ("TS", "GO"), so the verb "go" doesn't count. Boundaries treat + # . as part of
    // a word, so "js" doesn't match inside "Node.js" and "C" doesn't match "C++".
    const short = term.length <= 2;
    const body = short ? `(?:${escapeRe(term)}|${escapeRe(term.toUpperCase())})` : escapeRe(term);
    textPatterns.push({
      canonical,
      re: new RegExp(`(?<![A-Za-z0-9_+#.])${body}(?![A-Za-z0-9_+#]|\\.[A-Za-z0-9])`, short ? 'g' : 'gi'),
    });
  }
}

/** Canonical config skills mentioned in free text, in config order. */
export function findSkillsInText(text: string): string[] {
  const found = new Set<string>();
  for (const { canonical, re } of textPatterns) {
    re.lastIndex = 0;
    if (re.test(text)) found.add(canonical);
  }
  return [...found];
}
