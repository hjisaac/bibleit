import type { VerseCorpusData, VerseStore } from '../core/types';

/**
 * ArrayVerseStore: In-memory coordinate-indexed verse store backed by { [book]: string[][] }.
 * Lookups by (book, chapter, verse) are pure O(1) array index dereferences.
 */
export class ArrayVerseStore implements VerseStore {
  private data: VerseCorpusData = {};

  constructor(initialData?: VerseCorpusData) {
    if (initialData) {
      this.init(initialData);
    }
  }

  init(data: VerseCorpusData): void {
    this.data = data;
  }

  get(book: string, chapter: number, verse: number): string | undefined {
    const bookData = this.data[book];
    if (!bookData) return undefined;
    const chData = bookData[chapter - 1];
    if (!chData) return undefined;
    const txt = chData[verse - 1];
    return txt || undefined;
  }

  has(book: string, chapter: number, verse: number): boolean {
    return Boolean(this.get(book, chapter, verse));
  }

  chapterCount(book: string): number {
    return this.data[book]?.length ?? 0;
  }

  verseCount(book: string, chapter: number): number {
    return this.data[book]?.[chapter - 1]?.length ?? 0;
  }

  getRange(book: string, start: [number, number], end: [number, number]): string {
    const [startCh, startV] = start;
    const [endCh, endV] = end;
    const bookData = this.data[book];
    if (!bookData) return '';

    const parts: string[] = [];
    for (let c = startCh; c <= endCh; c++) {
      const chIdx = c - 1;
      const chData = bookData[chIdx];
      if (!chData) continue;

      const firstV = c === startCh ? startV : 1;
      const lastV = c === endCh ? endV : chData.length;

      for (let v = firstV; v <= lastV; v++) {
        const text = chData[v - 1];
        if (text) {
          parts.push(text);
        }
      }
    }
    return parts.join(' ');
  }
}
