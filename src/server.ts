import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const CORE_SEARCH_URL = 'https://api.core.ac.uk/v3/search/works';

app.get('/api/core/search/works', async (req, res) => {
  const query = req.query['q'];
  const limit = req.query['limit'] ?? '10';
  const offset = req.query['offset'] ?? '0';

  if (
    typeof query !== 'string' ||
    !query.trim() ||
    typeof limit !== 'string' ||
    !/^\d+$/.test(limit) ||
    typeof offset !== 'string' ||
    !/^\d+$/.test(offset)
  ) {
    res.status(400).json({ error: 'Invalid CORE search query or pagination parameters.' });
    return;
  }

  const url = new URL(CORE_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', limit);
  url.searchParams.set('offset', offset);

  const upstream = await fetch(url);
  const body = await upstream.text();
  const contentType = upstream.headers.get('content-type');

  res.status(upstream.status);
  if (contentType) {
    res.setHeader('content-type', contentType);
  }
  res.send(body);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
