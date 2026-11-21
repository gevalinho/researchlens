import { ResearchPaper } from './core-api.models';
import {
  buildPublicationYearDistribution,
  isValidPublicationYear,
} from './publication-years';

function paper(yearPublished: ResearchPaper['yearPublished']): Pick<ResearchPaper, 'yearPublished'> {
  return { yearPublished };
}

describe('buildPublicationYearDistribution', () => {
  it('aggregates papers by publication year with integer counts', () => {
    const distribution = buildPublicationYearDistribution([
      paper(2024),
      paper(2024),
      paper(2023),
      paper(2024),
      paper(2022),
    ]);

    expect(distribution.buckets).toEqual([
      { year: 2022, count: 1, widthPercent: 33.3 },
      { year: 2023, count: 1, widthPercent: 33.3 },
      { year: 2024, count: 3, widthPercent: 100 },
    ]);
    expect(distribution.totalRetrieved).toBe(5);
    expect(distribution.validCount).toBe(5);
    expect(distribution.excludedCount).toBe(0);
    expect(distribution.maxCount).toBe(3);
  });

  it('sorts years chronologically regardless of input order', () => {
    const distribution = buildPublicationYearDistribution([
      paper(2025),
      paper(2019),
      paper(2022),
      paper(2019),
    ]);

    expect(distribution.buckets.map((bucket) => bucket.year)).toEqual([2019, 2022, 2025]);
    expect(distribution.buckets.map((bucket) => bucket.count)).toEqual([2, 1, 1]);
  });

  it('excludes papers with missing or invalid years and counts them', () => {
    const invalid = [
      paper(null),
      { yearPublished: undefined },
      { yearPublished: 0 },
      { yearPublished: -2020 },
      { yearPublished: Number.NaN },
      { yearPublished: 2020.5 },
      { yearPublished: '2024' },
    ] as unknown as Pick<ResearchPaper, 'yearPublished'>[];

    const distribution = buildPublicationYearDistribution([paper(2021), ...invalid, paper(2021)]);

    expect(distribution.buckets).toEqual([{ year: 2021, count: 2, widthPercent: 100 }]);
    expect(distribution.totalRetrieved).toBe(9);
    expect(distribution.validCount).toBe(2);
    expect(distribution.excludedCount).toBe(7);
  });

  it('returns an empty distribution for no papers', () => {
    const distribution = buildPublicationYearDistribution([]);

    expect(distribution).toEqual({
      buckets: [],
      totalRetrieved: 0,
      validCount: 0,
      excludedCount: 0,
      maxCount: 0,
    });
  });

  it('returns no buckets when every year is missing or invalid', () => {
    const distribution = buildPublicationYearDistribution([paper(null), paper(null)]);

    expect(distribution.buckets).toEqual([]);
    expect(distribution.validCount).toBe(0);
    expect(distribution.excludedCount).toBe(2);
    expect(distribution.maxCount).toBe(0);
  });

  it('scales bar widths relative to the largest bucket', () => {
    const distribution = buildPublicationYearDistribution([
      paper(2020),
      paper(2021),
      paper(2021),
      paper(2022),
      paper(2022),
      paper(2022),
      paper(2022),
    ]);

    expect(distribution.buckets.map((bucket) => bucket.widthPercent)).toEqual([25, 50, 100]);
  });
});

describe('isValidPublicationYear', () => {
  it('accepts positive safe integers and rejects everything else', () => {
    expect(isValidPublicationYear(2024)).toBeTrue();
    expect(isValidPublicationYear(1)).toBeTrue();
    expect(isValidPublicationYear(null)).toBeFalse();
    expect(isValidPublicationYear(undefined)).toBeFalse();
    expect(isValidPublicationYear(0)).toBeFalse();
    expect(isValidPublicationYear(-1)).toBeFalse();
    expect(isValidPublicationYear(2024.5)).toBeFalse();
    expect(isValidPublicationYear(Number.NaN)).toBeFalse();
    expect(isValidPublicationYear('2024')).toBeFalse();
  });
});
