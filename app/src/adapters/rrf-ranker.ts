import type { Ranker } from '../core/ports';
import type { Chunk, ScoredPassage } from '../core/types';

export interface RrfOptions {
  /** RRF smoothing constant (default: 60 per standard Cormack et al.). */
  kConst?: number;
}

/**
 * Checks whether two passage chunks overlap in Scripture.
 */
function chunksOverlap(a: Chunk, b: Chunk): boolean {
  if (a.start.book !== b.start.book) return false;
  // If same chapter, check verse ranges
  if (a.start.chapter === b.start.chapter && a.end.chapter === b.end.chapter) {
    return !(a.end.verse < b.start.verse || b.end.verse < a.start.verse);
  }
  // Across chapters in the same book
  return !(a.end.chapter < b.start.chapter || b.end.chapter < a.start.chapter);
}

/**
 * Merges reference, lexical, and semantic retrieval results using Reciprocal Rank Fusion.
 *
 * Rules:
 *  1. Exact scripture reference matches are always placed first.
 *  2. Lexical and semantic results are fused via RRF: sum(1 / (k + rank)).
 *  3. Overlapping passage chunks are deduplicated (retaining the higher ranked passage).
 */
export class RrfRanker implements Ranker {
  private kConst: number;

  constructor(options?: RrfOptions) {
    this.kConst = options?.kConst ?? 60;
  }

  merge(
    refs: ScoredPassage[],
    lexical: ScoredPassage[],
    semantic: ScoredPassage[],
    k: number = 10,
  ): ScoredPassage[] {
    const fusedScores = new Map<number, { chunk: Chunk; score: number }>();

    // 1. Accumulate RRF scores for lexical matches
    lexical.forEach((item, index) => {
      const rank = index + 1;
      const rrf = 1 / (this.kConst + rank);
      const existing = fusedScores.get(item.chunk.id);
      if (existing) {
        existing.score += rrf;
      } else {
        fusedScores.set(item.chunk.id, { chunk: item.chunk, score: rrf });
      }
    });

    // 2. Accumulate RRF scores for semantic matches
    semantic.forEach((item, index) => {
      const rank = index + 1;
      const rrf = 1 / (this.kConst + rank);
      const existing = fusedScores.get(item.chunk.id);
      if (existing) {
        existing.score += rrf;
      } else {
        fusedScores.set(item.chunk.id, { chunk: item.chunk, score: rrf });
      }
    });

    // 3. Sort fused items by accumulated score descending
    const sortedFused: ScoredPassage[] = Array.from(fusedScores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ chunk, score }) => ({
        chunk,
        score,
        source: 'lexical', // fused candidate
      }));

    // 4. Combine: references always first, followed by fused results
    const combined: ScoredPassage[] = [...refs, ...sortedFused];

    // 5. Deduplicate overlapping chunks, preserving higher-ranked passage
    const deduped: ScoredPassage[] = [];
    for (const item of combined) {
      const overlaps = deduped.some((existing) => chunksOverlap(existing.chunk, item.chunk));
      if (!overlaps) {
        deduped.push(item);
        if (deduped.length >= k) break;
      }
    }

    return deduped;
  }
}
