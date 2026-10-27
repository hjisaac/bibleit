/**
 * Domain types shared by all ports. Mirrors the artifact contract in
 * design/architecture.md — keep in sync with ingest/bibleit_ingest/artifacts.py.
 */

/** Verse-precise location, e.g. John 3:16 → { book: "JHN", chapter: 3, verse: 16 } */
export interface VerseRef {
  /** USFM/OSIS-style book id, stable across translations and languages. */
  book: string;
  chapter: number;
  verse: number;
}

export interface Verse extends VerseRef {
  text: string;
}

/** Canonical string key for a chunk: "BOOK:start_ch:start_v-end_ch:end_v" */
export function getChunkKey(chunk: Pick<RawChunk, 'book' | 'start' | 'end'>): string {
  return `${chunk.book}:${chunk.start[0]}:${chunk.start[1]}-${chunk.end[0]}:${chunk.end[1]}`;
}

/** Retrieval unit: a passage window over consecutive verses. */
export interface RawChunk {
  id?: string | number;
  book: string;
  start: [number, number];
  end: [number, number];
  headings?: [number, number, string][];
}

export interface Chunk extends RawChunk {
  /** Concatenated verse text hydrated from VerseStore at search seam. */
  text: string;
}

export type VerseCorpusData = Record<string, string[][]>;

export interface VerseStore {
  get(book: string, chapter: number, verse: number): string | undefined;
  getRange(book: string, start: [number, number], end: [number, number]): string;
  has(book: string, chapter: number, verse: number): boolean;
  chapterCount(book: string): number;
  verseCount(book: string, chapter: number): number;
}

/** A range of verses the user explicitly referenced, e.g. "John 3:14-18". */
export interface RefRange {
  start: VerseRef;
  /** Inclusive; equals start for a single verse; verse omitted = whole chapter. */
  end?: VerseRef;
}

export type RetrievalSource = 'reference' | 'lexical' | 'semantic';

export interface ScoredPassage {
  chunk: Chunk;
  /** Higher is better. Comparable only within one source before ranking. */
  score: number;
  source: RetrievalSource;
}

/** Final, merged result the UI renders. */
export interface RetrievalResult {
  passages: ScoredPassage[];
  /** References parsed out of the query, if any (always shown first). */
  parsedRefs: RefRange[];
}

// ---------------------------------------------------------------------------
// Artifact manifest (schema_version 3) — the offline/runtime boundary.
// ---------------------------------------------------------------------------

export interface Manifest {
  schema_version: 3;
  translation: {
    id: string;
    lang: string;
    name: string;
    license: string;
  };
  corpus: { verses: string; count: number; sha256?: string };
  /** Chunk-stage lock parameters (strategy, ceiling, overlap, ...) plus the run hash. */
  chunks: { file: string; hash: string; strategy: string; sha256?: string; [param: string]: unknown };
  embeddings: {
    file: string;
    model: string;
    dim: number;
    /** Must be prepended to the query before embedding (e.g. "search_query: "). */
    query_prefix: string;
    quantization: { type: 'int8'; scales: string } | { type: 'float32' };
    count: number;
    sha256?: string;
  };
}

// ---------------------------------------------------------------------------
// Audio narration types — shared across Web Speech (Tier 1) and CDN (Tier 2).
// ---------------------------------------------------------------------------

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface NarrationSegment {
  /** Stable identifier, e.g. "JHN:3:16" for chapter verses or "chunk-42" for search passages. */
  id: string;
  /** Human-readable reference shown in the mini-player, e.g. "John 3:16". */
  citation: string;
  text: string;
  book: string;
  chapter: number;
  verse?: number;
}

export interface NarrationWordBoundary {
  charIndex: number;
  charLength: number;
}

export interface NarrationState {
  status: PlaybackStatus;
  queue: readonly NarrationSegment[];
  currentIndex: number;
  activeSegment: NarrationSegment | null;
  wordBoundary: NarrationWordBoundary | null;
  rate: number;
}

