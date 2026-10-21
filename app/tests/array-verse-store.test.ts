import { describe, it, expect } from 'vitest';
import { ArrayVerseStore } from '../src/adapters/array-verse-store';

describe('ArrayVerseStore', () => {
  const mockData = {
    GEN: [
      ['In the beginning', 'The earth was formless', 'God said, Let there be light'],
      ['Thus the heavens and the earth were finished', 'On the seventh day God ended his work'],
    ],
    MAT: [
      // Sparse alignment test: verse 21 is omitted (empty string)
      ['', 'Abraham fathered Isaac', 'Isaac fathered Jacob'],
    ],
  };

  const store = new ArrayVerseStore(mockData);

  it('retrieves verse text by 1-indexed coordinates', () => {
    expect(store.get('GEN', 1, 1)).toBe('In the beginning');
    expect(store.get('GEN', 1, 3)).toBe('God said, Let there be light');
    expect(store.get('GEN', 2, 1)).toBe('Thus the heavens and the earth were finished');
  });

  it('returns undefined for non-existent verses or chapters', () => {
    expect(store.get('GEN', 1, 99)).toBeUndefined();
    expect(store.get('GEN', 99, 1)).toBeUndefined();
    expect(store.get('REV', 1, 1)).toBeUndefined();
  });

  it('returns undefined for sparse-aligned omitted verses (empty string)', () => {
    expect(store.get('MAT', 1, 1)).toBeUndefined();
    expect(store.has('MAT', 1, 1)).toBe(false);
    expect(store.get('MAT', 1, 2)).toBe('Abraham fathered Isaac');
    expect(store.has('MAT', 1, 2)).toBe(true);
  });

  it('reports chapterCount and verseCount', () => {
    expect(store.chapterCount('GEN')).toBe(2);
    expect(store.verseCount('GEN', 1)).toBe(3);
    expect(store.verseCount('GEN', 2)).toBe(2);
    expect(store.chapterCount('NONEXISTENT')).toBe(0);
  });

  it('concatenates verse ranges across same chapter', () => {
    const range = store.getRange('GEN', [1, 1], [1, 2]);
    expect(range).toBe('In the beginning The earth was formless');
  });

  it('concatenates verse ranges across multiple chapters', () => {
    const range = store.getRange('GEN', [1, 2], [2, 1]);
    expect(range).toBe(
      'The earth was formless God said, Let there be light Thus the heavens and the earth were finished'
    );
  });
});
