import { describe, expect, it, beforeEach } from 'vitest';
import { $lastSearch, type StoredSearch } from '../src/stores/search';
import { SearchOriginEnum } from '../src/core/types';

describe('$lastSearch store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and restores translatedQuery and translatedBy', () => {
    const entry: StoredSearch = {
      query: "paix dans l'anxiété",
      passages: [],
      answerText: '',
      origin: SearchOriginEnum.REMOTE,
      translatedQuery: 'peace anxiety fear comfort',
      translatedBy: 'gemini',
    };

    $lastSearch.set(entry);

    const retrieved = $lastSearch.get();
    expect(retrieved.query).toBe("paix dans l'anxiété");
    expect(retrieved.translatedQuery).toBe('peace anxiety fear comfort');
    expect(retrieved.translatedBy).toBe('gemini');
    expect(retrieved.origin).toBe(SearchOriginEnum.REMOTE);
  });
});
