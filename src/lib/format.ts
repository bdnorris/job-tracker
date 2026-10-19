interface SalaryFields {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

const PERIOD_SUFFIX: Record<string, string> = { year: '/yr', month: '/mo', hour: '/hr' };

/** Compact salary range, e.g. "USD 120,000–150,000/yr". Empty string when no salary is set. */
export function formatSalary(job: SalaryFields, { withCurrency = true } = {}): string {
  const { salaryMin: min, salaryMax: max } = job;
  if (!min && !max) return '';

  let range: string;
  if (min && max) {
    range = min === max ? min.toLocaleString('en-US') : `${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')}`;
  } else if (min) {
    range = `${min.toLocaleString('en-US')}+`;
  } else {
    range = `up to ${max!.toLocaleString('en-US')}`;
  }

  const currency = withCurrency && job.salaryCurrency ? `${job.salaryCurrency} ` : '';
  const period = job.salaryPeriod ? PERIOD_SUFFIX[job.salaryPeriod] ?? '' : '';
  return `${currency}${range}${period}`;
}

export const REMOTE_LABELS: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Onsite',
  unknown: 'Unknown',
};
