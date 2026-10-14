import { describe, it, expect } from 'vitest';
import { RegexRefParser, buildBookAliasMap } from '../src/adapters/regex-ref-parser';
import type { BibleBook } from '../src/core/bible-books';

describe('RegexRefParser', () => {
  const parser = new RegexRefParser();

  it('parses standard single verse references', () => {
    const refs = parser.parse('John 3:16');
    expect(refs).toEqual([
      {
        start: { book: 'JHN', chapter: 3, verse: 16 },
        end: { book: 'JHN', chapter: 3, verse: 16 },
      },
    ]);
  });

  it('parses verse ranges', () => {
    const refs = parser.parse('1 Cor 13:4-8');
    expect(refs).toEqual([
      {
        start: { book: '1CO', chapter: 13, verse: 4 },
        end: { book: '1CO', chapter: 13, verse: 8 },
      },
    ]);
  });

  it('parses chapter-only references', () => {
    const refs = parser.parse('Read Psalm 23 today');
    expect(refs).toEqual([
      {
        start: { book: 'PSA', chapter: 23, verse: 1 },
      },
    ]);
  });

  it('handles french alias in default table', () => {
    const refs = parser.parse('Jean 3:16');
    expect(refs).toEqual([
      {
        start: { book: 'JHN', chapter: 3, verse: 16 },
        end: { book: 'JHN', chapter: 3, verse: 16 },
      },
    ]);
  });

  it('supports custom language tables (e.g. Fon)', () => {
    const fonBooks: BibleBook[] = [
      {
        id: 'JHN',
        name: 'Wɛnɖagbe Jaan tɔn',
        testament: 'NT',
        chapters: 21,
        aliases: ['jaan', 'jan'],
      },
      {
        id: 'GEN',
        name: 'Bǐbɛ́mɛ',
        testament: 'OT',
        chapters: 50,
        aliases: ['bǐbɛ́mɛ', 'bibeme', 'jẹnɛsisi'],
      },
    ];

    const fonParser = new RegexRefParser(buildBookAliasMap(fonBooks));

    const fonRefs = fonParser.parse('Jaan 3:16 kpodo Bǐbɛ́mɛ 1:1 kpo');
    expect(fonRefs).toEqual([
      {
        start: { book: 'JHN', chapter: 3, verse: 16 },
        end: { book: 'JHN', chapter: 3, verse: 16 },
      },
      {
        start: { book: 'GEN', chapter: 1, verse: 1 },
        end: { book: 'GEN', chapter: 1, verse: 1 },
      },
    ]);
  });
});
