/**
 * The seams. Every runtime component implements one of these interfaces and is
 * wired in src/composition.ts — nothing else may import from src/adapters/.
 *
 * Swapping a component for perf = new adapter + one line in the composition root.
 * See design/architecture.md → "Component map & swap paths".
 */
import type {
  Chunk,
  Manifest,
  RefRange,
  RetrievalResult,
  ScoredPassage,
  Verse,
} from './types';

/**
 * COARSE seam — the only contract the UI knows about.
 *
 * Swap granularity works at two levels:
 *  - Swap the WHOLE search stack: implement this interface over HTTP
 *    (RemoteEngine → any backend: FastAPI + Qdrant, pgvector, ...) and flip
 *    one line in the composition root. The UI cannot tell the difference.
 *  - Swap ONE piece (vector index, embedder, ranker...): the LocalEngine is
 *    itself composed of the fine-grained ports below.
 */
export interface SearchEngine {
  /** Resolves when the engine is usable (artifacts loaded / backend reachable). */
  ready: Promise<void>;
  retrieve(query: string, k?: number): Promise<RetrievalResult>;
  answers: AnswerProvider;
}

/**
 * Fetches, caches, and serves the static artifacts (manifest, verses, chunks,
 * embeddings). Must survive cache eviction (iOS Safari) by re-downloading.
 * v1: OPFS + Cache API. Swap: IndexedDB fallback.
 */
export interface ArtifactStore {
  /** Resolve the manifest (network-or-cache); single source of truth for versions. */
  manifest(): Promise<Manifest>;
  verses(): Promise<Verse[]>;
  chunks(): Promise<Chunk[]>;
  /** Raw embedding matrix as stored (quantized); interpretation is VectorIndex's job. */
  embeddings(): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }>;
  /** Drop local copies (settings → "free up space" / recover from corruption). */
  clear(): Promise<void>;
}

/**
 * Detects explicit scripture references in free text ("Jean 3:16", "gen 1:1-3").
 * Pure functions of book-name tables per language; no ML, no async.
 */
export interface RefParser {
  parse(query: string): RefRange[];
}

/**
 * Keyword search over verses. v1: MiniSearch/BM25 built on device.
 * Swap: prebuilt serialized index shipped as an artifact.
 */
export interface LexicalIndex {
  build(verses: Verse[]): Promise<void>;
  search(query: string, k: number): ScoredPassage[];
}

/**
 * Embeds the *query only* (corpus embeddings are precomputed offline).
 * INVARIANT: modelId must equal manifest.embeddings.model — the composition
 * root enforces this and refuses to wire mismatched versions.
 * v1: transformers.js WASM. Swap: WebGPU backend, smaller model, or a remote
 * endpoint (same interface, network call).
 */
export interface QueryEmbedder {
  readonly modelId: string;
  readonly dim: number;
  /** Idempotent; may download the model on first call (report via onProgress). */
  load(onProgress?: (fraction: number) => void): Promise<void>;
  embed(query: string): Promise<Float32Array>;
}

/**
 * Nearest-neighbour search over the corpus embedding matrix.
 * v1: brute-force int8 dot product. Swap: HNSW-wasm, binary + rerank.
 */
export interface VectorIndex {
  build(manifest: Manifest, data: ArrayBuffer, scales?: ArrayBuffer): Promise<void>;
  search(queryVector: Float32Array, k: number): ScoredPassage[];
}

/**
 * Merges the three retrieval signals into the final ranked list.
 * v1: Reciprocal Rank Fusion + overlap dedupe. Swap: learned weights, rerank.
 */
export interface Ranker {
  merge(
    refs: ScoredPassage[],
    lexical: ScoredPassage[],
    semantic: ScoredPassage[],
    k: number,
  ): ScoredPassage[];
}

/**
 * Optional LLM answer over retrieved passages. v1: NullAnswerProvider (the UI
 * shows passages only). Swap: WorkerAnswerProvider (Cloudflare Worker → Claude),
 * DirectAnswerProvider (user-supplied key, direct browser call).
 */
export interface AnswerProvider {
  readonly available: boolean;
  /** Streamed answer chunks; implementations must cite passages by reference. */
  answer(query: string, context: RetrievalResult): AsyncIterable<string>;
}
