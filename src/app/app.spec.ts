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

  it('shows a publication-year chart derived from retrieved papers', () => {
    setQuery('drone delivery');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'drone delivery')
      .flush({
        totalHits: 5000,
        limit: 10,
        offset: 0,
        results: [
          { id: 'a', title: 'Paper A', yearPublished: 2024 },
          { id: 'b', title: 'Paper B', yearPublished: 2022 },
          { id: 'c', title: 'Paper C', yearPublished: 2024 },
          { id: 'd', title: 'Paper D', yearPublished: 2023 },
          { id: 'e', title: 'Paper E' },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Publication years of retrieved papers');
    expect(element.textContent).toContain('Based on 4 of 5 retrieved papers');
    expect(element.textContent).toContain('5,000 total matching records');
    expect(element.textContent).toContain('does not represent every matching paper in CORE');
    expect(element.textContent).toContain('1 paper excluded from the year distribution');

    const component = fixture.componentInstance;
    expect(component.yearDistribution().buckets.map((b) => [b.year, b.count])).toEqual([
      [2022, 1],
      [2023, 1],
      [2024, 2],
    ]);
    expect(component.yearDistribution().excludedCount).toBe(1);

    const rows = Array.from(element.querySelectorAll('.year-row'));
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '2022 1 paper',
      '2023 1 paper',
      '2024 2 papers',
    ]);

    const bars = Array.from(element.querySelectorAll<HTMLElement>('.year-bar'));
    expect(bars.map((bar) => bar.style.width)).toEqual(['50%', '50%', '100%']);

    const tableRows = Array.from(element.querySelectorAll('.year-table tbody tr'));
    expect(
      tableRows.map((row) =>
        Array.from(row.querySelectorAll('th, td'))
          .map((cell) => cell.textContent?.trim())
          .join(' '),
      ),
    ).toEqual(['2022 1', '2023 1', '2024 2']);
    expect(element.querySelector('.year-table caption')?.textContent).toContain(
      'Publication years of retrieved papers',
    );
  });

  it('updates the chart when a new search returns different results', () => {
    setQuery('first topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'first topic')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          { id: 'a', title: 'First A', yearPublished: 2020 },
          { id: 'b', title: 'First B', yearPublished: 2020 },
        ],
      });
    fixture.detectChanges();
    expect(fixture.componentInstance.yearDistribution().buckets).toEqual([
      jasmine.objectContaining({ year: 2020, count: 2 }),
    ]);

    setQuery('second topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'second topic')
      .flush({
        totalHits: 3,
        limit: 10,
        offset: 0,
        results: [
          { id: 'c', title: 'Second A', yearPublished: 2019 },
          { id: 'd', title: 'Second B', yearPublished: 2021 },
          { id: 'e', title: 'Second C', yearPublished: 2021 },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.yearDistribution().buckets.map((b) => [b.year, b.count])).toEqual([
      [2019, 1],
      [2021, 2],
    ]);
    expect(element.querySelectorAll('.year-row').length).toBe(2);
    expect(element.textContent).toContain('2019');
    expect(element.textContent).not.toContain('2020');
  });

  it('shows an idle empty state for the chart before any search', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('See publication years at a glance');
    expect(element.querySelector('.year-chart')).toBeNull();
    expect(element.querySelector('.year-table')).toBeNull();
  });

  it('shows a chart empty state when a search returns no papers', () => {
    setQuery('obscure topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'obscure topic')
      .flush({ totalHits: 0, limit: 10, offset: 0, results: [] });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('No papers to chart');
    expect(element.querySelector('.year-chart')).toBeNull();
  });

  it('shows a chart empty state when no retrieved paper has a valid year', () => {
    setQuery('undated topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'undated topic')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          { id: 'a', title: 'Undated A' },
          { id: 'b', title: 'Undated B', yearPublished: 'not-a-year' },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('No valid publication years');
    expect(element.textContent).toContain('2 papers excluded from the year distribution');
    expect(element.querySelector('.year-chart')).toBeNull();
    expect(fixture.componentInstance.yearDistribution().excludedCount).toBe(2);
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

  it('shows a topic explorer derived from retrieved papers', () => {
    setQuery('drone delivery');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'drone delivery')
      .flush({
        totalHits: 5000,
        limit: 10,
        offset: 0,
        results: [
          {
            id: 'a',
            title: 'Drone delivery systems',
            abstract: 'Autonomous drone delivery in cities',
            authors: ['Ada Author'],
            yearPublished: 2024,
          },
          {
            id: 'b',
            title: 'Drone mapping survey',
            abstract: 'Mapping remote forests with drones',
            authors: [],
            yearPublished: 2023,
          },
          { id: 'c', title: null, abstract: null },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Frequent topics in retrieved papers');
    expect(element.textContent).toContain('Based on 2 of 3 retrieved papers');
    expect(element.textContent).toContain('5,000 total matching records');
    expect(element.textContent).toContain('does not represent every matching paper in CORE');
    expect(element.textContent).toContain('exploratory leads only');
    expect(element.textContent).toContain('not confirmed research gaps');
    expect(element.textContent).toContain('1 paper excluded from the topic analysis');

    const component = fixture.componentInstance;
    const rows = Array.from(element.querySelectorAll('.topic-row'));
    expect(rows.length).toBe(component.topicDistribution().topics.length);
    expect(component.topicDistribution().topics[0].term).toBe('drone');
    expect(component.topicDistribution().topics[0].count).toBe(2);

    const tableRows = Array.from(element.querySelectorAll('.topic-table tbody tr'));
    expect(tableRows.length).toBe(rows.length);
    expect(element.querySelector('.topic-table caption')?.textContent).toContain(
      'Frequent topics in retrieved papers',
    );
  });

  it('lets users inspect the papers behind a topic', () => {
    setQuery('drone delivery');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'drone delivery')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          {
            id: 'a',
            title: 'Drone delivery systems',
            abstract: 'Autonomous drone delivery in cities',
            authors: ['Ada Author'],
            yearPublished: 2024,
          },
          {
            id: 'b',
            title: 'Drone mapping survey',
            abstract: 'Mapping remote forests with drones',
            authors: [],
            yearPublished: 2023,
          },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const firstRow = element.querySelector('.topic-row') as HTMLButtonElement;
    expect(firstRow.getAttribute('aria-pressed')).toBe('false');

    firstRow.click();
    fixture.detectChanges();

    expect(firstRow.getAttribute('aria-pressed')).toBe('true');
    const detail = element.querySelector('.topic-detail') as HTMLElement;
    expect(detail.textContent).toContain('Papers mentioning “drone” (2)');
    expect(detail.textContent).toContain('Drone delivery systems');
    expect(detail.textContent).toContain('Drone mapping survey');

    (element.querySelector('.topic-detail .example-query') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.topic-detail')).toBeNull();
  });

  it('updates the topic analysis when a new search returns different results', () => {
    setQuery('first topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'first topic')
      .flush({
        totalHits: 1,
        limit: 10,
        offset: 0,
        results: [{ id: 'a', title: 'First drone study', authors: [] }],
      });
    fixture.detectChanges();
    expect(fixture.componentInstance.topicDistribution().topics.map((t) => t.term)).toContain(
      'drone',
    );

    (fixture.nativeElement.querySelector('.topic-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.topic-detail')).not.toBeNull();

    setQuery('second topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'second topic')
      .flush({
        totalHits: 1,
        limit: 10,
        offset: 0,
        results: [{ id: 'b', title: 'Second tidal lagoon', authors: [] }],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const terms = fixture.componentInstance.topicDistribution().topics.map((t) => t.term);
    expect(terms).toContain('tidal');
    expect(terms).not.toContain('drone');
    expect(element.textContent).not.toContain('First drone study');
    expect(element.querySelector('.topic-detail')).toBeNull();
  });

  it('shows explorer empty states before a search and when papers lack usable text', () => {
    expect(fixture.nativeElement.textContent).toContain('Spot threads worth following');
    expect(fixture.nativeElement.querySelector('.topic-chart')).toBeNull();

    setQuery('undated topic');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'undated topic')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          { id: 'a', title: null, abstract: null },
          { id: 'b', title: '   ', abstract: '' },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('No clear topics found');
    expect(element.querySelector('.topic-chart')).toBeNull();
  });

  it('closes the topic panel when the selected topic is clicked again', () => {
    setQuery('drone delivery');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'drone delivery')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          {
            id: 'a',
            title: 'Drone delivery systems',
            abstract: 'Autonomous drone delivery in cities',
            authors: ['Ada Author'],
            yearPublished: 2024,
          },
          {
            id: 'b',
            title: 'Drone mapping survey',
            abstract: 'Mapping remote forests with drones',
            authors: [],
            yearPublished: 2023,
          },
        ],
      });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const firstRow = element.querySelector('.topic-row') as HTMLButtonElement;

    firstRow.click();
    fixture.detectChanges();
    expect(element.querySelector('.topic-detail')).not.toBeNull();

    firstRow.click();
    fixture.detectChanges();
    expect(element.querySelector('.topic-detail')).toBeNull();
    expect(firstRow.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps topic rows keyboard-accessible as native buttons', () => {
    setQuery('drone delivery');
    submitSearch();
    httpTestingController
      .expectOne((candidate) => candidate.params.get('q') === 'drone delivery')
      .flush({
        totalHits: 2,
        limit: 10,
        offset: 0,
        results: [
          {
            id: 'a',
            title: 'Drone delivery systems',
            abstract: 'Autonomous drone delivery in cities',
            authors: ['Ada Author'],
            yearPublished: 2024,
          },
          {
            id: 'b',
            title: 'Drone mapping survey',
            abstract: 'Mapping remote forests with drones',
            authors: [],
            yearPublished: 2023,
          },
        ],
      });
    fixture.detectChanges();

    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.topic-row'),
    ) as HTMLButtonElement[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tagName).toBe('BUTTON');
      expect(row.type).toBe('button');
      expect(row.disabled).toBeFalse();
      expect(row.getAttribute('aria-pressed')).toMatch(/^(true|false)$/);
      expect(row.getAttribute('aria-label')).toContain('papers');
    }

    rows[0].focus();
    expect(document.activeElement).toBe(rows[0]);
    rows[0].click();
    fixture.detectChanges();
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.topic-detail')).not.toBeNull();
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
