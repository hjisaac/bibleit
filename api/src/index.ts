
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  LocalEngine,
  RegexRefParser,
  MiniSearchLexicalIndex,
  BruteForceVectorIndex,
  RrfRanker,
  NullAnswerProvider,
  SearchOriginEnum,
  type ArtifactStore,
  type SearchEngine,
} from '@bibleit/engine';
import { fileURLToPath } from 'node:url';
import { FsArtifactStore } from './adapters/fs-artifact-store';
import { HttpArtifactStore } from './adapters/http-artifact-store';
import { NodeQueryEmbedder } from './adapters/node-query-embedder';
import { AiAnswerProvider } from './adapters/ai-answer-provider';
import { StatusCodes } from 'http-status-codes';
import {
  DEFAULT_PORT,
  DEFAULT_SEARCH_RATE_LIMIT,
  DEFAULT_GENERATE_RATE_LIMIT,
  RATE_LIMIT_WINDOW_MS,
} from './constants';
import { rateLimiter } from 'hono-rate-limiter';
import type { Context } from 'hono';
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
const answerProvider = new AiAnswerProvider();

const engine: SearchEngine = new LocalEngine({
  store,
  refParser: new RegexRefParser(),
  lexical: new MiniSearchLexicalIndex(),
  embedder,
  vectors: new BruteForceVectorIndex(),
  ranker: new RrfRanker(),
  answers: answerProvider,
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

const getClientIp = (c: Context): string => {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
};

const searchRateLimit = Number(process.env.RATE_LIMIT_SEARCH) || DEFAULT_SEARCH_RATE_LIMIT;
const generateRateLimit =
  Number(process.env.RATE_LIMIT_GENERATE ?? process.env.RATE_LIMIT_ANSWER) || DEFAULT_GENERATE_RATE_LIMIT;

const searchLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: searchRateLimit,
  keyGenerator: getClientIp,
  message: { error: 'Too many search requests, please try again shortly.' },
});

const generateLimiter = rateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: generateRateLimit,
  keyGenerator: getClientIp,
  message: { error: 'Too many generate requests, please try again shortly.' },
});

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));

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
  return c.json({ error: 'Internal server error' }, StatusCodes.INTERNAL_SERVER_ERROR);
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

  const status = isReady ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;

  if (wantsJson) {
    return c.json(jsonPayload, status);
  }

  return c.html(renderHealthHtml(isReady), status);
});

app.get('/api/v1/search', searchLimiter, async (c) => {
  const q = c.req.query('q')?.trim() || '';
  const k = Math.min(Number(c.req.query('k')) || 10, 50);

  if (!q) {
    return c.json({ passages: [], parsedRefs: [], origin: SearchOriginEnum.REMOTE });
  }

  try {
    const result = await engine.retrieve(q, k);
    logger.debug({ q, k, hits: result.passages.length }, 'Search executed');
    return c.json({ ...result, origin: SearchOriginEnum.REMOTE });
  } catch (err) {
    captureCrash(err, { endpoint: '/api/v1/search', q, k });
    return c.json({ error: 'Search failed' }, StatusCodes.INTERNAL_SERVER_ERROR);
  }
});

app.post('/api/v1/generate', generateLimiter, async (c) => {
  let body: { query?: string; passages?: any[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON request body' }, StatusCodes.BAD_REQUEST);
  }

  const query = body.query?.trim();
  if (!query) {
    return c.json({ error: 'Missing "query" parameter' }, StatusCodes.BAD_REQUEST);
  }

  try {
    let passages = body.passages;
    if (!Array.isArray(passages) || passages.length === 0) {
      const searchResult = await engine.retrieve(query, 5);
      passages = searchResult.passages;
    }

    return await answerProvider.streamResponse(query, passages, c.req.raw.signal);
  } catch (err) {
    captureCrash(err, { endpoint: '/api/v1/generate', query });
    return c.json({ error: 'Failed to generate answer' }, StatusCodes.INTERNAL_SERVER_ERROR);
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
