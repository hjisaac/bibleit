import type {
  AnswerProvider,
  ArtifactStore,
  LexicalIndex,
  QueryEmbedder,
  Ranker,
  RefParser,
  SearchEngine,
  VectorIndex,
} from './core/ports';
import { ArrayVerseStore } from './adapters/array-verse-store';
import type { Chunk, RetrievalResult, VerseStore } from './core/types';

export interface LocalEnginePorts {
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
 * LocalEngine: In-memory SearchEngine orchestrating the fine-grained ports.
 * Runs identically in the browser (with OPFS + Web Workers) and on Node/Server (with HTTP + ONNX).
 */
export function buildLocalEngine(p: LocalEnginePorts): SearchEngine {
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

  void (async () => {
    try {
      const chunks = await baseReady;
      if (chunks.length === 0) return;
      const manifest = await p.store.manifest();
      // INVARIANT: query model must match corpus model (see QueryEmbedder docs).
      if (p.embedder.modelId !== manifest.embeddings.model) {
        throw new Error(
          `Embedder/corpus mismatch: engine has "${p.embedder.modelId}", ` +
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
