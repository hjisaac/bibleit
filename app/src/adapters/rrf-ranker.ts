import type { Ranker } from '../core/ports';
import { getChunkKey, type Chunk, type ScoredPassage } from '../core/types';

export interface RrfOptions {
  /** RRF smoothing constant (default: 60 per standard Cormack et al.). */
  kConst?: number;
}

function compareCoord(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * Checks whether two passage chunks overlap in Scripture.
 * Two intervals [start_a, end_a] and [start_b, end_b] overlap iff start_a <= end_b and start_b <= end_a.
 */
function chunksOverlap(a: Chunk, b: Chunk): boolean {
  if (a.book !== b.book) return false;
  return compareCoord(a.start, b.end) <= 0 && compareCoord(b.start, a.end) <= 0;
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
    const fusedScores = new Map<string, { chunk: Chunk; score: number }>();

    // 1. Accumulate RRF scores for lexical matches
    lexical.forEach((item, index) => {
      const rank = index + 1;
      const rrf = 1 / (this.kConst + rank);
      const key = getChunkKey(item.chunk);
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += rrf;
      } else {
        fusedScores.set(key, { chunk: item.chunk, score: rrf });
      }
    });

    // 2. Accumulate RRF scores for semantic matches
    semantic.forEach((item, index) => {
      const rank = index + 1;
      const rrf = 1 / (this.kConst + rank);
      const key = getChunkKey(item.chunk);
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += rrf;
      } else {
        fusedScores.set(key, { chunk: item.chunk, score: rrf });
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
