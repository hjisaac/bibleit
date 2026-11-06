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
      artifactStore: mockStore,
      refParser: mockRefParser,
      lexicalIndex: mockLexical,
      queryEmbedder: mockEmbedder,
      vectorIndex: mockVectors,
      ranker: mockRanker,
      answerProvider: mockAnswers,
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
    ports.lexicalIndex.search = vi.fn().mockReturnValue([scoredPassage]);

    const engine = new LocalEngine(ports);
    await engine.ready;

    const result = await engine.retrieve('loved');
    expect(result.origin).toBe(SearchOriginEnum.LOCAL);
    expect(ports.lexicalIndex.search).toHaveBeenCalledWith('loved', 10);
    expect(result.passages).toContainEqual(scoredPassage);
  });

  it('executes sync() successfully', async () => {
    const ports = createMockPorts();
    const engine = new LocalEngine(ports);
    await engine.ready;
    await expect(engine.sync()).resolves.toBeUndefined();
  });

  it('transitions from uninstalled to installed text and returns lexical results on retrieve', async () => {
    let hasVerses = false;
    const testVerses = {
      ROM: [
        [], [], [], [], [], [], [], [], [], [], [], [],
        [
          'Let every soul be in subjection to the higher authorities.',
          'Therefore he who resists the authority, withstands the ordinance of God.',
          'For rulers are not a terror to good work, but to evil.',
          'for he is a servant of God to you for good.',
          'Therefore you need to be in subjection, not only because of the wrath, but also for conscience’ sake.',
          'For this reason you also pay taxes, for they are servants of God’s service, attending continually on this very thing.',
          'Give therefore to everyone what you owe: taxes to whom taxes are due; customs to whom customs; respect to whom respect; honor to whom honor.',
          'Owe no one anything, except to love one another; for he who loves his neighbor has fulfilled the law.',
          'For this, "You shall not commit adultery," "You shall not murder," "You shall not steal," "You shall not give false testimony," "You shall not covet," and whatever other commandments there are, are all summed up in this saying, namely, "You shall love your neighbor as yourself."',
          'Love doesn’t harm a neighbor. Love therefore is the fulfillment of the law.',
        ],
      ],
    };

    const testChunks: Chunk[] = [
      {
        book: 'ROM',
        start: [13, 8],
        end: [13, 10],
        text: '',
      },
    ];

    const store: ArtifactStore = {
      manifest: vi.fn().mockResolvedValue({
        schema_version: '3.0.0',
        text: { translation: 'WEB', total_verses: 10 },
        chunks: { strategy: 'pericope', count: 1 },
        embeddings: { model: 'mock-model', dim: 4, dtype: 'int8', count: 1 },
      }),
      hasVerses: vi.fn(async () => hasVerses),
      hasEmbeddings: vi.fn(async () => false),
      verses: vi.fn(async () => testVerses),
      chunks: vi.fn(async () => testChunks),
      embeddings: vi.fn(async () => ({ data: new ArrayBuffer(0) })),
      clear: vi.fn(async () => {}),
    };

    const { MiniSearchLexicalIndex, RegexRefParser, RrfRanker, NullAnswerProvider } = await import('@bibleit/engine');

    const engine = new LocalEngine({
      artifactStore: store,
      refParser: new RegexRefParser(),
      lexicalIndex: new MiniSearchLexicalIndex(),
      queryEmbedder: {
        modelId: 'mock-model',
        dim: 4,
        load: vi.fn().mockResolvedValue(undefined),
        embed: vi.fn().mockResolvedValue(new Float32Array([0, 0, 0, 0])),
      },
      vectorIndex: {
        build: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockReturnValue([]),
      },
      ranker: new RrfRanker(),
      answerProvider: new NullAnswerProvider(),
    });

    await engine.ready;

    // 1. Cold start with no text installed -> 0 passages
    const coldResult = await engine.retrieve('love your neighbor');
    expect(coldResult.passages).toHaveLength(0);

    // 2. User installs text -> sync engine
    hasVerses = true;
    await engine.sync();

    // 3. Search again -> should return the matching passage!
    const warmResult = await engine.retrieve('love your neighbor');
    expect(warmResult.passages.length).toBeGreaterThan(0);
    expect(warmResult.passages[0]?.chunk.book).toBe('ROM');
    expect(warmResult.passages[0]?.chunk.text).toContain('You shall love your neighbor as yourself');
  });
});

