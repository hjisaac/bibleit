import { describe, it, expect, vi } from 'vitest';
import {
  LocalEngine,
  SearchOriginEnum,
  type ArtifactStore,
  type RefParser,
  type LexicalIndex,
  type QueryEmbedder,
  type VectorIndex,
  type Ranker,
  type AnswerProvider,
  type Chunk,
  type ScoredPassage,
  type LocalEnginePorts,
} from '@bibleit/engine';

describe('LocalEngine', () => {
  function createMockPorts(overrides: Partial<LocalEnginePorts> = {}): LocalEnginePorts {
    const mockStore: ArtifactStore = {
      manifest: vi.fn().mockResolvedValue({
        schema_version: '1.0.0',
        text: { translation: 'BSB', total_verses: 1 },
        chunks: { strategy: 'pericope', count: 1 },
        embeddings: { model: 'mock-model', dim: 4, dtype: 'int8', count: 1 },
      }),
      verses: vi.fn().mockResolvedValue({
        book_index: { JHN: [0, 1] },
        chapter_index: { JHN: [0, 1] },
        verse_index: { JHN: [0, 26] },
        data: 'For God so loved the world',
      }),
      chunks: vi.fn().mockResolvedValue([
        { book: 'JHN', start: [3, 16], end: [3, 16] },
      ]),
      embeddings: vi.fn().mockResolvedValue({
        data: new ArrayBuffer(4),
        scales: new ArrayBuffer(4),
      }),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    const mockRefParser: RefParser = {
      parse: vi.fn().mockReturnValue([]),
    };

    const mockLexical: LexicalIndex = {
      build: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockReturnValue([]),
    };

    const mockEmbedder: QueryEmbedder = {
      modelId: 'mock-model',
      dim: 4,
      load: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3, 0.4])),
    };

    const mockVectors: VectorIndex = {
      build: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockReturnValue([]),
    };

    const mockRanker: Ranker = {
      merge: vi.fn((refs, lexical, semantic) => [...refs, ...lexical, ...semantic]),
    };

    const mockAnswers: AnswerProvider = {
      available: false,
      answer: async function* () {},
    };

    return {
      store: mockStore,
      refParser: mockRefParser,
      lexical: mockLexical,
      embedder: mockEmbedder,
      vectors: mockVectors,
      ranker: mockRanker,
      answers: mockAnswers,
      ...overrides,
    };
  }

  it('instantiates via constructor', async () => {
    const ports = createMockPorts();
    const engine = new LocalEngine(ports);

    expect(engine).toBeInstanceOf(LocalEngine);
  });

  it('returns SearchOriginEnum.LOCAL on retrieve', async () => {
    const ports = createMockPorts();
    const engine = new LocalEngine(ports);
    await engine.ready;

    const result = await engine.retrieve('peace');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
  });

  it('resolves reference searches via parsedRefs', async () => {
    const mockVerseStore = {
      get: vi.fn(),
      has: vi.fn().mockReturnValue(true),
      chapterCount: vi.fn().mockReturnValue(21),
      verseCount: vi.fn().mockReturnValue(36),
      getRange: vi.fn().mockReturnValue('For God so loved the world'),
    };
    const ports = createMockPorts({ verseStore: mockVerseStore });
    ports.refParser.parse = vi.fn().mockReturnValue([
      { start: { book: 'JHN', chapter: 3, verse: 16 } },
    ]);

    const engine = new LocalEngine(ports);
    await engine.ready;

    const result = await engine.retrieve('John 3:16');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages[0]?.chunk.text).toContain('For God so loved the world');
  });

  it('handles lexical and semantic searches through ports', async () => {
    const dummyChunk: Chunk = {
      book: 'JHN',
      start: [3, 16],
      end: [3, 16],
      text: 'For God so loved the world',
    };
    const scoredPassage: ScoredPassage = { chunk: dummyChunk, score: 0.9, source: 'lexical' };

    const ports = createMockPorts();
    ports.lexical.search = vi.fn().mockReturnValue([scoredPassage]);

    const engine = new LocalEngine(ports);
    await engine.ready;

    const result = await engine.retrieve('loved');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
    expect(ports.lexical.search).toHaveBeenCalledWith('loved', 10);
    expect(result.passages).toContainEqual(scoredPassage);
  });

  it('executes sync() successfully', async () => {
    const ports = createMockPorts();
    const engine = new LocalEngine(ports);
    await engine.ready;
    await expect(engine.sync()).resolves.toBeUndefined();
  });
});
