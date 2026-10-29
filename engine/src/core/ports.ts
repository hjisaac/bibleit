/**
 * The seams. Every runtime component implements one of these interfaces.
 * Swapping a component for perf = new adapter + one line in composition.
 */
import type {
  Chunk,
  Manifest,
  NarrationSegment,
  NarrationState,
  RawChunk,
  RefRange,
  RetrievalResult,
  ScoredPassage,
  VerseCorpusData,
} from './types';

export interface SearchEngine {
  /** Resolves when the engine is usable (artifacts loaded / backend reachable). */
  ready: Promise<void>;
  retrieve(query: string, k?: number): Promise<RetrievalResult>;
  answers: AnswerProvider;
}

export interface ArtifactStore {
  manifest(): Promise<Manifest>;
  verses(onProgress?: (progressPercent: number) => void): Promise<VerseCorpusData>;
  chunks(onProgress?: (progressPercent: number) => void): Promise<RawChunk[]>;
  embeddings(onProgress?: (progressPercent: number) => void): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }>;
  hasVerses?(): Promise<boolean>;
  hasEmbeddings?(): Promise<boolean>;
  clear(): Promise<void>;
}

export interface RefParser {
  parse(query: string): RefRange[];
}

export interface LexicalIndex {
  build(chunks: Chunk[]): Promise<void>;
  search(query: string, k: number): ScoredPassage[];
}

export interface QueryEmbedder {
  readonly modelId: string;
  readonly dim: number;
  load(onProgress?: (fraction: number) => void): Promise<void>;
  embed(query: string): Promise<Float32Array>;
}

export interface VectorIndex {
  build(manifest: Manifest, chunks: Chunk[], data: ArrayBuffer, scales?: ArrayBuffer): Promise<void>;
  search(queryVector: Float32Array, k: number): ScoredPassage[];
}

export interface Ranker {
  merge(
    refs: ScoredPassage[],
    lexical: ScoredPassage[],
    semantic: ScoredPassage[],
    k: number,
  ): ScoredPassage[];
}

export interface AnswerProvider {
  readonly available: boolean;
  answer(query: string, context: RetrievalResult): AsyncIterable<string>;
}

export interface AudioNarrator {
  readonly supported: boolean;
  getState(): NarrationState;
  subscribe(listener: (state: NarrationState) => void): () => void;
  play(segments: NarrationSegment[], startIndex?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  next(): void;
  prev(): void;
  seekToIndex(index: number): void;
  setRate(rate: number): void;
}
