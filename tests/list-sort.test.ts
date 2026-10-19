import { describe, it, expect } from 'vitest';
import { parseSort, sortJobs, type SortableJob } from '../src/lib/jobs/sort';

const job = (over: Partial<SortableJob> & { title: string }): SortableJob => ({
  company: 'Example Corp',
  status: 'saved',
  salaryMin: null,
  salaryMax: null,
  nextActionDate: null,
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  matchScore: 0,
  ...over,
});

const stages = ['saved', 'applied', 'interviewing'];
const titles = (list: SortableJob[]) => list.map((j) => j.title);

describe('list sorting', () => {
  it('parses sort params with defaults', () => {
    expect(parseSort(null, null)).toEqual({ sort: 'updated', dir: 'desc' });
    expect(parseSort('title', null)).toEqual({ sort: 'title', dir: 'asc' });
    expect(parseSort('salary', 'asc')).toEqual({ sort: 'salary', dir: 'asc' });
    expect(parseSort('bogus', 'sideways')).toEqual({ sort: 'updated', dir: 'desc' });
  });

  it('sorts by stage order from config', () => {
    const jobs = [job({ title: 'C', status: 'interviewing' }), job({ title: 'A', status: 'saved' }), job({ title: 'B', status: 'applied' })];
    expect(titles(sortJobs(jobs, 'status', 'asc', stages))).toEqual(['A', 'B', 'C']);
    expect(titles(sortJobs(jobs, 'status', 'desc', stages))).toEqual(['C', 'B', 'A']);
  });

  it('puts empty values last in both directions', () => {
    const jobs = [job({ title: 'none' }), job({ title: 'low', salaryMax: 100 }), job({ title: 'high', salaryMin: 200 })];
    expect(titles(sortJobs(jobs, 'salary', 'desc', stages))).toEqual(['high', 'low', 'none']);
    expect(titles(sortJobs(jobs, 'salary', 'asc', stages))).toEqual(['low', 'high', 'none']);
  });

  it('sorts next action dates and match scores', () => {
    const jobs = [
      job({ title: 'later', nextActionDate: '2026-05-02', matchScore: 10 }),
      job({ title: 'none', matchScore: 90 }),
      job({ title: 'soon', nextActionDate: '2026-05-01', matchScore: 50 }),
    ];
    expect(titles(sortJobs(jobs, 'next', 'asc', stages))).toEqual(['soon', 'later', 'none']);
    expect(titles(sortJobs(jobs, 'match', 'desc', stages))).toEqual(['none', 'soon', 'later']);
  });

  it('does not mutate its input', () => {
    const jobs = [job({ title: 'b' }), job({ title: 'a' })];
    sortJobs(jobs, 'title', 'asc', stages);
    expect(titles(jobs)).toEqual(['b', 'a']);
  });
});
