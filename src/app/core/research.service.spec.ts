import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CoreSearchResponse } from './core-api.models';
import { CoreApiResponseError, ResearchService } from './research.service';

describe('ResearchService', () => {
  let service: ResearchService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ResearchService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTestingController.verify());

  it('preserves Boolean query expressions and sends pagination parameters', () => {
    const query = '(drone AND (package OR delivery))';
    let response: unknown;

    service.searchWorks(query, 3, 6).subscribe((value) => (response = value));

    const request = httpTestingController.expectOne(
      (candidate) =>
        candidate.url === '/api/core/search/works' &&
        candidate.params.get('q') === query &&
        candidate.params.get('limit') === '3' &&
        candidate.params.get('offset') === '6',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ totalHits: 9, limit: 3, offset: 6, results: [] });
    expect(response).toEqual({ totalHits: 9, limit: 3, offset: 6, results: [] });
  });

  it('normalizes paper metadata and only exposes safe publication URLs', () => {
    let result: CoreSearchResponse | undefined;

    service.searchWorks('drone').subscribe((response) => (result = response));
    httpTestingController.expectOne('/api/core/search/works?q=drone&limit=10&offset=0').flush({
      totalHits: 1,
      limit: 10,
      offset: 0,
      results: [
        {
          id: 123,
          title: '  Delivery drones  ',
          authors: ['Ada Author', { name: 'Grace Researcher' }, { name: '' }],
          yearPublished: '2024',
          abstract: '  A study. ',
          publisher: 'Publisher',
          doi: '10.1234/example',
          downloadUrl: 'javascript:alert(1)',
          links: [
            { url: 'https://publisher.example/paper' },
            'javascript:alert(1)',
            'https://user:pass@publisher.example/private',
          ],
        },
      ],
    });

    expect(result!.results[0]).toEqual({
      id: '123',
      title: 'Delivery drones',
      authors: ['Ada Author', 'Grace Researcher'],
      abstract: 'A study.',
      yearPublished: 2024,
      publisher: 'Publisher',
      doi: '10.1234/example',
      downloadUrl: null,
      links: ['https://publisher.example/paper'],
      publicationUrl: 'https://core.ac.uk/works/123',
    });
  });

  it('normalizes missing optional metadata', () => {
    let result: CoreSearchResponse | undefined;

    service.searchWorks('drone').subscribe((response) => (result = response));
    httpTestingController.expectOne('/api/core/search/works?q=drone&limit=10&offset=0').flush({
      totalHits: 1,
      limit: 10,
      offset: 0,
      results: [{}],
    });

    expect(result!.results[0]).toEqual({
      id: null,
      title: null,
      authors: [],
      abstract: null,
      yearPublished: null,
      publisher: null,
      doi: null,
      downloadUrl: null,
      links: [],
      publicationUrl: null,
    });
  });

  it('surfaces malformed CORE responses as a typed error', () => {
    let receivedError: unknown;

    service.searchWorks('drone').subscribe({ error: (error) => (receivedError = error) });
    httpTestingController
      .expectOne('/api/core/search/works?q=drone&limit=10&offset=0')
      .flush({ totalHits: 'many', limit: 10, offset: 0, results: [] });

    expect(receivedError).toEqual(jasmine.any(CoreApiResponseError));
  });

  it('preserves HTTP failures for callers', () => {
    let receivedError: unknown;

    service.searchWorks('drone').subscribe({ error: (error) => (receivedError = error) });
    httpTestingController
      .expectOne('/api/core/search/works?q=drone&limit=10&offset=0')
      .flush('CORE unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(receivedError).toEqual(jasmine.any(HttpErrorResponse));
    expect((receivedError as HttpErrorResponse).status).toBe(503);
  });
});
