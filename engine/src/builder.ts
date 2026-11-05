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
import { SearchOriginEnum, type Chunk, type RetrievalResult, type ScoredPassage, type VerseStore } from './core/types';

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
 * LocalEngine: In-memory SearchEngine orchestrating fine-grained local ports.
 * Runs identically in the browser (OPFS + Web Workers) and on Node/Server (HTTP + ONNX).
 */
export class LocalEngine implements SearchEngine {
  public ready: Promise<void>;
  public answers: AnswerProvider;

  private ports: LocalEnginePorts;
  private verseStore: VerseStore | null;
  private lexicalReady = false;
  private semanticReady = false;
  private currentSync: Promise<void> | null = null;

  get isLexicalReady(): boolean {
    return this.lexicalReady;
  }

  get isSemanticReady(): boolean {
    return this.semanticReady;
  }

  constructor(ports: LocalEnginePorts) {
    this.ports = ports;
    this.answers = ports.answers;
    this.verseStore = ports.verseStore ?? null;

    const baseReady = this.loadBase().catch((err) => {
      console.warn('[Base Index Init Error]:', err);
      return [];
    });

    void (async () => {
      try {
        const chunks = await baseReady;
        await this.loadSemantic(chunks);
      } catch (err) {
        console.warn('[Semantic Index Init Error]:', err);
        if (err instanceof Error && err.message.startsWith('Embedder/corpus mismatch:')) {
          throw err;
        }
      }
    })();

    this.ready = baseReady.then(() => {});
  }

  /**
   * Initializes verse corpus data and populates the in-memory lexical index.
   * Returns an empty list when scripture data is uninstalled or storage is blocked.
   */
  private async loadBase(): Promise<Chunk[]> {
    if (this.ports.store.hasVerses && !(await this.ports.store.hasVerses())) {
      this.verseStore = this.ports.verseStore ?? null;
      this.lexicalReady = false;
      return [];
    }
    const [versesData, rawChunks] = await Promise.all([
      this.ports.store.verses(),
      this.ports.store.chunks(),
    ]);
    this.verseStore = this.verseStore ?? new ArrayVerseStore(versesData);

    const chunks: Chunk[] = rawChunks.map((c) => ({
      ...c,
      text: this.verseStore!.getRange(c.book, c.start, c.end),
    }));
    await this.ports.lexical.build(chunks);
    this.lexicalReady = true;
    return chunks;
  }

  /**
   * Prepares vector embeddings and activates the semantic search index.
   * Skips index initialization if precomputed vectors or the query model are missing.
   */
  private async loadSemantic(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) {
      this.semanticReady = false;
      return;
    }
    if (this.ports.store.hasEmbeddings && !(await this.ports.store.hasEmbeddings())) {
      this.semanticReady = false;
      return;
    }
    if (this.ports.embedder.hasModel && !(await this.ports.embedder.hasModel())) {
      this.semanticReady = false;
      return;
    }
    const manifest = await this.ports.store.manifest();
    // INVARIANT: query model must match corpus model (see QueryEmbedder docs).
    if (this.ports.embedder.modelId !== manifest.embeddings.model) {
      throw new Error(
        `Embedder/corpus mismatch: engine has "${this.ports.embedder.modelId}", ` +
          `artifacts were built with "${manifest.embeddings.model}". ` +
          `Update the app or re-run ingest.`,
      );
    }
    const [emb] = await Promise.all([
      this.ports.store.embeddings(),
      this.ports.embedder.load(),
    ]);
    await this.ports.vectors.build(manifest, chunks, emb.data, emb.scales);
    this.semanticReady = true;
  }

  public async sync(): Promise<void> {
    const syncOp = (async () => {
      try {
        const chunks = await this.loadBase();
        await this.loadSemantic(chunks);
      } catch (err) {
        console.warn('[Local Engine Sync Error]:', err);
      }
    })();
    this.currentSync = syncOp;
    try {
      await syncOp;
    } finally {
      if (this.currentSync === syncOp) {
        this.currentSync = null;
      }
    }
  }

  public async retrieve(query: string, k = 10): Promise<RetrievalResult> {
    await this.ready;
    if (this.currentSync) {
      await this.currentSync;
    }
    const parsedRefs = this.ports.refParser.parse(query);
    const refPassages = this.verseStore
      ? parsedRefs.flatMap((r) => {
          const start: [number, number] = [r.start.chapter, r.start.verse];
          const end: [number, number] = r.end
            ? [r.end.chapter, r.end.verse]
            : [r.start.chapter, this.verseStore!.verseCount(r.start.book, r.start.chapter)];
          const text = this.verseStore!.getRange(r.start.book, start, end);
          return text
            ? [{ chunk: { book: r.start.book, start, end, text }, score: 1, source: 'reference' as const }]
            : [];
        })
      : [];
    const lexical = this.lexicalReady ? this.ports.lexical.search(query, k) : [];
    let semantic: ScoredPassage[] = [];
    if (this.semanticReady) {
      try {
        const vectorPromise = this.ports.embedder.embed(query);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Embedding timed out')), 5000),
        );
        const vector = await Promise.race([vectorPromise, timeoutPromise]);
        semantic = this.ports.vectors.search(vector, k);
      } catch (err) {
        console.warn('[Semantic Search Error, degrading to lexical/ref]:', err);
      }
    }
    return {
      parsedRefs,
      passages: this.ports.ranker.merge(refPassages, lexical, semantic, k),
      origin: SearchOriginEnum.LOCAL,
    };
  }
}
