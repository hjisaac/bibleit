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

/** Retrieval unit: a passage window over consecutive verses. */
export interface Chunk {
  id: number;
  start: VerseRef;
  end: VerseRef;
  /** Concatenated verse text (for display / BM25 the app uses verses directly). */
  text: string;
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
// Artifact manifest (schema_version 1) — the offline/runtime boundary.
// ---------------------------------------------------------------------------

export interface Manifest {
  schema_version: 1;
  translation: {
    id: string;
    lang: string;
    name: string;
    license: string;
  };
  corpus: { verses: string; count: number };
  chunks: { file: string; strategy: string; window: number; overlap: number };
  embeddings: {
    file: string;
    model: string;
    dim: number;
    quantization: { type: 'int8'; scales: string } | { type: 'float32' };
    count: number;
  };
}
