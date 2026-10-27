import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { SearchView } from '../src/components/SearchView';
import { STARTER_TOPICS } from '../src/core/starter-topics';
import type { SearchEngine } from '../src/core/ports';
import type { ComponentProps } from 'preact';

type SearchViewProps = ComponentProps<typeof SearchView>;

describe('SearchView Cold Start and Search Persistence', () => {
  let retrieveSpy: ReturnType<typeof vi.fn>;
  let mockEngine: SearchEngine;

  beforeEach(() => {
    localStorage.clear();
    retrieveSpy = vi.fn().mockResolvedValue({
      query: 'test query',
      passages: [],
      sources: { reference: [], lexical: [], semantic: [] },
      parsedRefs: [],
    });

    mockEngine = {
      ready: Promise.resolve(),
      retrieve: (...args) => retrieveSpy(...args) as Promise<any>,
      answers: {
        available: true,
        answer: async function* () {
          yield 'Synthesized test answer';
        },
      },
    };
  });

  function renderSearchView(overrides: Partial<SearchViewProps> = {}) {
    const props: SearchViewProps = {
      engine: mockEngine,
      isOnline: true,
      isAiEnabled: true,
      isInspectorMode: false,
      showHeadings: true,
      offlineTextStatus: 'ready',
      hasSeenOnboarding: true,
      savedVerses: [],
      onOpenReader: vi.fn(),
      onToast: vi.fn(),
      ...overrides,
    };
    return render(<SearchView {...props} />);
  }

  it('populates with a random starter topic on cold start without triggering an initial network/engine retrieval', () => {
    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    const starterQueries = STARTER_TOPICS.map((t) => t.query);
    expect(starterQueries).toContain(input.value);

    // Initial mount should NOT trigger engine.retrieve
    expect(retrieveSpy).not.toHaveBeenCalled();

    // Grounded synthesis card should be rendered
    expect(screen.getByText('Scripture Synthesis')).toBeTruthy();
  });

  it('restores previously saved search state for returning users', () => {
    const storedState = {
      query: 'Saved custom search',
      passages: [
        {
          chunk: {
            id: 9999,
            book: 'JHN',
            start: [3, 16],
            end: [3, 16],
            text: 'For God so loved the world...',
          },
          score: 1.0,
          source: 'reference',
        },
      ],
      answerText: 'Saved synthesis explanation',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Saved custom search');
    expect(screen.getByText('For God so loved the world...')).toBeTruthy();
    expect(screen.getByText('Saved synthesis explanation')).toBeTruthy();
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  it('switches query, passages, and synthesis when clicking a starter topic chip', async () => {
    renderSearchView();

    const targetTopic = STARTER_TOPICS[1]!; // Strength and courage
    const chip = screen.getByRole('button', { name: targetTopic.query });
    fireEvent.click(chip);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(targetTopic.query);
    expect(screen.getByText(targetTopic.answerText)).toBeTruthy();
    expect(screen.getByText(targetTopic.passages[0]!.chunk.text)).toBeTruthy();

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('bibleit_last_search') || '{}');
      expect(saved.query).toBe(targetTopic.query);
      expect(saved.answerText).toBe(targetTopic.answerText);
    });
  });

  it('renders Popular Topics and Recent Searches when search input is cleared', async () => {
    localStorage.setItem(
      'bibleit_search_history',
      JSON.stringify(['Psalm 23:1', 'faith and hope']),
    );

    renderSearchView();

    const clearButton = screen.getByTitle('Clear query');
    fireEvent.click(clearButton);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');

    // Guidance header, Recent Searches, Suggestions, and Popular Topics should all be visible
    expect(screen.getByText('Search Scripture')).toBeTruthy();
    expect(screen.getByText('Recent Searches')).toBeTruthy();
    expect(screen.getByText('Psalm 23:1')).toBeTruthy();
    expect(screen.getByText('faith and hope')).toBeTruthy();
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('What did Jesus teach about worry?')).toBeTruthy();
    expect(screen.getByText('Popular Topics')).toBeTruthy();
    expect(screen.getByText('Forgiveness and grace')).toBeTruthy();
  });

  it('clears recent searches when Clear button is clicked', () => {
    localStorage.setItem('bibleit_search_history', JSON.stringify(['John 1:1']));

    renderSearchView();

    const clearQueryBtn = screen.getByTitle('Clear query');
    fireEvent.click(clearQueryBtn);

    const clearHistoryBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearHistoryBtn);

    expect(screen.queryByText('Recent Searches')).toBeNull();
    expect(JSON.parse(localStorage.getItem('bibleit_search_history') || '[]')).toEqual([]);
  });

  it('populates search when clicking a recent search or popular topic', async () => {
    renderSearchView();

    const clearQueryBtn = screen.getByTitle('Clear query');
    fireEvent.click(clearQueryBtn);

    const topicBtn = screen.getByRole('button', { name: 'Comfort in grief' });
    fireEvent.click(topicBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Comfort in grief');
    expect(retrieveSpy).toHaveBeenCalledWith('Comfort in grief');
  });

  it('records query to search history on Enter key press and onBlur', () => {
    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Proverbs 3:5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    let history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history).toContain('Proverbs 3:5');

    fireEvent.input(input, { target: { value: 'Matthew 5:14' } });
    fireEvent.blur(input);

    history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history[0]).toBe('Matthew 5:14');
  });

  it('shows book navigator on keystroke without calling retrieve until Enter is pressed', () => {
    renderSearchView();
    retrieveSpy.mockClear();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'John' } });

    expect(screen.getByTitle('Read John 1:1')).toBeTruthy();
    expect(retrieveSpy).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(retrieveSpy).toHaveBeenCalledTimes(1);
    expect(retrieveSpy).toHaveBeenCalledWith('John');
  });

  it('deduplicates case-insensitively and caps search history at 6 items', () => {
    localStorage.setItem(
      'bibleit_search_history',
      JSON.stringify(['item 1', 'item 2', 'item 3', 'item 4', 'item 5', 'item 6']),
    );

    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Adding existing item with different casing should bump it to front without duplicate
    fireEvent.input(input, { target: { value: 'ITEM 3' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    let history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history).toHaveLength(6);
    expect(history[0]).toBe('ITEM 3');

    // Adding a 7th new item should push oldest out
    fireEvent.input(input, { target: { value: 'brand new item' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history).toHaveLength(6);
    expect(history[0]).toBe('brand new item');
    expect(history).not.toContain('item 6');
  });

  it('verifies that Recent Searches, Suggestions, and Popular Topics appear before the Guidance footer in the DOM', () => {
    localStorage.setItem('bibleit_search_history', JSON.stringify(['Psalm 23:1']));

    renderSearchView();

    const clearButton = screen.getByTitle('Clear query');
    fireEvent.click(clearButton);

    const recentHeader = screen.getByText('Recent Searches');
    const suggestionsHeader = screen.getByText('Suggestions');
    const topicsHeader = screen.getByText('Popular Topics');
    const guidanceFooter = screen.getByText('Search Scripture');

    // Node.DOCUMENT_POSITION_FOLLOWING (4) means second node appears after first node in DOM
    expect(
      recentHeader.compareDocumentPosition(suggestionsHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      suggestionsHeader.compareDocumentPosition(topicsHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      topicsHeader.compareDocumentPosition(guidanceFooter) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('instantly applies precomputed data without engine retrieve when clicking a popular topic matching a starter topic', () => {
    renderSearchView();

    const clearButton = screen.getByTitle('Clear query');
    fireEvent.click(clearButton);
    retrieveSpy.mockClear();

    // Click 'Peace in anxiety' under Popular Topics (which matches STARTER_TOPICS[0])
    const starterTopic = STARTER_TOPICS[0]!;
    const topicBtn = screen.getByRole('button', { name: starterTopic.query });
    fireEvent.click(topicBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(starterTopic.query);
    expect(screen.getByText(starterTopic.answerText)).toBeTruthy();
    // Engine retrieve should be bypassed for precomputed starter topics
    expect(retrieveSpy).not.toHaveBeenCalled();
  });

  it('toggles collapse and expand on the Scripture Synthesis card allowing user to collapse and reread', () => {
    renderSearchView();

    const starterTopic = STARTER_TOPICS.find((t) => screen.queryByText(t.answerText) !== null)!;
    expect(screen.getByText(starterTopic.answerText)).toBeTruthy();

    // Click collapse button in header
    const collapseBtn = screen.getByTitle('Collapse overview');
    fireEvent.click(collapseBtn);

    // Text body should now be collapsed / hidden
    expect(screen.queryByText(starterTopic.answerText)).toBeNull();

    // Click expand button to reread
    const expandBtn = screen.getByTitle('Expand overview');
    fireEvent.click(expandBtn);

    // Text body should be visible again
    expect(screen.getByText(starterTopic.answerText)).toBeTruthy();
  });

  it('reads the Scripture Synthesis aloud via the speaker button', () => {
    const playSpy = vi.fn();
    const mockNarrator = {
      supported: true,
      play: playSpy,
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      seekToIndex: vi.fn(),
      setRate: vi.fn(),
      getState: () => ({
        status: 'idle' as const,
        queue: [],
        currentIndex: -1,
        activeSegment: null,
        wordBoundary: null,
        rate: 1.0,
      }),
      subscribe: () => () => {},
    };

    renderSearchView({ narrator: mockNarrator });

    const starterTopic = STARTER_TOPICS.find((t) => screen.queryByText(t.answerText) !== null)!;
    const speakerBtn = screen.getByTitle('Listen to synthesis');
    fireEvent.click(speakerBtn);

    expect(playSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'synthesis:overview',
        citation: 'Scripture Synthesis',
        text: starterTopic.answerText,
      }),
    ]);
  });
});

