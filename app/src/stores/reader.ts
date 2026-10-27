import { persistentAtom } from '@nanostores/persistent';
import type { SavedVerse } from '../components/SavedView';

export interface ReaderLocation {
  book: string;
  chapter: number;
  targetVerse?: number;
  scrollKey: number;
}

const DEFAULT_LOCATION: ReaderLocation = {
  book: 'GEN',
  chapter: 1,
  targetVerse: 1,
  scrollKey: 0,
};

const DEFAULT_SAVED_VERSES: SavedVerse[] = [
  {
    id: '1',
    book: 'PHP',
    bookName: 'Philippians',
    chapter: 4,
    verse: 7,
    citation: 'Philippians 4:7',
    text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
    savedAt: 1700000000000,
  },
];

export const $readerLocation = persistentAtom<ReaderLocation>(
  'bibleit_last_read',
  DEFAULT_LOCATION,
  {
    encode: JSON.stringify,
    decode: (str) => {
      try {
        const parsed = JSON.parse(str);
        if (parsed && typeof parsed.book === 'string' && typeof parsed.chapter === 'number') {
          return {
            book: parsed.book,
            chapter: parsed.chapter,
            targetVerse: parsed.targetVerse ?? 1,
            scrollKey: 0,
          };
        }
      } catch {}
      return DEFAULT_LOCATION;
    },
  },
);

export const $savedVerses = persistentAtom<SavedVerse[]>(
  'bibleit_saved_verses',
  DEFAULT_SAVED_VERSES,
  {
    encode: JSON.stringify,
    decode: (str) => {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return DEFAULT_SAVED_VERSES;
    },
  },
);
