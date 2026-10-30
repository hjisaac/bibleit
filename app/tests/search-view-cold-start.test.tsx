import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { SearchView, MAX_HISTORY_ITEMS } from '../src/components/SearchView';
import { POPULAR_TOPICS } from '../src/core/starter-topics';
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

  it('starts with an empty search input and shows guidance topics without engine retrieval', () => {
    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');

    // Initial mount should NOT trigger engine.retrieve
    expect(retrieveSpy).not.toHaveBeenCalled();

    // Guidance topics should be rendered
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('Popular Topics')).toBeTruthy();
    expect(screen.queryByText('Search Scripture')).toBeNull();
    expect(screen.queryByText(/Search by book & verse reference/)).toBeNull();
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

  it('populates search input when clicking a topic in Panel P, requiring Enter to trigger retrieve', async () => {
    retrieveSpy.mockResolvedValueOnce({
      query: 'Strength and courage',
      passages: [
        {
          chunk: {
            id: 1004,
            book: 'JOS',
            start: [1, 9],
            end: [1, 9],
            text: 'Be strong and courageous!',
          },
          score: 0.98,
          source: 'semantic',
        },
      ],
      sources: { reference: [], lexical: [], semantic: [] },
      parsedRefs: [],
    });

    renderSearchView();

    const targetTopic = POPULAR_TOPICS[1]!; // Strength and courage
    const chip = screen.getByRole('button', { name: targetTopic });
    fireEvent.click(chip);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(targetTopic);
    // Retrieval should not be called until user validates
    expect(retrieveSpy).not.toHaveBeenCalled();

    // User validates with Enter
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(retrieveSpy).toHaveBeenCalledWith(targetTopic);

    await waitFor(() => {
      expect(screen.getByText('Be strong and courageous!')).toBeTruthy();
    });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('bibleit_last_search') || '{}');
      expect(saved.query).toBe(targetTopic);
    });
  });

  it('renders Popular Topics and Recent Searches when search input is empty', async () => {
    localStorage.setItem(
      'bibleit_search_history',
      JSON.stringify(['Psalm 23:1', 'faith and hope']),
    );

    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');

    // Recent Searches, Suggestions, and Popular Topics should all be visible
    expect(screen.getByText('Recent Searches')).toBeTruthy();
    expect(screen.getByText('Psalm 23:1')).toBeTruthy();
    expect(screen.getByText('faith and hope')).toBeTruthy();
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('What did Jesus teach about worry?')).toBeTruthy();
    expect(screen.getByText('Popular Topics')).toBeTruthy();
    expect(screen.getByText('Forgiveness and grace')).toBeTruthy();
  });

  it('populates search input when clicking a recent search or popular topic without immediate retrieve', () => {
    renderSearchView();

    const topicBtn = screen.getByRole('button', { name: 'Comfort in grief' });
    fireEvent.click(topicBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Comfort in grief');
    expect(retrieveSpy).not.toHaveBeenCalled();
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

  it('deduplicates case-insensitively and caps search history at MAX_HISTORY_ITEMS', () => {
    const initialItems = Array.from({ length: MAX_HISTORY_ITEMS }, (_, i) => `item ${i + 1}`);
    localStorage.setItem('bibleit_search_history', JSON.stringify(initialItems));

    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Adding existing item with different casing should bump it to front without duplicate
    fireEvent.input(input, { target: { value: 'ITEM 2' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    let history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history).toHaveLength(MAX_HISTORY_ITEMS);
    expect(history[0]).toBe('ITEM 2');

    // Adding an extra new item should push oldest out
    fireEvent.input(input, { target: { value: 'brand new item' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    history = JSON.parse(localStorage.getItem('bibleit_search_history') || '[]');
    expect(history).toHaveLength(MAX_HISTORY_ITEMS);
    expect(history[0]).toBe('brand new item');
    expect(history).not.toContain(initialItems[initialItems.length - 1]);
  });

  it('verifies that Recent Searches, Suggestions, and Popular Topics appear in order in the DOM', () => {
    localStorage.setItem('bibleit_search_history', JSON.stringify(['Psalm 23:1']));

    renderSearchView();

    const recentHeader = screen.getByText('Recent Searches');
    const suggestionsHeader = screen.getByText('Suggestions');
    const topicsHeader = screen.getByText('Popular Topics');

    // Node.DOCUMENT_POSITION_FOLLOWING (4) means second node appears after first node in DOM
    expect(
      recentHeader.compareDocumentPosition(suggestionsHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      suggestionsHeader.compareDocumentPosition(topicsHeader) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/Search by book & verse reference/)).toBeNull();
  });

  it('populates search input when clicking any popular topic, executing on Enter', () => {
    renderSearchView();

    // Click 'Peace in anxiety' under Popular Topics
    const topicBtn = screen.getByRole('button', { name: 'Peace in anxiety' });
    fireEvent.click(topicBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Peace in anxiety');
    expect(retrieveSpy).not.toHaveBeenCalled();

    // Validate with Enter
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(retrieveSpy).toHaveBeenCalledWith('Peace in anxiety');
  });

  it('toggles collapse and expand on the Scripture Synthesis card allowing user to collapse and reread', async () => {
    const storedState = {
      query: 'What did Jesus teach about worry?',
      passages: [],
      answerText: 'Jesus taught that our Heavenly Father knows all our needs.',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView();

    expect(screen.getByText('Jesus taught that our Heavenly Father knows all our needs.')).toBeTruthy();

    // Click collapse button in header
    const collapseBtn = screen.getByTitle('Collapse overview');
    fireEvent.click(collapseBtn);

    // Text body should now be collapsed / hidden
    expect(screen.queryByText('Jesus taught that our Heavenly Father knows all our needs.')).toBeNull();

    // Click expand button to reread
    const expandBtn = screen.getByTitle('Expand overview');
    fireEvent.click(expandBtn);

    // Text body should be visible again
    expect(screen.getByText('Jesus taught that our Heavenly Father knows all our needs.')).toBeTruthy();
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

    const storedState = {
      query: 'What did Jesus teach about worry?',
      passages: [],
      answerText: 'Jesus taught that our Heavenly Father knows all our needs.',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView({ narrator: mockNarrator });

    const speakerBtn = screen.getByTitle('Listen to synthesis');
    fireEvent.click(speakerBtn);

    expect(playSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'synthesis:overview',
        citation: 'Scripture Synthesis',
        text: 'Jesus taught that our Heavenly Father knows all our needs.',
      }),
    ]);
  });

  it('opens Panel P when focusing the search input on an existing search', () => {
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
      answerText: '',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView();

    // Initially Panel P is closed, results are visible
    expect(screen.queryByText('Suggestions')).toBeNull();
    expect(screen.getByText('For God so loved the world...')).toBeTruthy();

    // Focus input
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);

    // Panel P is now open, old results still unremoved
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('For God so loved the world...')).toBeTruthy();
  });

  it('keeps previous results and shows Panel P when clearing the query', () => {
    const storedState = {
      query: 'John 3:16',
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
      answerText: '',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView();

    const clearBtn = screen.getByTitle('Clear query');
    fireEvent.click(clearBtn);

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    // Old results still in DOM following Panel P
    expect(screen.getByText('Suggestions')).toBeTruthy();
    expect(screen.getByText('For God so loved the world...')).toBeTruthy();
  });

  it('closes Panel P and runs search when Enter key is pressed', () => {
    const storedState = {
      query: 'Old search',
      passages: [],
      answerText: '',
    };
    localStorage.setItem('bibleit_last_search', JSON.stringify(storedState));

    renderSearchView();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    expect(screen.getByText('Suggestions')).toBeTruthy();

    fireEvent.input(input, { target: { value: 'New search' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(retrieveSpy).toHaveBeenCalledWith('New search');
    // Panel P is closed on submit
    expect(screen.queryByText('Suggestions')).toBeNull();
  });
});

