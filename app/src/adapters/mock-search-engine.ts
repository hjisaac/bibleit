import type { AnswerProvider, SearchEngine } from '../core/ports';
import type { RetrievalResult, ScoredPassage } from '../core/types';

const FIXTURE_PASSAGES: ScoredPassage[] = [
  {
    chunk: {
      id: 1,
      start: { book: 'PHP', chapter: 4, verse: 7 },
      end: { book: 'PHP', chapter: 4, verse: 7 },
      text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
    },
    score: 1.0,
    source: 'reference',
  },
  {
    chunk: {
      id: 2,
      start: { book: 'JHN', chapter: 14, verse: 27 },
      end: { book: 'JHN', chapter: 14, verse: 27 },
      text: 'Peace I leave with you. My peace I give to you; not as the world gives, do I give to you. Don’t let your heart be troubled, neither let it be fearful.',
    },
    score: 0.912,
    source: 'semantic',
  },
  {
    chunk: {
      id: 3,
      start: { book: 'ISA', chapter: 26, verse: 3 },
      end: { book: 'ISA', chapter: 26, verse: 3 },
      text: 'You will keep whoever’s mind is steadfast in perfect peace, because he trusts in you.',
    },
    score: 4.82,
    source: 'lexical',
  },
];

const mockAnswerProvider: AnswerProvider = {
  available: true,
  async *answer(_query: string, _context: RetrievalResult): AsyncIterable<string> {
    const tokens = [
      'According', 'to', 'Scripture,', 'peace', 'is', 'not', 'merely', 'the', 'absence',
      'of', 'conflict,', 'but', 'a', 'gift', 'rooted', 'in', "God's", 'presence.',
      '\n\n',
      'In', 'Philippians 4:7,', 'believers', 'are', 'assured', 'that', "God's",
      'peace,', 'which', 'surpasses', 'all', 'human', 'understanding,', 'guards',
      'both', 'heart', 'and', 'mind.', 'Similarly,', 'Jesus', 'promises', 'His',
      'disciples', 'in', 'John 14:27:', '"Peace', 'I', 'leave', 'with', 'you;',
      'my', 'peace', 'I', 'give', 'to', 'you."',
      '\n\n',
      'Through', 'prayer', 'and', 'trust,', 'this', 'steadfast', 'peace', 'remains',
      'anchored', 'even', 'in', 'adversity', '(Isaiah 26:3).'
    ];
    for (const token of tokens) {
      await new Promise((r) => setTimeout(r, 35));
      yield token + (token.endsWith('\n\n') ? '' : ' ');
    }
  },
};

/** Mock engine providing realistic retrieval results while offline artifacts build. */
export class MockSearchEngine implements SearchEngine {
  readonly ready: Promise<void> = Promise.resolve();
  readonly answers: AnswerProvider = mockAnswerProvider;

  async retrieve(query: string, k: number = 10): Promise<RetrievalResult> {
    // Simulate typical 30ms local dot-product + BM25 latency.
    await new Promise((resolve) => setTimeout(resolve, 35));

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return { passages: [], parsedRefs: [] };
    }

    return {
      passages: FIXTURE_PASSAGES.slice(0, k),
      parsedRefs: [
        {
          start: { book: 'PHP', chapter: 4, verse: 7 },
          end: { book: 'PHP', chapter: 4, verse: 7 },
        },
      ],
    };
  }
}
