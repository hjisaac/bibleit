/**
 * Composition root — the ONLY file that imports concrete adapters.
 * Swapping a component happens here and nowhere else.
 */
import type {
  AnswerProvider,
  ArtifactStore,
  AudioNarrator,
  LexicalIndex,
  QueryEmbedder,
  Ranker,
  RefParser,
  SearchEngine,
  VectorIndex,
} from './core/ports';
import { ArrayVerseStore } from './adapters/array-verse-store';
import type { Chunk, RetrievalResult, VerseStore } from './core/types';

import { OpfsArtifactStore } from './adapters/opfs-artifact-store';
import { RegexRefParser } from './adapters/regex-ref-parser';
import { MiniSearchLexicalIndex } from './adapters/minisearch-lexical-index';
import { WorkerQueryEmbedder } from './adapters/worker-query-embedder';
import { BruteForceVectorIndex } from './adapters/bruteforce-vector-index';
import { RrfRanker } from './adapters/rrf-ranker';
import { NullAnswerProvider } from './adapters/null-answer-provider';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';

interface Ports {
  store: ArtifactStore;
  refParser: RefParser;
  lexical: LexicalIndex;
  embedder: QueryEmbedder;
  vectors: VectorIndex;
  ranker: Ranker;
  answers: AnswerProvider;
  verseStore?: VerseStore;
}

/**
 * LocalEngine: the fully in-browser SearchEngine, composed from the fine ports.
 * A future RemoteEngine implements SearchEngine directly over HTTP instead —
 * same interface, so the UI never changes.
 */
export function buildLocalEngine(p: Ports): SearchEngine {
  let verseStore: VerseStore | null = p.verseStore ?? null;
  let lexicalReady = false;
  let semanticReady = false;

  const baseReady = (async () => {
    try {
      const [versesData, rawChunks] = await Promise.all([
        p.store.verses(),
        p.store.chunks(),
      ]);
      verseStore = verseStore ?? new ArrayVerseStore(versesData);

      const chunks: Chunk[] = rawChunks.map((c) => ({
        ...c,
        text: verseStore!.getRange(c.book, c.start, c.end),
      }));
      await p.lexical.build(chunks);
      lexicalReady = true;
      return chunks;
    } catch (err) {
      console.warn('[Base Index Init Error]:', err);
      return [];
    }
  })();

  const semanticReadyPromise = (async () => {
    try {
      const chunks = await baseReady;
      if (chunks.length === 0) return;
      const manifest = await p.store.manifest();
      // INVARIANT: query model must match corpus model (see QueryEmbedder docs).
      if (p.embedder.modelId !== manifest.embeddings.model) {
        throw new Error(
          `Embedder/corpus mismatch: app has "${p.embedder.modelId}", ` +
            `artifacts were built with "${manifest.embeddings.model}". ` +
            `Update the app or re-run ingest.`,
        );
      }
      const [emb] = await Promise.all([
        p.store.embeddings(),
        p.embedder.load(),
      ]);
      await p.vectors.build(manifest, chunks, emb.data, emb.scales);
      semanticReady = true;
    } catch (err) {
      console.warn('[Semantic Index Init Error]:', err);
      if (err instanceof Error && err.message.startsWith('Embedder/corpus mismatch:')) {
        throw err;
      }
    }
  })();

  const ready = baseReady.then(() => {});

  return {
    ready,
    answers: p.answers,
    async retrieve(query, k = 10): Promise<RetrievalResult> {
      await ready;
      const parsedRefs = p.refParser.parse(query);
      const refPassages = verseStore
        ? parsedRefs.flatMap((r) => {
            const start: [number, number] = [r.start.chapter, r.start.verse];
            const end: [number, number] = r.end
              ? [r.end.chapter, r.end.verse]
              : [r.start.chapter, verseStore!.verseCount(r.start.book, r.start.chapter)];
            const text = verseStore!.getRange(r.start.book, start, end);
            return text
              ? [{ chunk: { book: r.start.book, start, end, text }, score: 1, source: 'reference' as const }]
              : [];
          })
        : [];
      const lexical = lexicalReady ? p.lexical.search(query, k) : [];
      const semantic = semanticReady
        ? p.vectors.search(await p.embedder.embed(query), k)
        : [];
      return {
        parsedRefs,
        passages: p.ranker.merge(refPassages, lexical, semantic, k),
      };
    },
  };
}

export function createDefaultArtifactStore(): ArtifactStore {
  return new OpfsArtifactStore();
}

let defaultEmbedder: WorkerQueryEmbedder | null = null;
export function createDefaultEmbedder(): WorkerQueryEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = new WorkerQueryEmbedder();
  }
  return defaultEmbedder;
}

export function createDefaultEngine(
  store: ArtifactStore = createDefaultArtifactStore(),
  embedder: QueryEmbedder = createDefaultEmbedder(),
): SearchEngine {
  return buildLocalEngine({
    store,
    refParser: new RegexRefParser(),
    lexical: new MiniSearchLexicalIndex(),
    embedder,
    vectors: new BruteForceVectorIndex(),
    ranker: new RrfRanker(),
    answers: new NullAnswerProvider(),
  });
}

export function createDefaultNarrator(): AudioNarrator {
  return new WebSpeechNarrator();
}
