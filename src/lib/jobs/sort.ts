export const SORT_KEYS = ['title', 'company', 'status', 'salary', 'match', 'next', 'updated', 'created'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export const DEFAULT_SORT: SortKey = 'updated';

/** Direction used when a column is first clicked. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  title: 'asc',
  company: 'asc',
  status: 'asc',
  salary: 'desc',
  match: 'desc',
  next: 'asc',
  updated: 'desc',
  created: 'desc',
};

export interface SortableJob {
  title: string;
  company: string;
  status: string;
  salaryMin: number | null;
  salaryMax: number | null;
  nextActionDate: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  matchScore: number;
}

export function parseSort(sort: string | null, dir: string | null): { sort: SortKey; dir: SortDir } {
  const key = (SORT_KEYS as readonly string[]).includes(sort ?? '') ? (sort as SortKey) : DEFAULT_SORT;
  const d = dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR[key];
  return { sort: key, dir: d };
}

/**
 * Sorts jobs for the list view. Empty values (no salary, no next action) always sort last,
 * regardless of direction. `stageOrder` is the list of config stage ids.
 */
export function sortJobs<T extends SortableJob>(jobs: T[], sort: SortKey, dir: SortDir, stageOrder: string[]): T[] {
  const value = (j: T): string | number | null => {
    switch (sort) {
      case 'title':
        return j.title.toLowerCase();
      case 'company':
        return j.company.toLowerCase();
      case 'status': {
        const i = stageOrder.indexOf(j.status);
        return i === -1 ? stageOrder.length : i;
      }
      case 'salary':
        return j.salaryMax ?? j.salaryMin ?? null;
      case 'match':
        return j.matchScore;
      case 'next':
        return j.nextActionDate ?? null;
      case 'updated':
        return new Date(j.updatedAt).getTime();
      case 'created':
        return new Date(j.createdAt).getTime();
    }
  };

  const sign = dir === 'asc' ? 1 : -1;
  return [...jobs].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return 0;
  });
}
