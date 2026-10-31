
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  buildLocalEngine,
  RegexRefParser,
  MiniSearchLexicalIndex,
  BruteForceVectorIndex,
  RrfRanker,
  NullAnswerProvider,
  type ArtifactStore,
  type SearchEngine,
} from '@bibleit/engine';
import { fileURLToPath } from 'node:url';
import { FsArtifactStore } from './adapters/fs-artifact-store';
import { HttpArtifactStore } from './adapters/http-artifact-store';
import { NodeQueryEmbedder } from './adapters/node-query-embedder';
import { DEFAULT_PORT } from './constants';
import { logger, initSentry, captureCrash } from './logger';
import { renderHomeHtml, renderHealthHtml } from './views';

initSentry();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || DEFAULT_PORT;
const artifactBaseUrl = process.env.ARTIFACT_BASE_URL;
const defaultDataDir = path.resolve(__dirname, '../../app/public/data');
const fallbackDataDir = path.resolve(process.cwd(), 'data');
const dataDir = process.env.DATA_DIR || (fs.existsSync(defaultDataDir) ? defaultDataDir : fallbackDataDir);

const store: ArtifactStore = artifactBaseUrl
  ? new HttpArtifactStore(artifactBaseUrl)
  : new FsArtifactStore(dataDir);
const embedder = new NodeQueryEmbedder();

const engine: SearchEngine = buildLocalEngine({
  store,
  refParser: new RegexRefParser(),
  lexical: new MiniSearchLexicalIndex(),
  embedder,
  vectors: new BruteForceVectorIndex(),
  ranker: new RrfRanker(),
  answers: new NullAnswerProvider(),
});

let isReady = false;
engine.ready
  .then(() => {
    isReady = true;
    logger.info('Search engine initialized and ready');
  })
  .catch((err) => {
    captureCrash(err, { subsystem: 'engine.ready' });
  });

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));

app.use('*', async (c, next) => {
  const start = performance.now();
  await next();
  const elapsedMs = Math.round(performance.now() - start);
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      elapsedMs,
    },
    'HTTP request',
  );
});

app.onError((err, c) => {
  captureCrash(err, { method: c.req.method, path: c.req.path });
  return c.json({ error: 'Internal server error' }, 500);
});

app.get('/', (c) => {
  return c.html(renderHomeHtml());
});

app.get('/health', (c) => {
  const jsonPayload = {
    status: isReady ? 'ok' : 'initializing',
    ready: isReady,
  };

  const wantsJson =
    c.req.query('format') === 'json' ||
    (c.req.header('accept')?.includes('application/json') &&
      !c.req.header('accept')?.includes('text/html'));

  if (wantsJson) {
    return c.json(jsonPayload, isReady ? 200 : 503);
  }

  return c.html(renderHealthHtml(isReady), isReady ? 200 : 503);
});

app.get('/api/v1/search', async (c) => {
  const q = c.req.query('q')?.trim() || '';
  const k = Math.min(Number(c.req.query('k')) || 10, 50);

  if (!q) {
    return c.json({ passages: [], parsedRefs: [] });
  }

  try {
    const result = await engine.retrieve(q, k);
    logger.debug({ q, k, hits: result.passages.length }, 'Search executed');
    return c.json(result);
  } catch (err) {
    captureCrash(err, { endpoint: '/api/v1/search', q, k });
    return c.json({ error: 'Search failed' }, 500);
  }
});

process.on('uncaughtException', (err) => {
  captureCrash(err, { origin: 'uncaughtException' });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  captureCrash(reason, { origin: 'unhandledRejection' });
});

logger.info({ port }, 'Server starting');
serve({ fetch: app.fetch, port });
