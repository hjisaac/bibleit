import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { SearchView } from '../src/components/SearchView';
import type { SearchEngine, AudioNarrator } from '../src/core/ports';
import type { ComponentProps } from 'preact';
import type { ScoredPassage } from '../src/core/types';

type SearchViewProps = ComponentProps<typeof SearchView>;

describe('SearchView Result Cards & User Actions', () => {
  let mockEngine: SearchEngine;
  let mockNarrator: AudioNarrator;
  let retrieveSpy: ReturnType<typeof vi.fn>;
  let playSpy: ReturnType<typeof vi.fn>;
  let onSaveVerseSpy: ReturnType<typeof vi.fn>;
  let onOpenReaderSpy: ReturnType<typeof vi.fn>;
  let onToastSpy: ReturnType<typeof vi.fn>;

  const samplePassages: ScoredPassage[] = [
    {
      chunk: {
        id: 42,
        book: 'PHP',
        start: [4, 4],
        end: [4, 7],
        headings: [[4, 4, 'Rejoice in the Lord']],
        text: 'Rejoice in the Lord always. Again I will say, rejoice! Let your gentleness be known to all men.',
      },
      score: 0.95,
      source: 'semantic',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    retrieveSpy = vi.fn().mockResolvedValue({
      query: 'peace and joy',
      passages: samplePassages,
      sources: { reference: [], lexical: [], semantic: samplePassages },
      parsedRefs: [],
    });

    mockEngine = {
      ready: Promise.resolve(),
      retrieve: (...args) => retrieveSpy(...args) as Promise<any>,
      answers: {
        available: false,
        answer: async function* () {},
      },
    };

    playSpy = vi.fn();
    mockNarrator = {
      supported: true,
      play: playSpy,
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      seekToIndex: vi.fn(),
      getState: vi.fn().mockReturnValue({
        status: 'idle',
        queue: [],
        currentIndex: 0,
        activeSegment: null,
        wordBoundary: null,
        rate: 1,
      }),
      setRate: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    };

    onSaveVerseSpy = vi.fn();
    onOpenReaderSpy = vi.fn();
    onToastSpy = vi.fn();
  });

  function renderSearchView(overrides: Partial<SearchViewProps> = {}) {
    // Pre-populate search in localStorage if not already provided
    if (!localStorage.getItem('bibleit_last_search')) {
      localStorage.setItem(
        'bibleit_last_search',
        JSON.stringify({
          query: 'peace and joy',
          passages: samplePassages,
          answerText: '',
        })
      );
    }

    const props: SearchViewProps = {
      engine: mockEngine,
      narrator: mockNarrator,
      isOnline: true,
      isAiEnabled: false,
      isInspectorMode: false,
      showHeadings: true,
      offlineTextStatus: 'ready',
      hasSeenOnboarding: true,
      savedVerses: [],
      onSaveVerse: onSaveVerseSpy,
      onOpenReader: onOpenReaderSpy,
      onToast: onToastSpy,
      ...overrides,
    };
    return render(<SearchView {...props} />);
  }

  it('renders passage citation, heading badge, and passage text', () => {
    renderSearchView();

    expect(screen.getByText('Philippians 4:4–7')).toBeDefined();
    expect(screen.getByText('Rejoice in the Lord')).toBeDefined();
    expect(screen.getByText(/Rejoice in the Lord always/)).toBeDefined();
  });

  it('triggers audio narration with correct passage payload when clicking listen', () => {
    renderSearchView();

    const listenButton = screen.getByLabelText('Listen to Philippians 4:4–7');
    fireEvent.click(listenButton);

    expect(playSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'chunk-PHP:4:4-4:7',
        citation: 'Philippians 4:4–7',
        book: 'PHP',
        chapter: 4,
        verse: 4,
        text: samplePassages[0]!.chunk.text,
      }),
    ]);
  });

  it('triggers onSaveVerse when bookmark button is clicked', () => {
    renderSearchView();

    const bookmarkButton = screen.getByTitle('Save to bookmarks');
    fireEvent.click(bookmarkButton);

    expect(onSaveVerseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        book: 'PHP',
        chapter: 4,
        verse: 4,
        citation: 'Philippians 4:4–7',
      })
    );
  });

  it('navigates to reader view when clicking Read Chapter button', () => {
    renderSearchView();

    const readChapterButton = screen.getByText('Read chapter');
    fireEvent.click(readChapterButton);

    expect(onOpenReaderSpy).toHaveBeenCalledWith('PHP', 4, 4);
  });

  it('copies scripture citation and text to clipboard and triggers toast feedback', async () => {
    const originalClipboard = navigator.clipboard;
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    try {
      renderSearchView();

      const copyButton = screen.getByTitle('Copy passage citation and text');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(writeTextSpy).toHaveBeenCalledWith(
          `Philippians 4:4–7 - ${samplePassages[0]!.chunk.text}`
        );
        expect(onToastSpy).toHaveBeenCalledWith('Copied to clipboard');
      });
    } finally {
      Object.assign(navigator, { clipboard: originalClipboard });
    }
  });

  it('renders passage with collapsed height by default and expands with inside-scroll on toggle', () => {
    renderSearchView();

    const expandBtn = screen.getByText('+ Expand passage');
    expect(expandBtn).toBeDefined();

    // Text container is collapsed to max-h-36 with overflow-hidden
    const textContainer = screen.getByText(/Rejoice in the Lord always/).closest('[class*="transition-[max-height]"]')!;
    expect(textContainer.className).toContain('max-h-36');
    expect(textContainer.className).toContain('overflow-hidden');

    // Click expand
    fireEvent.click(expandBtn);

    // Button label changes to collapse and container becomes max-h-96 with inside scroll
    expect(screen.getByText('– Collapse passage')).toBeDefined();
    expect(textContainer.className).toContain('max-h-96');
    expect(textContainer.className).toContain('overflow-y-auto');
  });

  it('ensures only one card is expanded at a time across multiple results', () => {
    const twoPassages: ScoredPassage[] = [
      samplePassages[0]!,
      {
        chunk: {
          id: 43,
          book: 'ROM',
          start: [13, 8],
          end: [13, 14],
          headings: [[13, 8, 'Love Fulfills the Law']],
          text: 'Owe no one anything, except to love one another; for he who loves his neighbor has fulfilled the law.',
        },
        score: 0.90,
        source: 'semantic',
      },
    ];

    localStorage.setItem(
      'bibleit_last_search',
      JSON.stringify({
        query: 'love and joy',
        passages: twoPassages,
        answerText: '',
      })
    );

    renderSearchView();

    const expandButtons = screen.getAllByText('+ Expand passage');
    expect(expandButtons.length).toBe(2);

    const card1Text = screen.getByText(/Rejoice in the Lord always/).closest('[class*="transition-[max-height]"]')!;
    const card2Text = screen.getByText(/Owe no one anything/).closest('[class*="transition-[max-height]"]')!;

    // Both cards collapsed initially
    expect(card1Text.className).toContain('max-h-36');
    expect(card2Text.className).toContain('max-h-36');

    // 1. Expand Card 1
    fireEvent.click(expandButtons[0]!);
    expect(card1Text.className).toContain('max-h-96');
    expect(card2Text.className).toContain('max-h-36');

    // 2. Expand Card 2 -> Card 1 MUST collapse!
    const expandCard2Btn = screen.getByText('+ Expand passage');
    fireEvent.click(expandCard2Btn);

    expect(card1Text.className).toContain('max-h-36');
    expect(card2Text.className).toContain('max-h-96');
  });

  it('automatically expands card when audio narration starts', () => {
    renderSearchView();

    const textContainer = screen.getByText(/Rejoice in the Lord always/).closest('[class*="transition-[max-height]"]')!;
    expect(textContainer.className).toContain('max-h-36');

    const listenButton = screen.getByLabelText('Listen to Philippians 4:4–7');
    fireEvent.click(listenButton);

    // Audio narration click immediately expands the card
    expect(textContainer.className).toContain('max-h-96');
    expect(textContainer.className).toContain('overflow-y-auto');
  });

  it('renders section headings inline above their scoped verses', () => {
    const multiHeadingPassage: ScoredPassage = {
      chunk: {
        id: 2417,
        book: 'ROM',
        start: [13, 8],
        end: [13, 14],
        headings: [
          [13, 8, 'Love Fulfills the Law'],
          [13, 11, 'The Day Is Near'],
        ],
        text: 'Owe no one anything, except to love one another. Do this, knowing the time, that it is already time.',
      },
      score: 0.95,
      source: 'semantic',
    };

    localStorage.setItem(
      'bibleit_last_search',
      JSON.stringify({
        query: 'love your neighbor',
        passages: [multiHeadingPassage],
        answerText: '',
      })
    );

    renderSearchView();

    // Section 1 heading is rendered inline above the verses
    expect(screen.getByText('Love Fulfills the Law')).toBeDefined();
  });
});
