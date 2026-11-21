import { ResearchPaper } from './core-api.models';

export interface PublicationYearBucket {
  year: number;
  count: number;
  /** Bar width as a percentage of the largest bucket (0–100). */
  widthPercent: number;
}

export interface PublicationYearDistribution {
  buckets: PublicationYearBucket[];
  /** Papers passed in (retrieved in the current search). */
  totalRetrieved: number;
  /** Papers with a valid publication year and included in the chart. */
  validCount: number;
  /** Papers excluded because the year was missing or invalid. */
  excludedCount: number;
  /** Largest per-year count, or 0 when there are no valid years. */
  maxCount: number;
}

export function isValidPublicationYear(year: unknown): year is number {
  return typeof year === 'number' && Number.isSafeInteger(year) && year > 0;
}

/**
 * Aggregates retrieved papers into a chronologically sorted
 * publication-year distribution. Papers whose yearPublished is
 * missing or invalid are counted as excluded, never bucketed.
 */
export function buildPublicationYearDistribution(
  papers: readonly Pick<ResearchPaper, 'yearPublished'>[],
): PublicationYearDistribution {
  const counts = new Map<number, number>();
  let excludedCount = 0;

  for (const paper of papers) {
    const year: unknown = paper?.yearPublished;
    if (isValidPublicationYear(year)) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    } else {
      excludedCount += 1;
    }
  }

  const sortedYears = [...counts.keys()].sort((a, b) => a - b);
  const maxCount = sortedYears.reduce((max, year) => Math.max(max, counts.get(year) ?? 0), 0);

  const buckets: PublicationYearBucket[] = sortedYears.map((year) => {
    const count = counts.get(year) ?? 0;
    return {
      year,
      count,
      widthPercent: maxCount === 0 ? 0 : Math.round((count / maxCount) * 1000) / 10,
    };
  });

  return {
    buckets,
    totalRetrieved: papers.length,
    validCount: papers.length - excludedCount,
    excludedCount,
    maxCount,
  };
}
