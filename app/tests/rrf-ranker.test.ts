import { describe, it, expect } from 'vitest';
import { RrfRanker } from '../src/adapters/rrf-ranker';
import type { Chunk, ScoredPassage } from '../src/core/types';

describe('RrfRanker', () => {
  const ranker = new RrfRanker({ kConst: 60 });

  const chunk1: Chunk = {
    id: 1,
    start: { book: 'JHN', chapter: 3, verse: 16 },
    end: { book: 'JHN', chapter: 3, verse: 16 },
    text: 'For God so loved the world...',
  };

  const chunk2: Chunk = {
    id: 2,
    start: { book: 'GEN', chapter: 1, verse: 1 },
    end: { book: 'GEN', chapter: 1, verse: 1 },
    text: 'In the beginning...',
  };

  const chunk3: Chunk = {
    id: 3,
    start: { book: 'JHN', chapter: 3, verse: 15 },
    end: { book: 'JHN', chapter: 3, verse: 17 },
    text: 'Overlapping John passage...',
  };

  it('ranks reference matches before lexical and semantic matches', () => {
    const refs: ScoredPassage[] = [{ chunk: chunk2, score: 1.0, source: 'reference' }];
    const lexical: ScoredPassage[] = [{ chunk: chunk1, score: 10.5, source: 'lexical' }];
    const semantic: ScoredPassage[] = [];

    const merged = ranker.merge(refs, lexical, semantic, 5);

    expect(merged.length).toBe(2);
    expect(merged[0]?.chunk.id).toBe(2); // reference match stays #1
    expect(merged[1]?.chunk.id).toBe(1);
  });

  it('boosts chunks present in both lexical and semantic runs', () => {
    // chunk1 appears in both lists, chunk2 only in lexical
    const lexical: ScoredPassage[] = [
      { chunk: chunk2, score: 5.0, source: 'lexical' },
      { chunk: chunk1, score: 4.0, source: 'lexical' },
    ];
    const semantic: ScoredPassage[] = [
      { chunk: chunk1, score: 0.9, source: 'semantic' },
    ];

    const merged = ranker.merge([], lexical, semantic, 5);

    // chunk1 has rank 2 in lexical (1/62) + rank 1 in semantic (1/61) > chunk2 rank 1 in lexical (1/61)
    expect(merged[0]?.chunk.id).toBe(1);
    expect(merged[1]?.chunk.id).toBe(2);
  });

  it('deduplicates overlapping scripture passages', () => {
    // chunk1 (John 3:16) and chunk3 (John 3:15-17) overlap in Scripture
    const lexical: ScoredPassage[] = [
      { chunk: chunk1, score: 10.0, source: 'lexical' },
      { chunk: chunk3, score: 8.0, source: 'lexical' },
    ];

    const merged = ranker.merge([], lexical, [], 5);

    expect(merged.length).toBe(1);
    expect(merged[0]?.chunk.id).toBe(1); // Higher ranked passage is kept
  });
});
