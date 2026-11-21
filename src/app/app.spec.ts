import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    fixture = TestBed.createComponent(App);
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpTestingController.verify());

  it('applies the example Boolean expression to the search field', () => {
    const exampleButton = fixture.nativeElement.querySelector(
      '.example-query',
    ) as HTMLButtonElement;

    exampleButton.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#research-query') as HTMLInputElement;
    expect(input.value).toBe('(drone AND (package OR delivery))');
  });

  it('submits Boolean searches with the chosen limit and renders paper details', () => {
    setQuery('(drone AND (package OR delivery))');
    setLimit(25);
    submitSearch();

    const request = httpTestingController.expectOne(
      (candidate) =>
        candidate.url === '/api/core/search/works' &&
        candidate.params.get('q') === '(drone AND (package OR delivery))' &&
        candidate.params.get('limit') === '25' &&
        candidate.params.get('offset') === '0',
    );
    request.flush({
      totalHits: 1234,
      limit: 25,
      offset: 0,
      results: [
        {
          id: 'paper-1',
          title: 'Drone delivery systems',
          authors: ['Ada Author', 'Grace Researcher'],
          yearPublished: 2024,
          publisher: 'Open Research Press',
          abstract: 'A review of autonomous package delivery using aerial vehicles.',
          downloadUrl: 'https://files.example.org/paper.pdf',
        },
      ],
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h3')?.textContent).toContain('Drone delivery systems');
    expect(element.textContent).toContain('Ada Author · Grace Researcher');
    expect(element.textContent).toContain('2024');
    expect(element.textContent).toContain('Open Research Press');
    expect(element.textContent).toContain(
      'A review of autonomous package delivery using aerial vehicles.',
    );

    const countCards = element.querySelectorAll('.count-card');
    expect(countCards[0].textContent).toContain('1,234');
    expect(countCards[0].textContent).toContain('Total matching records');
    expect(countCards[1].textContent).toContain('1');
    expect(countCards[1].textContent).toContain('Papers retrieved');

    const links = Array.from(element.querySelectorAll('.paper-links a'));
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toBe('https://core.ac.uk/works/paper-1');
    expect(links[1].getAttribute('href')).toBe('https://files.example.org/paper.pdf');
    expect(links.every((link) => link.getAttribute('rel') === 'noopener noreferrer')).toBeTrue();
  });

  it('supports all provided result limits', () => {
    setQuery('climate adaptation');

    for (const limit of [10, 25, 50, 100]) {
      setLimit(limit);
      submitSearch();
      const request = httpTestingController.expectOne(
        (candidate) => candidate.params.get('limit') === String(limit),
      );
      request.flush({ totalHits: 0, limit, offset: 0, results: [] });
      fixture.detectChanges();
    }

    expect(fixture.nativeElement.textContent).toContain('No papers found');
  });

  it('announces search errors and retries the failed query', () => {
    setQuery('ocean currents');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'ocean currents')
      .flush('CORE unavailable', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'CORE search failed (HTTP 503)',
    );

    (element.querySelector('.retry-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const retry = httpTestingController.expectOne(
      (candidate) =>
        candidate.params.get('q') === 'ocean currents' &&
        candidate.params.get('limit') === '10',
    );
    retry.flush({ totalHits: 0, limit: 10, offset: 0, results: [] });
    fixture.detectChanges();

    expect(element.textContent).toContain('No papers found');
  });

  it('cancels an older search when a newer query is submitted', () => {
    setQuery('first query');
    submitSearch();
    const firstRequest = httpTestingController.expectOne(
      (candidate) => candidate.params.get('q') === 'first query',
    );

    setQuery('newer query');
    submitSearch();
    expect(firstRequest.cancelled).toBeTrue();

    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'newer query')
      .flush({
        totalHits: 1,
        limit: 10,
        offset: 0,
        results: [{ id: 'new', title: 'Latest result' }],
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Latest result');
    expect(fixture.nativeElement.textContent).not.toContain('first query');
  });

  function setQuery(query: string): void {
    const input = fixture.nativeElement.querySelector('#research-query') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function setLimit(limit: number): void {
    const select = fixture.nativeElement.querySelector('#result-limit') as HTMLSelectElement;
    select.value = String(limit);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  function submitSearch(): void {
    const form = fixture.nativeElement.querySelector('.search-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }
});
