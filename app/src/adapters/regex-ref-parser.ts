import type { RefParser } from '../core/ports';
import type { RefRange } from '../core/types';
import { BIBLE_BOOKS, type BibleBook } from '../core/bible-books';

/**
 * Builds a lookup map from lowercase aliases to canonical BibleBook metadata.
 * Can be initialized with default English tables or custom language aliases (e.g., French, Fon).
 */
export function buildBookAliasMap(
  customBooks?: readonly BibleBook[],
): Map<string, BibleBook> {
  const books = customBooks ?? BIBLE_BOOKS;
  const aliasMap = new Map<string, BibleBook>();

  for (const b of books) {
    aliasMap.set(b.id.toLowerCase(), b);
    aliasMap.set(b.name.toLowerCase(), b);
    for (const alias of b.aliases) {
      aliasMap.set(alias.toLowerCase(), b);
    }
  }

  return aliasMap;
}

/**
 * Regex-based scripture reference parser.
 * Matches:
 *  - Book + chapter + verse: "John 3:16", "1 Cor 13:4-8", "Jean 3:16"
 *  - Book + chapter only: "Genesis 1", "Psalm 23"
 */
export class RegexRefParser implements RefParser {
  private aliasMap: Map<string, BibleBook>;

  // Regex pattern:
  // Group 1: Book name/alias (letters, numbers like 1/2/3, and spaces)
  // Group 2: Chapter number
  // Group 3: Optional verse portion (:start[-end])
  // Group 4: Start verse number
  // Group 5: Optional end verse number
  private static readonly REF_PATTERN =
    /\b([1-3]?\s*[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+)\s+(\d+)(?::(\d+)(?:[-–—](\d+))?)?\b/g;

  constructor(aliasMap?: Map<string, BibleBook>) {
    this.aliasMap = aliasMap ?? buildBookAliasMap();
  }

  parse(query: string): RefRange[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const results: RefRange[] = [];
    RegexRefParser.REF_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = RegexRefParser.REF_PATTERN.exec(trimmed)) !== null) {
      const rawBook = match[1]?.trim().toLowerCase();
      const chapterStr = match[2];
      const startVerseStr = match[3];
      const endVerseStr = match[4];

      if (!rawBook || !chapterStr) continue;

      // Normalize internal whitespace (e.g., "1  cor" -> "1 cor")
      const normalizedBook = rawBook.replace(/\s+/g, ' ');
      const book = this.aliasMap.get(normalizedBook);
      if (!book) continue;

      const chapter = parseInt(chapterStr, 10);
      if (isNaN(chapter) || chapter < 1 || chapter > book.chapters) continue;

      if (startVerseStr) {
        const startVerse = parseInt(startVerseStr, 10);
        const endVerse = endVerseStr ? parseInt(endVerseStr, 10) : startVerse;
        if (isNaN(startVerse) || startVerse < 1) continue;

        results.push({
          start: { book: book.id, chapter, verse: startVerse },
          end: { book: book.id, chapter, verse: Math.max(startVerse, endVerse) },
        });
      } else {
        // Whole chapter reference (e.g., "John 3", "Psalm 23")
        results.push({
          start: { book: book.id, chapter, verse: 1 },
        });
      }
    }

    return results;
  }
}
