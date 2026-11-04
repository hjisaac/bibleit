import { describe, it, expect } from 'vitest';
import { MiniSearchLexicalIndex, type Chunk } from '@bibleit/engine';

describe('MiniSearchLexicalIndex', () => {
  const sampleChunks: Chunk[] = [
    {
      book: 'JHN',
      start: [3, 16],
      end: [3, 16],
      text: 'For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life.',
    },
    {
      book: 'ROM',
      start: [13, 8],
      end: [13, 10],
      text: 'Owe no one anything, except to love one another; for he who loves his neighbor has fulfilled the law. You shall love your neighbor as yourself.',
    },
  ];

  it('indexes chunks and returns scored passages on search', async () => {
    const index = new MiniSearchLexicalIndex();
    await index.build(sampleChunks);

    const results = index.search('neighbor', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.book).toBe('ROM');
    expect(results[0]?.source).toBe('lexical');
    expect(results[0]?.chunk.text).toContain('You shall love your neighbor as yourself');
  });

  it('supports prefix and fuzzy search', async () => {
    const index = new MiniSearchLexicalIndex();
    await index.build(sampleChunks);

    const prefixResults = index.search('believ', 10);
    expect(prefixResults.length).toBeGreaterThan(0);
    expect(prefixResults[0]?.chunk.book).toBe('JHN');

    const fuzzyResults = index.search('etarnal', 10);
    expect(fuzzyResults.length).toBeGreaterThan(0);
    expect(fuzzyResults[0]?.chunk.book).toBe('JHN');
  });

  it('returns empty array when no matches found', async () => {
    const index = new MiniSearchLexicalIndex();
    await index.build(sampleChunks);

    const results = index.search('nonexistentwordxyz', 10);
    expect(results).toHaveLength(0);
  });
});
