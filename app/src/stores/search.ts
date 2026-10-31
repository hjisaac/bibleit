import { persistentAtom } from '@nanostores/persistent';
import type { ScoredPassage } from '../core/types';

export const SEARCH_HISTORY_KEY = 'bibleit_search_history';
export const SEARCH_STORAGE_KEY = 'bibleit_last_search';
export const MAX_HISTORY_ITEMS = 3;

export interface StoredSearch {
  query: string;
  passages: ScoredPassage[];
  answerText: string;
}

const DEFAULT_STORED_SEARCH: StoredSearch = {
  query: '',
  passages: [],
  answerText: '',
};

function createPersistentStore<T>(
  name: string,
  initial: T,
  opts: { encode: (v: T) => string; decode: (raw: string) => T },
) {
  const store = persistentAtom<T>(name, initial, opts);
  let lastSeenRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
  const originalGet = store.get.bind(store);
  const originalSet = store.set.bind(store);

  store.set = (newValue: T) => {
    lastSeenRaw = opts.encode(newValue);
    originalSet(newValue);
  };

  store.get = () => {
    if (typeof localStorage !== 'undefined') {
      const currentRaw = localStorage.getItem(name);
      if (currentRaw !== lastSeenRaw) {
        lastSeenRaw = currentRaw;
        const decoded = currentRaw !== null ? opts.decode(currentRaw) : initial;
        originalSet(decoded);
      }
    }
    return originalGet();
  };

  return store;
}

export const $searchHistory = createPersistentStore<string[]>(
  SEARCH_HISTORY_KEY,
  [],
  {
    encode: JSON.stringify,
    decode: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        return [];
      }
    },
  },
);

export const $lastSearch = createPersistentStore<StoredSearch>(
  SEARCH_STORAGE_KEY,
  DEFAULT_STORED_SEARCH,
  {
    encode: JSON.stringify,
    decode: (raw) => {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.query === 'string') {
          return {
            query: parsed.query,
            passages: Array.isArray(parsed.passages) ? parsed.passages : [],
            answerText: typeof parsed.answerText === 'string' ? parsed.answerText : '',
          };
        }
      } catch {
        // Storage unavailable or invalid JSON
      }
      return DEFAULT_STORED_SEARCH;
    },
  },
);

export function addSearchHistory(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const prev = $searchHistory.get();
  const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  $searchHistory.set([trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS));
}
