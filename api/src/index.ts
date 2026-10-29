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
  type SearchEngine,
} from '@bibleit/engine';
import { HttpArtifactStore } from './adapters/http-artifact-store';
import { NodeQueryEmbedder } from './adapters/node-query-embedder';

const port = Number(process.env.PORT) || 7860;
const artifactBaseUrl =
  process.env.ARTIFACT_BASE_URL || 'https://pub-071cdcf1b2b34b1e9e77c65fbf233114.r2.dev/web';

const store = new HttpArtifactStore(artifactBaseUrl);
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
    console.log('[Bibleit API] Search engine initialized and ready');
  })
  .catch((err) => {
    console.error('[Bibleit API] Initialization error:', err);
  });

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    ready: isReady,
    port,
    artifactBaseUrl,
  });
});

app.get('/api/v1/search', async (c) => {
  const q = c.req.query('q')?.trim() || '';
  const k = Math.min(Number(c.req.query('k')) || 10, 50);

  if (!q) {
    return c.json({ passages: [], parsedRefs: [] });
  }

  try {
    const result = await engine.retrieve(q, k);
    return c.json(result);
  } catch (err) {
    console.error('[Search Error]:', err);
    return c.json({ error: 'Search failed', message: String(err) }, 500);
  }
});

console.log(`[Bibleit API] Server starting on http://0.0.0.0:${port}`);
serve({ fetch: app.fetch, port });
