import { BIBLE_BOOKS_BY_ID } from './bible-books';
import type { Chunk, RawChunk } from './types';

export function formatCitation(
  bookOrChunk: string | Pick<RawChunk, 'book' | 'start' | 'end'>,
  start?: [number, number],
  end?: [number, number],
): string {
  const bookId = typeof bookOrChunk === 'string' ? bookOrChunk : bookOrChunk.book;
  const [startCh, startV] = typeof bookOrChunk === 'string' ? start! : bookOrChunk.start;
  const [endCh, endV] = typeof bookOrChunk === 'string' ? end! : bookOrChunk.end;

  const bookName = BIBLE_BOOKS_BY_ID[bookId]?.name ?? bookId;

  if (startCh === endCh) {
    if (startV === endV) {
      return `${bookName} ${startCh}:${startV}`;
    }
    return `${bookName} ${startCh}:${startV}–${endV}`;
  }
  return `${bookName} ${startCh}:${startV}–${endCh}:${endV}`;
}

export function renderChunk(chunk: Chunk): string {
  const citation = `[${formatCitation(chunk)}]`;
  const heading = chunk.headings?.[0]?.[2];
  const header = heading ? `${citation} ${heading}` : citation;
  return `${header}\n${chunk.text}`;
}
