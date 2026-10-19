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
