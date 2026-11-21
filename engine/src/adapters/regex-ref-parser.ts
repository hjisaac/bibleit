import type { RefParser } from '../core/ports';
import type { RefRange } from '../core/types';
import {
  BIBLE_BOOKS,
  LOCALIZED_BOOK_TABLES,
  stripAccents,
  type BibleBook,
} from '../core/bible-books';

/**
 * Builds a lookup map from lowercase aliases to canonical BibleBook metadata.
 * Indexes default names/aliases plus all registered localized book tables.
 */
export function buildBookAliasMap(
  customBooks?: readonly BibleBook[],
): Map<string, BibleBook> {
  const books = customBooks ?? BIBLE_BOOKS;
  const aliasMap = new Map<string, BibleBook>();
  const localizedTables = Object.values(LOCALIZED_BOOK_TABLES);

  const register = (term: string, book: BibleBook) => {
    const lower = term.toLowerCase();
    aliasMap.set(lower, book);
    aliasMap.set(stripAccents(lower), book);
  };

  for (const b of books) {
    aliasMap.set(b.id.toLowerCase(), b);
    register(b.name, b);
    for (const alias of b.aliases) {
      register(alias, b);
    }
    for (const table of localizedTables) {
      if (!table) continue;
      const localizedName = table.names[b.id];
      if (localizedName) register(localizedName, b);
      for (const alias of table.aliases[b.id] ?? []) {
        register(alias, b);
      }
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

  // Regex pattern (unicode-safe word boundaries for accented characters e.g. Ésaïe):
  // Group 1: Book name/alias (letters, numbers like 1/2/3, and spaces)
  // Group 2: Chapter number
  // Group 3: Optional verse portion (:start[-end])
  // Group 4: Start verse number
  // Group 5: Optional end verse number
  private static readonly REF_PATTERN =
    /(?<![\p{L}\p{N}])([1-3]?\s*[\p{L}\p{M}]+)\s+(\d+)(?::(\d+)(?:[-–—](\d+))?)?(?![\p{L}\p{N}])/gu;

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
      const book = this.aliasMap.get(normalizedBook) ?? this.aliasMap.get(stripAccents(normalizedBook));
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
