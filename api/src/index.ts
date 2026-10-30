
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 7860;
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
    console.log('[Bibleit API] Search engine initialized and ready');
  })
  .catch((err) => {
    console.error('[Bibleit API] Initialization error:', err);
  });

function renderPage(title: string, bodyContent = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      background-color: #000000;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 3.5rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .brand {
      font-family: "Georgia", serif;
      font-size: 2.75rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      color: #fafafa;
      text-decoration: none;
    }
    .brand .it {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 1.75rem;
      font-weight: 800;
      color: #d97706;
      margin-left: 2px;
    }
    .report {
      margin-top: 2.5rem;
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
    }
    .section-title {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 0.5rem;
      text-align: left;
    }
    .item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 0;
      border-bottom: 1px solid #18181b;
    }
    .item:last-of-type {
      border-bottom: none;
    }
    .name {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.8125rem;
      color: #d4d4d8;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.72rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
    }
    .pill.ok {
      background: rgba(16, 185, 129, 0.1);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }
    .pill.init {
      background: rgba(245, 158, 11, 0.1);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .pill.off {
      background: rgba(239, 68, 68, 0.1);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .dot {
      width: 0.35rem;
      height: 0.35rem;
      border-radius: 9999px;
      background: currentColor;
    }
    .description {
      margin-top: 1.25rem;
      font-size: 0.95rem;
      line-height: 1.6;
      color: #a1a1aa;
      max-width: 420px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="brand">bible<span class="it">it</span></div>
  ${bodyContent}
</body>
</html>`;
}

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));

app.get('/', (c) => {
  return c.html(
    renderPage(
      'bibleit',
      `<p class="description">Offline-first Bible search with hybrid retrieval</p>`,
    ),
  );
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

  const operationalPill = '<span class="pill ok"><span class="dot"></span>operational</span>';
  const initPill = '<span class="pill init"><span class="dot"></span>initializing</span>';
  const onPill = '<span class="pill ok"><span class="dot"></span>ON</span>';
  const offPill = '<span class="pill off"><span class="dot"></span>OFF</span>';

  return c.html(
    renderPage(
      'Health · bibleit',
      `<div class="report">
        <div class="section-title">Endpoints</div>
        <div class="item">
          <span class="name">GET /</span>
          ${operationalPill}
        </div>
        <div class="item">
          <span class="name">GET /health</span>
          ${operationalPill}
        </div>
        <div class="item">
          <span class="name">GET /api/v1/search</span>
          ${isReady ? operationalPill : initPill}
        </div>

        <div class="section-title" style="margin-top: 1.5rem;">Subsystems</div>
        <div class="item">
          <span class="name">Lexical Index</span>
          ${isReady ? onPill : offPill}
        </div>
        <div class="item">
          <span class="name">Vector Index</span>
          ${isReady ? onPill : offPill}
        </div>
        <div class="item">
          <span class="name">Neural Embedder</span>
          ${isReady ? onPill : offPill}
        </div>
      </div>`,
    ),
    isReady ? 200 : 503,
  );
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
    return c.json({ error: 'Search failed' }, 500);
  }
});

console.log(`[Bibleit API] Server starting on http://0.0.0.0:${port}`);
serve({ fetch: app.fetch, port });
