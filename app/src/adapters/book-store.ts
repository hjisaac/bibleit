import { getBibleManifest, verifyBookIntegrity } from '../core/bible-manifest';
import { DEFAULT_TRANSLATION, type TranslationId } from '../core/types';
import { $activeTranslation } from '../stores/preferences';

export interface ChapterVerse {
  num: number;
  text: string;
}

export interface BookData {
  id: string;
  name: string;
  chapters: Record<string, ChapterVerse[]>;
}

// Remaps the 7 Textus Receptus verses to their host verses where text is preserved
export const VERSE_ALIASES: Readonly<Record<string, { chapter: number; verse: number }>> = {
  'ACT:8:37': { chapter: 8, verse: 36 },
  'LUK:17:36': { chapter: 17, verse: 35 },
  'ACT:15:34': { chapter: 15, verse: 33 },
  'ACT:24:7': { chapter: 24, verse: 6 },
  'ROM:16:25': { chapter: 14, verse: 23 },
  'ROM:16:26': { chapter: 14, verse: 23 },
  'ROM:16:27': { chapter: 14, verse: 23 },
};

const CACHE_NAME = 'bibleit-books-v1';
const memoryCache = new Map<string, BookData>();

/** Canonical in-memory address index for instant O(1) verse lookups */
const verseIndex = new Map<string, string>();

function getActiveTrans(translation?: string): TranslationId {
  return (translation ?? $activeTranslation.get() ?? DEFAULT_TRANSLATION) as TranslationId;
}

/** Generates canonical string key for address indexing */
export function verseKey(
  bookId: string,
  chapter: number,
  verse: number,
  translation?: string,
): string {
  const trans = getActiveTrans(translation);
  return `${trans}:${bookId.toUpperCase()}:${chapter}:${verse}`;
}

/** Synchronous O(1) lookup from the verse index. Returns undefined if not yet indexed. */
export function getCachedVerse(
  bookId: string,
  chapter: number,
  verse: number,
  translation?: string,
): string | undefined {
  return verseIndex.get(verseKey(bookId, chapter, verse, translation));
}

/** Non-blocking background worker to populate the verse index from a loaded book */
export function scheduleBookIndexing(bookData: BookData, translation?: string): void {
  if (!bookData?.chapters || typeof bookData.chapters !== 'object') return;
  const trans = getActiveTrans(translation);

  const runner = () => {
    const bookId = bookData.id.toUpperCase();
    for (const [chStr, verses] of Object.entries(bookData.chapters)) {
      const ch = parseInt(chStr, 10);
      for (const v of verses) {
        verseIndex.set(`${trans}:${bookId}:${ch}:${v.num}`, v.text);
      }
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (
      window as unknown as {
        requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => void;
      }
    ).requestIdleCallback(runner, { timeout: 2500 });
  } else {
    setTimeout(runner, 0);
  }
}

/** Resolves verse text: checks aliases, index, or loads book asynchronously if missing */
export async function resolveVerseText(
  bookId: string,
  chapter: number,
  verse: number,
  translation?: string,
): Promise<string | undefined> {
  const aliasKey = `${bookId.toUpperCase()}:${chapter}:${verse}`;
  const alias = VERSE_ALIASES[aliasKey];
  const targetChapter = alias ? alias.chapter : chapter;
  const targetVerse = alias ? alias.verse : verse;

  const cached = getCachedVerse(bookId, targetChapter, targetVerse, translation);
  if (cached) return cached;

  try {
    const bookData = await loadBook(bookId, translation);
    const chKey = String(targetChapter);
    const chapterVerses = bookData?.chapters?.[chKey];
    const found = chapterVerses?.find((v) => v.num === targetVerse);
    return found?.text;
  } catch {
    return undefined;
  }
}

function getBookUrl(bookId: string, translation?: string): string {
  const trans = getActiveTrans(translation);
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}data/books/${trans}/${bookId}.json`;
}

/** Loads a book from memory, browser Cache API, or network with CRC32 integrity verification. */
export async function loadBook(bookId: string, translation?: string): Promise<BookData> {
  const trans = getActiveTrans(translation);
  const memKey = `${trans}:${bookId}`;

  const cachedMem = memoryCache.get(memKey);
  if (cachedMem) {
    return cachedMem;
  }

  const url = getBookUrl(bookId, trans);
  const manifest = getBibleManifest(trans);

  // Check persistent Cache API if available in browser
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        try {
          const data: BookData = await match.json();
          if (data?.chapters) {
            memoryCache.set(memKey, data);
            scheduleBookIndexing(data, trans);
            return data;
          }
          await cache.delete(url);
        } catch {
          await cache.delete(url);
        }
      }
    } catch {
      // Fall through to network if Cache API errors
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${bookId} (${trans}): HTTP ${response.status}`);
  }

  const text = await response.text();

  // Verify non-cryptographic CRC32 integrity against translation manifest
  if (!verifyBookIntegrity(bookId, text, manifest)) {
    throw new Error(`Integrity check failed for ${bookId} (${trans}): corrupt payload.`);
  }

  const data: BookData = JSON.parse(text);
  memoryCache.set(memKey, data);
  scheduleBookIndexing(data, trans);

  // Persist verified book into Cache API
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        url,
        new Response(text, {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=31536000, immutable',
          },
        }),
      );
    } catch {
      // Storage quota or permission error: data remains in memory
    }
  }

  return data;
}

/** Returns the number of books already cached locally in Cache API. */
export async function getCachedBooksCount(translation?: string): Promise<number> {
  const trans = getActiveTrans(translation);
  if (typeof caches === 'undefined') {
    return memoryCache.size;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const manifest = getBibleManifest(trans);
    const bookIds = Object.keys(manifest.books);
    let count = 0;

    for (const bookId of bookIds) {
      const match = await cache.match(getBookUrl(bookId, trans));
      if (match) {
        count++;
      }
    }
    return count;
  } catch {
    return memoryCache.size;
  }
}

/** Downloads missing books with CRC32 verification and reports live progress. */
export async function downloadAllBooks(
  onProgress?: (progressPercent: number, bookId: string) => void,
  translation?: string,
): Promise<void> {
  const trans = getActiveTrans(translation);
  const manifest = getBibleManifest(trans);
  const bookIds = Object.keys(manifest.books);
  const total = bookIds.length;
  let done = 0;

  for (const bookId of bookIds) {
    await loadBook(bookId, trans);
    done++;
    const percent = Math.min(100, Math.round((done / total) * 100));
    onProgress?.(percent, bookId);
  }
}

/** Clears all locally cached Scripture books from both memory and browser Cache API. */
export async function clearBookCache(): Promise<void> {
  memoryCache.clear();
  verseIndex.clear();
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // Ignore cache deletion error
    }
  }
}
