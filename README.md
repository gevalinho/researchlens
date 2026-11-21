# ResearchLens

ResearchLens is an Angular 20 research-discovery dashboard for searching
[CORE](https://core.ac.uk/)'s open-access collection. It supports Boolean
search, configurable result limits, typed result normalisation, and an
accessible publication-year chart derived from the papers actually retrieved.

This project was built as a software engineering interview assessment. It is
not hosted at a public URL; run it locally using the instructions below.

## Implemented features

- **Boolean search** — the query text is passed through to CORE unchanged, so
  expressions combining `AND`, `OR`, and parentheses work as written. A
  one-click example fills in `(drone AND (package OR delivery))`.
- **Configurable result limits** — retrieve 10, 25, 50, or 100 papers per
  search (10 by default).
- **Result counts with honest scope** — the dashboard shows both CORE's
  `totalHits` ("Total matching records, reported by CORE") and the number of
  papers actually retrieved in the current search.
- **Paper result cards** — title, authors, publication year, publisher, DOI,
  abstract (with a fallback when none is available), a publication link, and a
  PDF download link when CORE provides one.
- **Complete search states** — idle, loading, success, empty ("No papers
  found"), and error states, with a retry action after a failed search.
- **Stale-request cancellation** — submitting a new search cancels the previous
  in-flight request, so out-of-order responses never overwrite newer results.
- **Publication-year analytics** — an accessible bar chart titled
  "Publication years of retrieved papers", with a matching data table,
  sample-size labelling, a missing/invalid-year exclusion count, and a clear
  statement that the chart covers only the retrieved sample (see
  [Research analytics methodology](#research-analytics-methodology)).
- **Responsive, accessible UI** — semantic landmarks, labelled controls,
  `aria-live` result updates, visible focus styles, screen-reader summaries,
  and layouts that adapt from desktop to mobile widths.
- **SSR / prerendering** — routes are prerendered (`RenderMode.Prerender`) and
  the production build ships a Node/Express SSR server. Change detection is
  zoneless, and reactive state uses Angular signals and computed signals.

## Technology stack

| Area | Technology |
| --- | --- |
| Framework | Angular 20.3 (`@angular/core`, `platform-browser`, `platform-server`, `ssr`) |
| Language | TypeScript ~5.9 (strict mode, `strictTemplates`) |
| Reactive state | Angular signals / computed signals, RxJS ~7.8 |
| Server | Express 5 (SSR and CORE proxy endpoint) |
| Styling | SCSS (single component stylesheet, no UI framework) |
| Unit tests | Karma 6, Jasmine 5, Chrome headless via `karma-chrome-launcher` |
| Build | Angular CLI / `@angular/build` 20.3, npm |

## Prerequisites

- **Node.js**: `^20.19.0 || ^22.12.0 || >=24.0.0` (the version range required
  by Angular CLI 20, taken from `@angular/cli`'s `engines`). Node 20.19+ LTS
  or 22.12+ LTS is recommended.
- **npm**: a current npm 10/11 release (any npm satisfying
  `^6.11.0 || ^7.5.6 || >=8.0.0` works; use the npm bundled with your Node).
- **Google Chrome or Chromium**: required to run the Karma unit tests, which
  launch a real Chrome instance.
- **Internet access**: searches call the live CORE API. No CORE account or API
  key is configured or required by this project.

## Installation and local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm start
```

`npm start` runs `ng serve` with the proxy in `proxy.conf.cjs` (configured in
`angular.json` under `serve.options.proxyConfig`). Open
<http://localhost:4200/> in a browser (Angular's default dev-server address).
The dev server reloads when source files change.

Other scripts defined in `package.json`:

```bash
npm run watch   # ng build --watch --configuration development
npm run ng -- --version   # run the Angular CLI through the local install
```

## CORE API integration and proxy architecture

All searches go to CORE's works search endpoint:

```text
GET https://api.core.ac.uk/v3/search/works?q=<query>&limit=<limit>&offset=<offset>
```

No API key, token, or other credential is used or stored anywhere in this
repository; requests are anonymous, so CORE's anonymous rate limits apply
(an HTTP 429 response is surfaced to the user as a normal search error with a
retry action).

There are two request paths, chosen at runtime by
`src/app/core/research.service.ts` (`isPlatformServer`):

1. **Browser (development and production client)** — the app calls the
   same-origin relative URL `/api/core/search/works`. This avoids CORS issues
   and keeps the upstream host out of browser code.
   - In development, `ng serve` forwards that path using `proxy.conf.cjs`,
     rewriting `/api/core/search/works` to `/v3/search/works` on
     `https://api.core.ac.uk`.
   - In production, the Express SSR server (`src/server.ts`) implements the
     same route, validates `q`/`limit`/`offset`, forwards the request with
     `fetch`, and passes through CORE's status and content type.
2. **Server-side rendering** — when code runs on the server, the service calls
   `https://api.core.ac.uk/v3/search/works` directly.

Responses are treated as untrusted input. `parseCoreResponse` in
`research.service.ts` validates the payload shape and pagination metadata
(throwing a typed `CoreApiResponseError` on malformed responses), and
`normalizeWork` converts each record into the typed `ResearchPaper` model in
`src/app/core/core-api.models.ts`:

- string fields are trimmed, with empty values becoming `null`;
- authors accept both string and `{ name }` shapes;
- `yearPublished` accepts numbers and numeric strings, and otherwise becomes
  `null` (safe positive integers only);
- only `http:`/`https:` URLs without embedded credentials are kept, so unsafe
  values such as `javascript:` URLs are dropped;
- the publication link prefers `https://core.ac.uk/works/<id>`, then a safe
  download URL, then the first safe link.

## Example Boolean search query

```text
(drone AND (package OR delivery))
```

Click **Try an example** in the search panel to fill this in, choose how many
results to show, then select **Search papers**. Other topic or Boolean queries
can be typed directly, for example `climate adaptation` or
`(solar OR wind) AND storage`.

## Configurable result limits

The **Show … results** selector offers 10, 25, 50, and 100. The selected limit
is sent to CORE as the `limit` parameter on the next search; changing it alone
does not re-run a search until **Search papers** is selected. The service also
accepts an `offset` parameter (validated as a non-negative integer), although
the UI currently retrieves a single page of results.

## Research analytics methodology

The "Publication years of retrieved papers" chart is computed locally from the
current search results — it issues no additional CORE request and uses no
sample or hardcoded data:

1. `buildPublicationYearDistribution()` in
   `src/app/core/publication-years.ts` reads the normalised
   `yearPublished` of every retrieved paper.
2. A year is valid only when it is a positive safe integer. Papers with a
   missing or invalid year are never placed in a year bucket; they are counted
   separately and reported in the UI as excluded from the year distribution.
3. Papers are counted per year with integer counts, years are sorted
   chronologically, and bar widths are scaled to the largest year's count.
4. The distribution is an Angular `computed()` over the dashboard state, so it
   updates automatically whenever a new search (query or limit change) returns
   fresh results.

**Sample-size limitations.** The chart describes only the papers retrieved in
the current search (at most the selected limit of 10–100). CORE's `totalHits`
is usually far larger, so the chart must not be read as the publication-year
distribution of every matching paper in CORE; the UI states this next to the
chart together with the exact sample ("Based on X of Y retrieved papers with a
valid publication year"). Years with no retrieved papers do not appear, and
changing the result limit can change the chart's shape.

## Testing

Run the unit test suite once (Karma + Jasmine in Chrome headless):

```bash
npm test -- --watch=false
```

The suite currently contains 22 tests covering:

- `ResearchService`: Boolean query pass-through and pagination parameters,
  metadata normalisation (including safe-URL filtering), missing metadata,
  malformed-response errors, and HTTP failure handling.
- The dashboard component: example-query filling, search submission with the
  chosen limit, result rendering, all four result limits, error announcement
  and retry, stale-request cancellation, chart rendering and bar widths, chart
  updates across searches, and idle/no-results/no-valid-year chart states.
- `publication-years`: aggregation, chronological sorting, missing/invalid
  year exclusion, empty inputs, and bar-width scaling.

Test files live next to the code they cover (`src/app/app.spec.ts`,
`src/app/core/research.service.spec.ts`,
`src/app/core/publication-years.spec.ts`). There is no end-to-end test suite.

## Production build and SSR deployment

Create the production build:

```bash
npm run build
```

This runs `ng build` (production is the default configuration) and writes the
browser bundle, SSR server bundle, and prerendered output to
`dist/researchlens/`.

Serve the built application with the bundled Node/Express server:

```bash
npm run serve:ssr:researchlens
```

That script runs `node dist/researchlens/server/server.mjs`. The server
listens on port 4000 by default and honours the `PORT` environment variable:

```bash
# bash
PORT=8080 npm run serve:ssr:researchlens

# Windows PowerShell
$env:PORT = '8080'; npm run serve:ssr:researchlens
```

Then open `http://localhost:4000/` (or the port you set). The same server also
answers `/api/core/search/works`, so the production deployment needs this Node
server (or an equivalent proxy for that path) rather than static file hosting
alone. No hosted deployment URL exists for this assessment build.

Build budgets are configured in `angular.json`: the production build warns if
the initial bundle exceeds 500 kB or any component stylesheet exceeds 12 kB
(errors at 1 MB / 14 kB respectively).

## Project structure

```text
researchlens/
├── angular.json                  # Angular build, serve, and test configuration
├── package.json                  # npm scripts and dependencies
├── proxy.conf.cjs                # Dev-server proxy for /api/core/search/works
├── public/
│   └── favicon.ico
└── src/
    ├── index.html                # Browser entry page
    ├── main.ts                   # Browser bootstrap
    ├── main.server.ts            # SSR bootstrap
    ├── server.ts                 # Express SSR server + CORE proxy route
    ├── styles.scss               # Global styles (intentionally minimal)
    └── app/
        ├── app.ts                # Dashboard component (signals, search state)
        ├── app.html              # Dashboard template (search, results, chart)
        ├── app.scss              # Dashboard styles
        ├── app.spec.ts           # Dashboard component tests
        ├── app.config.ts         # Browser application providers (zoneless)
        ├── app.config.server.ts  # Server application providers
        ├── app.routes.ts         # Client routes (single-page dashboard)
        ├── app.routes.server.ts  # Server routes (prerender all)
        └── core/
            ├── core-api.models.ts        # CORE and ResearchPaper types
            ├── research.service.ts       # Typed CORE search + normalisation
            ├── research.service.spec.ts  # Service tests
            ├── publication-years.ts      # Year-distribution aggregation
            └── publication-years.spec.ts # Aggregation tests
```

## Known limitations

- **Single page of results**: the UI offers result limits but no pagination
  controls, even though the service supports an `offset` parameter.
- **Sample-based analytics only**: the year chart reflects the retrieved
  papers (10–100), not CORE's full matching set, and years absent from the
  sample are not shown as zero-count bars.
- **Anonymous CORE access**: without an API key, CORE may rate-limit requests
  (HTTP 429); the app reports this as a search error with retry rather than
  backing off automatically.
- **No result refinement**: there is no in-app sorting, filtering, faceting,
  paper detail view, or saved-search/bookmark persistence.
- **Client-driven search**: searching happens in the browser through
  `/api/core/search/works`, so a deployment must provide that proxy (the
  bundled Express server does); the prerendered first paint shows the idle
  state.
- **Unit tests only**: no e2e suite, and Karma requires a local Chrome or
  Chromium installation.
- **Stylesheet budget warning**: the production build currently reports that
  `src/app/app.scss` exceeds the 12 kB *warning* budget (it remains below the
  14 kB error budget); the build still succeeds.

## Optional enhancements beyond the core requirements

Beyond basic search-and-display, this implementation also includes:

- Full Angular SSR with prerendering and an Express server that doubles as a
  validated CORE proxy, plus a matching dev-server proxy configuration.
- Defensive, typed handling of CORE responses: strict payload validation with
  a dedicated `CoreApiResponseError`, field normalisation, and safe-URL
  filtering for publication/download links.
- Zoneless change detection with Angular signals/computed signals for all
  dashboard and chart state.
- Stale-request cancellation (`switchMap`) so rapid consecutive searches
  cannot race.
- An accessible analytics implementation built with native HTML/CSS (no
  charting dependency): visible year/count labels, a screen-reader chart
  summary, and a captioned data table as a readable equivalent.
- A test suite (22 unit tests) covering the service contract, dashboard
  behaviour, and the analytics aggregation, including error, retry, and
  empty-state paths.
