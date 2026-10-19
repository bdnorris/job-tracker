import { describe, it, expect } from 'vitest';
import { isSkillMatched, computeMatchScore } from '../src/lib/skills/match';

describe('Skill match scoring', () => {
  it('correctly matches canonical skills and aliases from config', () => {
    // Config has: JavaScript: ['js', 'javascript'], TypeScript: ['ts'], Astro: [], React: ['react.js', 'reactjs']
    expect(isSkillMatched('TypeScript')).toBe(true);
    expect(isSkillMatched('ts')).toBe(true);
    expect(isSkillMatched('reactjs')).toBe(true);
    expect(isSkillMatched('React')).toBe(true);
    expect(isSkillMatched('Astro')).toBe(true);
    expect(isSkillMatched('Rust')).toBe(false);
  });

  it('computes match score percentage accurately', () => {
    const jobSkills = [
      { name: 'TypeScript' }, // match
      { name: 'React' },      // match
      { name: 'Rust' },       // no match
      { name: 'Python' },     // no match
    ];

    // 2 out of 4 = 50%
    expect(computeMatchScore(jobSkills)).toBe(50);
  });

  it('handles empty skill lists gracefully', () => {
    expect(computeMatchScore([])).toBe(0);
  });
});
