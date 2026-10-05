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

const nullAnswerProvider: AnswerProvider = {
  available: false,
  async *answer(): AsyncIterable<string> {
    // Retrieval-only in mock mode.
  },
};

/** Mock engine providing realistic retrieval results while offline artifacts build. */
export class MockSearchEngine implements SearchEngine {
  readonly ready: Promise<void> = Promise.resolve();
  readonly answers: AnswerProvider = nullAnswerProvider;

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
