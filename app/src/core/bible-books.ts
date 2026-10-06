export interface BibleBook {
  readonly id: string;
  readonly name: string;
  readonly testament: 'OT' | 'NT';
  readonly chapters: number;
  readonly aliases: readonly string[];
}

export const BIBLE_BOOKS: readonly BibleBook[] = [
  // Old Testament (39 books)
  { id: 'GEN', name: 'Genesis', testament: 'OT', chapters: 50, aliases: ['gen', 'ge', 'gn', 'genesis'] },
  { id: 'EXO', name: 'Exodus', testament: 'OT', chapters: 40, aliases: ['exo', 'ex', 'exod', 'exodus'] },
  { id: 'LEV', name: 'Leviticus', testament: 'OT', chapters: 27, aliases: ['lev', 'le', 'lv', 'leviticus'] },
  { id: 'NUM', name: 'Numbers', testament: 'OT', chapters: 36, aliases: ['num', 'nu', 'nm', 'numbers'] },
  { id: 'DEU', name: 'Deuteronomy', testament: 'OT', chapters: 34, aliases: ['deu', 'deut', 'dt', 'deuteronomy'] },
  { id: 'JOS', name: 'Joshua', testament: 'OT', chapters: 24, aliases: ['jos', 'josh', 'joshua'] },
  { id: 'JDG', name: 'Judges', testament: 'OT', chapters: 21, aliases: ['jdg', 'judg', 'judges'] },
  { id: 'RUT', name: 'Ruth', testament: 'OT', chapters: 4, aliases: ['rut', 'rth', 'ruth'] },
  { id: '1SA', name: '1 Samuel', testament: 'OT', chapters: 31, aliases: ['1sa', '1 sam', '1sam', '1 samuel'] },
  { id: '2SA', name: '2 Samuel', testament: 'OT', chapters: 24, aliases: ['2sa', '2 sam', '2sam', '2 samuel'] },
  { id: '1KI', name: '1 Kings', testament: 'OT', chapters: 22, aliases: ['1ki', '1 kgs', '1kings', '1 kings'] },
  { id: '2KI', name: '2 Kings', testament: 'OT', chapters: 25, aliases: ['2ki', '2 kgs', '2kings', '2 kings'] },
  { id: '1CH', name: '1 Chronicles', testament: 'OT', chapters: 29, aliases: ['1ch', '1 chron', '1chronicles'] },
  { id: '2CH', name: '2 Chronicles', testament: 'OT', chapters: 36, aliases: ['2ch', '2 chron', '2chronicles'] },
  { id: 'EZR', name: 'Ezra', testament: 'OT', chapters: 10, aliases: ['ezr', 'ezra'] },
  { id: 'NEH', name: 'Nehemiah', testament: 'OT', chapters: 13, aliases: ['neh', 'nehemiah'] },
  { id: 'EST', name: 'Esther', testament: 'OT', chapters: 10, aliases: ['est', 'esther'] },
  { id: 'JOB', name: 'Job', testament: 'OT', chapters: 42, aliases: ['job'] },
  { id: 'PSA', name: 'Psalms', testament: 'OT', chapters: 150, aliases: ['psa', 'ps', 'psalm', 'psalms'] },
  { id: 'PRO', name: 'Proverbs', testament: 'OT', chapters: 31, aliases: ['pro', 'prv', 'prov', 'proverbs'] },
  { id: 'ECC', name: 'Ecclesiastes', testament: 'OT', chapters: 12, aliases: ['ecc', 'eccl', 'ecclesiastes'] },
  { id: 'SNG', name: 'Song of Solomon', testament: 'OT', chapters: 8, aliases: ['sng', 'song', 'canticles'] },
  { id: 'ISA', name: 'Isaiah', testament: 'OT', chapters: 66, aliases: ['isa', 'is', 'isaiah'] },
  { id: 'JER', name: 'Jeremiah', testament: 'OT', chapters: 52, aliases: ['jer', 'jeremiah'] },
  { id: 'LAM', name: 'Lamentations', testament: 'OT', chapters: 5, aliases: ['lam', 'lamentations'] },
  { id: 'EZK', name: 'Ezekiel', testament: 'OT', chapters: 48, aliases: ['ezk', 'ezek', 'ezekiel'] },
  { id: 'DAN', name: 'Daniel', testament: 'OT', chapters: 12, aliases: ['dan', 'daniel'] },
  { id: 'HOS', name: 'Hosea', testament: 'OT', chapters: 14, aliases: ['hos', 'hosea'] },
  { id: 'JOL', name: 'Joel', testament: 'OT', chapters: 3, aliases: ['jol', 'joel'] },
  { id: 'AMO', name: 'Amos', testament: 'OT', chapters: 9, aliases: ['amo', 'amos'] },
  { id: 'OBA', name: 'Obadiah', testament: 'OT', chapters: 1, aliases: ['oba', 'obadiah'] },
  { id: 'JON', name: 'Jonah', testament: 'OT', chapters: 4, aliases: ['jon', 'jonah'] },
  { id: 'MIC', name: 'Micah', testament: 'OT', chapters: 7, aliases: ['mic', 'micah'] },
  { id: 'NAM', name: 'Nahum', testament: 'OT', chapters: 3, aliases: ['nam', 'nahum'] },
  { id: 'HAB', name: 'Habakkuk', testament: 'OT', chapters: 3, aliases: ['hab', 'habakkuk'] },
  { id: 'ZEP', name: 'Zephaniah', testament: 'OT', chapters: 3, aliases: ['zep', 'zephaniah'] },
  { id: 'HAG', name: 'Haggai', testament: 'OT', chapters: 2, aliases: ['hag', 'haggai'] },
  { id: 'ZEC', name: 'Zechariah', testament: 'OT', chapters: 14, aliases: ['zec', 'zechariah'] },
  { id: 'MAL', name: 'Malachi', testament: 'OT', chapters: 4, aliases: ['mal', 'malachi'] },

  // New Testament (27 books)
  { id: 'MAT', name: 'Matthew', testament: 'NT', chapters: 28, aliases: ['mat', 'matt', 'mt', 'matthew'] },
  { id: 'MRK', name: 'Mark', testament: 'NT', chapters: 16, aliases: ['mrk', 'mk', 'mark'] },
  { id: 'LUK', name: 'Luke', testament: 'NT', chapters: 24, aliases: ['luk', 'lk', 'luke'] },
  { id: 'JHN', name: 'John', testament: 'NT', chapters: 21, aliases: ['jhn', 'jn', 'john', 'jean'] },
  { id: 'ACT', name: 'Acts', testament: 'NT', chapters: 28, aliases: ['act', 'acts'] },
  { id: 'ROM', name: 'Romans', testament: 'NT', chapters: 16, aliases: ['rom', 'ro', 'rm', 'romans'] },
  { id: '1CO', name: '1 Corinthians', testament: 'NT', chapters: 16, aliases: ['1co', '1cor', '1 cor', '1 corinthians'] },
  { id: '2CO', name: '2 Corinthians', testament: 'NT', chapters: 13, aliases: ['2co', '2cor', '2 cor', '2 corinthians'] },
  { id: 'GAL', name: 'Galatians', testament: 'NT', chapters: 6, aliases: ['gal', 'ga', 'galatians'] },
  { id: 'EPH', name: 'Ephesians', testament: 'NT', chapters: 6, aliases: ['eph', 'ephesians'] },
  { id: 'PHP', name: 'Philippians', testament: 'NT', chapters: 4, aliases: ['php', 'phil', 'philippians'] },
  { id: 'COL', name: 'Colossians', testament: 'NT', chapters: 4, aliases: ['col', 'colossians'] },
  { id: '1TH', name: '1 Thessalonians', testament: 'NT', chapters: 5, aliases: ['1th', '1thess', '1 thessalonians'] },
  { id: '2TH', name: '2 Thessalonians', testament: 'NT', chapters: 3, aliases: ['2th', '2thess', '2 thessalonians'] },
  { id: '1TI', name: '1 Timothy', testament: 'NT', chapters: 6, aliases: ['1ti', '1tim', '1 timothy'] },
  { id: '2TI', name: '2 Timothy', testament: 'NT', chapters: 4, aliases: ['2ti', '2tim', '2 timothy'] },
  { id: 'TIT', name: 'Titus', testament: 'NT', chapters: 3, aliases: ['tit', 'titus'] },
  { id: 'PHM', name: 'Philemon', testament: 'NT', chapters: 1, aliases: ['phm', 'philem', 'philemon'] },
  { id: 'HEB', name: 'Hebrews', testament: 'NT', chapters: 13, aliases: ['heb', 'hebrews'] },
  { id: 'JAS', name: 'James', testament: 'NT', chapters: 5, aliases: ['jas', 'jm', 'james'] },
  { id: '1PE', name: '1 Peter', testament: 'NT', chapters: 5, aliases: ['1pe', '1pet', '1 peter'] },
  { id: '2PE', name: '2 Peter', testament: 'NT', chapters: 3, aliases: ['2pe', '2pet', '2 peter'] },
  { id: '1JN', name: '1 John', testament: 'NT', chapters: 5, aliases: ['1jn', '1john', '1 john'] },
  { id: '2JN', name: '2 John', testament: 'NT', chapters: 1, aliases: ['2jn', '2john', '2 john'] },
  { id: '3JN', name: '3 John', testament: 'NT', chapters: 1, aliases: ['3jn', '3john', '3 john'] },
  { id: 'JUD', name: 'Jude', testament: 'NT', chapters: 1, aliases: ['jud', 'jude'] },
  { id: 'REV', name: 'Revelation', testament: 'NT', chapters: 22, aliases: ['rev', 'revelation', 'apocalypse'] },
];

/** Matches query string prefix to a Bible book deterministically. */
export function findBookByPrefix(query: string): BibleBook | undefined {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return undefined;
  }

  // Check exact alias match first.
  const exact = BIBLE_BOOKS.find((b) => b.aliases.some((a) => a === normalized));
  if (exact) {
    return exact;
  }

  // Check prefix match (e.g. 'phi' -> Philippians, 'rom' -> Romans).
  return BIBLE_BOOKS.find(
    (b) =>
      b.name.toLowerCase().startsWith(normalized) ||
      b.aliases.some((a) => a.startsWith(normalized) && normalized.length >= 3),
  );
}
