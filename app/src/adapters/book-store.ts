import { WEB_BIBLE_MANIFEST, verifyBookIntegrity } from '../core/bible-manifest';

export interface ChapterVerse {
  num: number;
  text: string;
}

export interface BookData {
  id: string;
  name: string;
  chapters: Record<string, ChapterVerse[]>;
}

const CACHE_NAME = 'bibleit-books-v1';
const memoryCache = new Map<string, BookData>();

function getBookUrl(bookId: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}data/books/${bookId}.json`;
}

/** Loads a book from memory, browser Cache API, or network with CRC32 integrity verification. */
export async function loadBook(bookId: string): Promise<BookData> {
  const cachedMem = memoryCache.get(bookId);
  if (cachedMem) {
    return cachedMem;
  }

  const url = getBookUrl(bookId);

  // Check persistent Cache API if available in browser
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const data: BookData = await match.json();
        memoryCache.set(bookId, data);
        return data;
      }
    } catch {
      // Fall through to network if Cache API errors
    }
  }

  // Network fetch
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${bookId}: HTTP ${response.status}`);
  }

  const text = await response.text();

  // Verify non-cryptographic CRC32 integrity
  if (!verifyBookIntegrity(bookId, text)) {
    throw new Error(`Integrity check failed for ${bookId}: corrupt or truncated payload.`);
  }

  const data: BookData = JSON.parse(text);
  memoryCache.set(bookId, data);

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
      // Storage quota or permission error — data remains in memory
    }
  }

  return data;
}

/** Returns the number of books already cached locally in Cache API. */
export async function getCachedBooksCount(): Promise<number> {
  if (typeof caches === 'undefined') {
    return memoryCache.size;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const bookIds = Object.keys(WEB_BIBLE_MANIFEST.books);
    let count = 0;

    for (const bookId of bookIds) {
      const match = await cache.match(getBookUrl(bookId));
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
): Promise<void> {
  const bookIds = Object.keys(WEB_BIBLE_MANIFEST.books);
  const total = bookIds.length;
  let done = 0;

  for (const bookId of bookIds) {
    await loadBook(bookId);
    done++;
    const percent = Math.min(100, Math.round((done / total) * 100));
    onProgress?.(percent, bookId);
  }
}

/** Clears all locally cached Scripture books from both memory and browser Cache API. */
export async function clearBookCache(): Promise<void> {
  memoryCache.clear();
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(CACHE_NAME);
    } catch {
      // Ignore cache deletion error
    }
  }
}
