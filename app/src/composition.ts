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

// v1 adapters (each is one file in src/adapters/ — see design/architecture.md
// for the swap path of every port):
// import { OpfsArtifactStore } from './adapters/opfs-artifact-store';
// import { RegexRefParser } from './adapters/regex-ref-parser';
// import { MiniSearchLexicalIndex } from './adapters/minisearch-lexical-index';
// import { TransformersQueryEmbedder } from './adapters/transformers-query-embedder';
// import { BruteForceVectorIndex } from './adapters/bruteforce-vector-index';
// import { RrfRanker } from './adapters/rrf-ranker';
// import { NullAnswerProvider } from './adapters/null-answer-provider';

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

  const ready = (async () => {
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

      try {
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
        if (err instanceof Error && err.message.startsWith('Embedder/corpus mismatch:')) {
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Embedder/corpus mismatch:')) {
        throw err;
      }
    }
  })();

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

/**
 * v1 wiring. Uncomment adapter imports as they are implemented.
 * Later, swapping to a server backend is exactly:
 *   return new RemoteEngine('https://api.bibleit.example/search');
 */
import { MockSearchEngine } from './adapters/mock-search-engine';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';

export function createDefaultEngine(): SearchEngine {
  // Use mock engine until offline artifacts and adapters are completed.
  return new MockSearchEngine();
}

export function createDefaultNarrator(): AudioNarrator {
  return new WebSpeechNarrator();
}

