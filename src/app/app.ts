import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, Subject, switchMap } from 'rxjs';
import { CoreApiResponseError, ResearchService } from './core/research.service';
import { CoreSearchResponse, ResearchPaper } from './core/core-api.models';
import { buildPublicationYearDistribution } from './core/publication-years';
import { buildResearchTopicDistribution } from './core/research-topics';

const EXAMPLE_QUERY = '(drone AND (package OR delivery))';
const RESULT_LIMITS = [10, 25, 50, 100] as const;
type ResultLimit = (typeof RESULT_LIMITS)[number];

interface SearchRequest {
  query: string;
  limit: ResultLimit;
}

type DashboardState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'success'; query: string; response: CoreSearchResponse }
  | { status: 'error'; query: string; message: string };

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly query = signal('');
  readonly limit = signal<ResultLimit>(10);
  readonly state = signal<DashboardState>({ status: 'idle' });
  readonly isLoading = computed(() => this.state().status === 'loading');

  /** Response of the last successful search, or null before/without one. */
  readonly searchResponse = computed<CoreSearchResponse | null>(() => {
    const currentState = this.state();
    return currentState.status === 'success' ? currentState.response : null;
  });

  /** Papers retrieved by the current search; empty until a search succeeds. */
  readonly retrievedPapers = computed<ResearchPaper[]>(
    () => this.searchResponse()?.results ?? [],
  );

  /** Publication-year distribution derived directly from retrieved papers. */
  readonly yearDistribution = computed(() =>
    buildPublicationYearDistribution(this.retrievedPapers()),
  );

  /** Topic-frequency distribution derived directly from retrieved papers. */
  readonly topicDistribution = computed(() =>
    buildResearchTopicDistribution(this.retrievedPapers()),
  );

  /** Currently inspected topic term, or null when no topic is selected. */
  readonly selectedTopic = signal<string | null>(null);

  /** Papers supporting the selected topic, in retrieved order. */
  readonly selectedTopicPapers = computed<ResearchPaper[]>(() => {
    const term = this.selectedTopic();
    if (!term) {
      return [];
    }
    const topic = this.topicDistribution().topics.find((candidate) => candidate.term === term);
    if (!topic) {
      return [];
    }
    const papers = this.retrievedPapers();
    return topic.paperIndexes
      .filter((index) => index >= 0 && index < papers.length)
      .map((index) => papers[index]);
  });

  private readonly searchRequests = new Subject<SearchRequest>();
  private readonly researchService = inject(ResearchService);

  constructor() {
    this.searchRequests
      .pipe(
        switchMap(({ query, limit }) => {
          this.state.set({ status: 'loading', query });
          return this.researchService.searchWorks(query, limit).pipe(
            map(
              (response): DashboardState => ({
                status: 'success',
                query,
                response,
              }),
            ),
            catchError((error: unknown) =>
              of<DashboardState>({
                status: 'error',
                query,
                message: this.getErrorMessage(error),
              }),
            ),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((state) => this.state.set(state));
  }

  updateQuery(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.query.set(event.target.value);
    }
  }

  updateLimit(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }

    const selectedLimit = Number(event.target.value);
    if (RESULT_LIMITS.some((limit) => limit === selectedLimit)) {
      this.limit.set(selectedLimit as ResultLimit);
    }
  }

  applyExampleQuery(): void {
    this.query.set(EXAMPLE_QUERY);
  }

  submitSearch(event?: Event): void {
    event?.preventDefault();
    const query = this.query().trim();
    if (query) {
      this.selectedTopic.set(null);
      this.searchRequests.next({ query, limit: this.limit() });
    }
  }

  retrySearch(): void {
    const currentState = this.state();
    if (currentState.status === 'error') {
      this.selectedTopic.set(null);
      this.searchRequests.next({ query: currentState.query, limit: this.limit() });
    }
  }

  selectTopic(term: string): void {
    this.selectedTopic.set(this.selectedTopic() === term ? null : term);
  }

  clearSelectedTopic(): void {
    this.selectedTopic.set(null);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof CoreApiResponseError) {
      return 'CORE returned an unexpected response. Please try again.';
    }

    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Could not connect to CORE. Check your connection and try again.';
      }
      return `CORE search failed (HTTP ${error.status}). Please try again.`;
    }

    return 'Search failed unexpectedly. Please try again.';
  }
}
