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

export const FRENCH_BOOK_NAMES: Readonly<Record<string, string>> = Object.freeze({
  GEN: 'Genèse', EXO: 'Exode', LEV: 'Lévitique', NUM: 'Nombres',
  DEU: 'Deutéronome', JOS: 'Josué', JDG: 'Juges', RUT: 'Ruth',
  '1SA': '1 Samuel', '2SA': '2 Samuel', '1KI': '1 Rois', '2KI': '2 Rois',
  '1CH': '1 Chroniques', '2CH': '2 Chroniques', EZR: 'Esdras', NEH: 'Néhémie',
  EST: 'Esther', JOB: 'Job', PSA: 'Psaumes', PRO: 'Proverbes',
  ECC: 'Ecclésiaste', SNG: 'Cantique des Cantiques', ISA: 'Ésaïe', JER: 'Jérémie',
  LAM: 'Lamentations', EZK: 'Ézéchiel', DAN: 'Daniel', HOS: 'Osée',
  JOL: 'Joël', AMO: 'Amos', OBA: 'Abdias', JON: 'Jonas',
  MIC: 'Michée', NAM: 'Nahum', HAB: 'Habacuc', ZEP: 'Sophonie',
  HAG: 'Aggée', ZEC: 'Zacharie', MAL: 'Malachie', MAT: 'Matthieu',
  MRK: 'Marc', LUK: 'Luc', JHN: 'Jean', ACT: 'Actes',
  ROM: 'Romains', '1CO': '1 Corinthiens', '2CO': '2 Corinthiens', GAL: 'Galates',
  EPH: 'Éphésiens', PHP: 'Philippiens', COL: 'Colossiens', '1TH': '1 Thessaloniciens',
  '2TH': '2 Thessaloniciens', '1TI': '1 Timothée', '2TI': '2 Timothée', TIT: 'Tite',
  PHM: 'Philémon', HEB: 'Hébreux', JAS: 'Jacques', '1PE': '1 Pierre',
  '2PE': '2 Pierre', '1JN': '1 Jean', '2JN': '2 Jean', '3JN': '3 Jean',
  JUD: 'Jude', REV: 'Apocalypse',
});

export const FRENCH_BOOK_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  GEN: ['gn', 'gen', 'genese'],
  EXO: ['ex', 'exo', 'exode'],
  LEV: ['lv', 'le', 'lev', 'levitique'],
  NUM: ['nb', 'nom', 'nomb', 'nombres'],
  DEU: ['dt', 'deut', 'deuteronome'],
  JOS: ['jos', 'josue'],
  JDG: ['jg', 'jug', 'juge', 'juges'],
  RUT: ['rt', 'ru', 'rut', 'ruth'],
  '1SA': ['1s', '1sam', '1samuel', '1 samuel', '1 sam'],
  '2SA': ['2s', '2sam', '2samuel', '2 samuel', '2 sam'],
  '1KI': ['1r', '1roi', '1rois', '1 roi', '1 rois'],
  '2KI': ['2r', '2roi', '2rois', '2 roi', '2 rois'],
  '1CH': ['1ch', '1chr', '1chron', '1chroniques', '1 chroniques', '1 chron'],
  '2CH': ['2ch', '2chr', '2chron', '2chroniques', '2 chroniques', '2 chron'],
  EZR: ['esd', 'esdr', 'esdras'],
  NEH: ['ne', 'neh', 'nehemie'],
  EST: ['est', 'esth', 'esther'],
  JOB: ['job'],
  PSA: ['ps', 'psa', 'psm', 'psaume', 'psaumes'],
  PRO: ['pr', 'pro', 'prv', 'prov', 'proverbe', 'proverbes'],
  ECC: ['ec', 'ecc', 'eccl', 'ecclesiaste'],
  SNG: ['ct', 'cant', 'cantique', 'cantiques', 'cantique des cantiques'],
  ISA: ['es', 'esa', 'esai', 'esaie'],
  JER: ['jr', 'jer', 'jeremie'],
  LAM: ['lm', 'lam', 'lamentation', 'lamentations'],
  EZK: ['ez', 'eze', 'ezek', 'ezechiel'],
  DAN: ['da', 'dan', 'daniel'],
  HOS: ['os', 'ose', 'osee'],
  JOL: ['jl', 'joe', 'joel'],
  AMO: ['am', 'amo', 'amos'],
  OBA: ['ab', 'abd', 'abdias'],
  JON: ['jon', 'jonas'],
  MIC: ['mi', 'mic', 'michee'],
  NAM: ['na', 'nah', 'nahum'],
  HAB: ['ha', 'hab', 'habacuc'],
  ZEP: ['so', 'sop', 'sophonie'],
  HAG: ['ag', 'agg', 'aggee'],
  ZEC: ['za', 'zac', 'zacharie'],
  MAL: ['ml', 'mal', 'malachie'],
  MAT: ['mt', 'mat', 'matt', 'matthieu'],
  MRK: ['mc', 'mrk', 'marc', 'mar'],
  LUK: ['lc', 'luc', 'lu'],
  JHN: ['jn', 'jean'],
  ACT: ['ac', 'act', 'actes'],
  ROM: ['rm', 'ro', 'rom', 'romain', 'romains'],
  '1CO': ['1co', '1cor', '1corinthiens', '1 corinthiens', '1 cor'],
  '2CO': ['2co', '2cor', '2corinthiens', '2 corinthiens', '2 cor'],
  GAL: ['ga', 'gal', 'galate', 'galates'],
  EPH: ['ep', 'eph', 'ephesien', 'ephesiens'],
  PHP: ['ph', 'php', 'phil', 'philippien', 'philippiens'],
  COL: ['col', 'colossien', 'colossiens'],
  '1TH': ['1th', '1thess', '1thessaloniciens', '1 thessaloniciens', '1 thess'],
  '2TH': ['2th', '2thess', '2thessaloniciens', '2 thessaloniciens', '2 thess'],
  '1TI': ['1ti', '1tim', '1timothee', '1 timothee', '1 tim'],
  '2TI': ['2ti', '2tim', '2timothee', '2 timothee', '2 tim'],
  TIT: ['tt', 'tit', 'tite'],
  PHM: ['phm', 'philemon'],
  HEB: ['he', 'heb', 'hebreu', 'hebreux'],
  JAS: ['jc', 'jac', 'jacq', 'jacques'],
  '1PE': ['1p', '1pi', '1pierre', '1 pierre', '1 pet'],
  '2PE': ['2p', '2pi', '2pierre', '2 pierre', '2 pet'],
  '1JN': ['1jn', '1jean', '1 jean'],
  '2JN': ['2jn', '2jean', '2 jean'],
  '3JN': ['3jn', '3jean', '3 jean'],
  JUD: ['jd', 'jud', 'jude'],
  REV: ['ap', 'apo', 'apoc', 'apocalypse'],
});

/** Returns localized book title for a book id */
export function getLocalizedBookName(bookId: string, locale: string = 'en'): string {
  const upper = bookId.toUpperCase();
  if (locale === 'fr') {
    return FRENCH_BOOK_NAMES[upper] ?? BIBLE_BOOKS_BY_ID[upper]?.name ?? bookId;
  }
  return BIBLE_BOOKS_BY_ID[upper]?.name ?? bookId;
}

export const stripAccents = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Fast O(1) dictionary indexed by canonical book ID (e.g. 'PHP', 'GEN'). */
export const BIBLE_BOOKS_BY_ID: Readonly<Record<string, BibleBook>> = Object.freeze(
  Object.fromEntries(BIBLE_BOOKS.map((b) => [b.id, b])),
);

function buildPrefixMap(primaryLocale: 'en' | 'fr'): Map<string, BibleBook> {
  const map = new Map<string, BibleBook>();

  const indexBook = (b: BibleBook, isPrimary: boolean) => {
    const frName = FRENCH_BOOK_NAMES[b.id];
    const frAliases = FRENCH_BOOK_ALIASES[b.id] ?? [];
    const enTerms = [b.name.toLowerCase(), ...b.aliases.map((a) => a.toLowerCase())];
    const frTerms = [
      ...(frName ? [frName.toLowerCase(), stripAccents(frName.toLowerCase())] : []),
      ...frAliases.map((a) => a.toLowerCase()),
      ...frAliases.map((a) => stripAccents(a.toLowerCase())),
    ];

    const targetTerms = isPrimary
      ? primaryLocale === 'fr' ? frTerms : enTerms
      : primaryLocale === 'fr' ? enTerms : frTerms;

    for (const term of targetTerms) {
      if (!map.has(term)) map.set(term, b);
      for (let len = 2; len <= term.length; len++) {
        const prefix = term.slice(0, len);
        if (!map.has(prefix)) {
          map.set(prefix, b);
        }
      }
    }
  };

  for (const b of BIBLE_BOOKS) {
    map.set(b.id.toLowerCase(), b);
  }
  for (const b of BIBLE_BOOKS) {
    indexBook(b, true);
  }
  for (const b of BIBLE_BOOKS) {
    indexBook(b, false);
  }

  return map;
}

const BOOK_BY_PREFIX_EN = buildPrefixMap('en');
const BOOK_BY_PREFIX_FR = buildPrefixMap('fr');

/** Matches query string prefix to a Bible book in O(1). */
export function findBookByPrefix(query: string, locale: string = 'en'): BibleBook | undefined {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return undefined;
  const unaccented = stripAccents(q);
  const map = locale === 'fr' ? BOOK_BY_PREFIX_FR : BOOK_BY_PREFIX_EN;
  return map.get(q) ?? map.get(unaccented);
}
