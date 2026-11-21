import { isPlatformServer } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { map, Observable } from 'rxjs';
import { CoreSearchResponse, ResearchPaper } from './core-api.models';

const CORE_SEARCH_URL = 'https://api.core.ac.uk/v3/search/works';
const BROWSER_PROXY_URL = '/api/core/search/works';

export class CoreApiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreApiResponseError';
  }
}

@Injectable({ providedIn: 'root' })
export class ResearchService {
  private readonly http = inject(HttpClient);
  private readonly isServer = isPlatformServer(inject(PLATFORM_ID));

  searchWorks(query: string, limit = 10, offset = 0): Observable<CoreSearchResponse> {
    if (!query.trim()) {
      throw new RangeError('A CORE search query is required.');
    }
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new RangeError('The result limit must be a non-negative integer.');
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('The result offset must be a non-negative integer.');
    }

    const params = new HttpParams()
      .set('q', query)
      .set('limit', limit)
      .set('offset', offset);

    return this.http
      .get<unknown>(this.isServer ? CORE_SEARCH_URL : BROWSER_PROXY_URL, { params })
      .pipe(map(parseCoreResponse));
  }
}

function parseCoreResponse(payload: unknown): CoreSearchResponse {
  if (!isRecord(payload) || !Array.isArray(payload['results'])) {
    throw new CoreApiResponseError('CORE API returned an invalid search response.');
  }

  const totalHits = nonNegativeInteger(payload['totalHits']);
  const limit = nonNegativeInteger(payload['limit']);
  const offset = nonNegativeInteger(payload['offset']);
  if (totalHits === null || limit === null || offset === null) {
    throw new CoreApiResponseError('CORE API returned invalid pagination metadata.');
  }

  const results = payload['results'].map((work) => {
    if (!isRecord(work)) {
      throw new CoreApiResponseError('CORE API returned an invalid work record.');
    }
    return normalizeWork(work);
  });

  return { totalHits, limit, offset, results };
}

function normalizeWork(work: Record<string, unknown>): ResearchPaper {
  const id = normalizeId(work['id']);
  const workLinks = work['links'];
  const authors = work['authors'];
  const links = Array.isArray(workLinks)
    ? workLinks
        .map(linkUrl)
        .filter((url): url is string => url !== null)
    : [];
  const downloadUrl = safeHttpUrl(work['downloadUrl']);

  return {
    id,
    title: nonEmptyString(work['title']),
    authors: Array.isArray(authors)
      ? authors
          .map(authorName)
          .filter((name): name is string => name !== null)
      : [],
    abstract: nonEmptyString(work['abstract']),
    yearPublished: publishedYear(work['yearPublished']),
    publisher: nonEmptyString(work['publisher']),
    doi: nonEmptyString(work['doi']),
    downloadUrl,
    links,
    publicationUrl:
      (id && `https://core.ac.uk/works/${encodeURIComponent(id)}`) ??
      downloadUrl ??
      links[0] ??
      null,
  };
}

function authorName(author: unknown): string | null {
  if (typeof author === 'string') {
    return nonEmptyString(author);
  }
  return isRecord(author) ? nonEmptyString(author['name']) : null;
}

function linkUrl(link: unknown): string | null {
  if (typeof link === 'string') {
    return safeHttpUrl(link);
  }
  if (!isRecord(link)) {
    return null;
  }
  return safeHttpUrl(link['url'] ?? link['href']);
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return nonEmptyString(value);
  }
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publishedYear(value: unknown): number | null {
  const year =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(year) && year > 0 ? year : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
