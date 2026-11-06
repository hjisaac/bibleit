
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
  SearchOriginEnum,
  API_ROUTES,
  TELEMETRY_HEADERS,
  type ArtifactStore,
  type SearchEngine,
  type HealthCheckable,
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
  MAX_QUERY_LENGTH,
  MAX_PASSAGES,
  MAX_PASSAGE_TEXT_LENGTH,
} from './constants';
import { rateLimiter } from 'hono-rate-limiter';
import type { Context } from 'hono';
import { logger, initSentry, captureCrash } from './logger';
import { renderHomeHtml, renderHealthHtml } from './views';

initSentry();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load .env for local development
if (typeof process.loadEnvFile === 'function') {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // Fallback silently if unreadable
      }
    }
  }
}

const port = Number(process.env.PORT) || DEFAULT_PORT;
const artifactBaseUrl = process.env.ARTIFACT_BASE_URL;
const candidateDirs = [
  process.env.DATA_DIR,
  path.resolve(__dirname, '../../app/public/data'),
  path.resolve(__dirname, '../../../app/public/data'),
  path.resolve(process.cwd(), 'data'),
  path.resolve(process.cwd(), '../app/public/data'),
  path.resolve(process.cwd(), 'app/public/data'),
].filter(Boolean) as string[];

const dataDir = candidateDirs.find((dir) => fs.existsSync(dir)) || candidateDirs[0]!;

const store: ArtifactStore = artifactBaseUrl
  ? new HttpArtifactStore(artifactBaseUrl)
  : new FsArtifactStore(dataDir);
const embedder = new NodeQueryEmbedder();
const answerProvider = new AiAnswerProvider();

const eagerSemantic = process.env.EAGER_SEMANTIC === 'true';
const engine: SearchEngine & HealthCheckable = new LocalEngine(
  {
    artifactStore: store,
    refParser: new RegexRefParser(),
    lexicalIndex: new MiniSearchLexicalIndex(),
    queryEmbedder: embedder,
    vectorIndex: new BruteForceVectorIndex(),
    ranker: new RrfRanker(),
    answerProvider,
  },
  { eagerSemantic },
);

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

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    exposeHeaders: Object.values(TELEMETRY_HEADERS),
  }),
);

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

app.get(API_ROUTES.HEALTH, (c) => {
  const providers = answerProvider.getProviderStatuses();
  const health = 'getHealth' in engine ? (engine as HealthCheckable).getHealth() : null;
  const jsonPayload = {
    status: isReady ? 'ok' : 'initializing',
    ready: isReady,
    subsystems: health?.subsystems ?? {},
    providers,
  };

  const wantsJson =
    c.req.query('format') === 'json' ||
    (c.req.header('accept')?.includes('application/json') &&
      !c.req.header('accept')?.includes('text/html'));

  const status = isReady ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;

  if (wantsJson) {
    return c.json(jsonPayload, status);
  }

  return c.html(renderHealthHtml(isReady, providers, health), status);
});

const routes = app
  .get(API_ROUTES.SEARCH, searchLimiter, async (c) => {
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
      captureCrash(err, { endpoint: API_ROUTES.SEARCH, q, k });
      return c.json({ error: 'Search failed' }, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  })
  .post(API_ROUTES.GENERATE, generateLimiter, async (c) => {
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
    if (query.length > MAX_QUERY_LENGTH) {
      return c.json(
        { error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters` },
        StatusCodes.BAD_REQUEST,
      );
    }

    try {
      let passages: any[];
      if (Array.isArray(body.passages) && body.passages.length > 0) {
        passages = body.passages
          .slice(0, MAX_PASSAGES)
          .filter(
            (p) =>
              typeof p?.chunk?.text === 'string' &&
              (typeof p?.chunk?.book === 'string' || typeof p?.chunk?.id === 'string'),
          )
          .map((p) => ({
            ...p,
            chunk: {
              ...p.chunk,
              text: p.chunk.text.slice(0, MAX_PASSAGE_TEXT_LENGTH),
            },
          }));
      } else {
        const searchResult = await engine.retrieve(query, MAX_PASSAGES);
        passages = searchResult.passages;
      }

      if (passages.length === 0) {
        return c.json(
          { error: 'No scripture passages available to answer question' },
          StatusCodes.BAD_REQUEST,
        );
      }

      return await answerProvider.streamResponse(query, passages, c.req.raw.signal);
    } catch (err) {
      captureCrash(err, { endpoint: API_ROUTES.GENERATE, query });
      return c.json({ error: 'Failed to generate answer' }, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

export type AppType = typeof routes;

process.on('uncaughtException', (err) => {
  captureCrash(err, { origin: 'uncaughtException' });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  captureCrash(reason, { origin: 'unhandledRejection' });
});

logger.info({ port }, 'Server starting');
serve({ fetch: app.fetch, port });
