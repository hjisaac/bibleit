import { describe, it, expect } from 'vitest';
import { RrfRanker } from '../src/adapters/rrf-ranker';
import { getChunkKey, type Chunk, type ScoredPassage } from '../src/core/types';

describe('RrfRanker', () => {
  const ranker = new RrfRanker({ kConst: 60 });

  const chunk1: Chunk = {
    book: 'JHN',
    start: [3, 16],
    end: [3, 16],
    text: 'For God so loved the world...',
  };

  const chunk2: Chunk = {
    book: 'GEN',
    start: [1, 1],
    end: [1, 1],
    text: 'In the beginning...',
  };

  const chunk3: Chunk = {
    book: 'JHN',
    start: [3, 15],
    end: [3, 17],
    text: 'Overlapping John passage...',
  };

  it('ranks reference matches before lexical and semantic matches', () => {
    const refs: ScoredPassage[] = [{ chunk: chunk2, score: 1.0, source: 'reference' }];
    const lexical: ScoredPassage[] = [{ chunk: chunk1, score: 10.5, source: 'lexical' }];
    const semantic: ScoredPassage[] = [];

    const merged = ranker.merge(refs, lexical, semantic, 5);

    expect(merged.length).toBe(2);
    expect(getChunkKey(merged[0]!.chunk)).toBe(getChunkKey(chunk2)); // reference match stays #1
    expect(getChunkKey(merged[1]!.chunk)).toBe(getChunkKey(chunk1));
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
    expect(getChunkKey(merged[0]!.chunk)).toBe(getChunkKey(chunk1));
    expect(getChunkKey(merged[1]!.chunk)).toBe(getChunkKey(chunk2));
  });

  it('deduplicates overlapping scripture passages', () => {
    // chunk1 (John 3:16) and chunk3 (John 3:15-17) overlap in Scripture
    const lexical: ScoredPassage[] = [
      { chunk: chunk1, score: 10.0, source: 'lexical' },
      { chunk: chunk3, score: 8.0, source: 'lexical' },
    ];

    const merged = ranker.merge([], lexical, [], 5);

    expect(merged.length).toBe(1);
    expect(getChunkKey(merged[0]!.chunk)).toBe(getChunkKey(chunk1)); // Higher ranked passage is kept
  });
});
