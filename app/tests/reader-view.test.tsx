import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { ReaderView } from '../src/components/ReaderView';
import type { AudioNarrator } from '../src/core/ports';
import type { NarrationState } from '../src/core/types';

vi.mock('../src/adapters/book-store', () => ({
  loadBook: vi.fn().mockResolvedValue({
    id: 'PHP',
    name: 'Philippians',
    chapters: {
      '4': [
        { num: 6, text: 'Do not be anxious about anything.' },
        { num: 7, text: 'And the peace of God, which surpasses all understanding.' },
        { num: 8, text: 'Finally, brothers, whatever is true.' },
      ],
    },
  }),
}));

const mockNarrator: AudioNarrator = {
  supported: true,
  play: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  seekToIndex: vi.fn(),
  setRate: vi.fn(),
  getState: () => ({
    status: 'idle',
    queue: [],
    currentIndex: -1,
    activeSegment: null,
    wordBoundary: null,
    rate: 1.0,
  }),
  subscribe: () => () => {},
};

describe('ReaderView - Parallel Border & Saved Verse Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows yellow border on the spoken verse AND in parallel on any tapped verse', async () => {
    const narrationState: NarrationState = {
      status: 'playing',
      queue: [],
      currentIndex: 0,
      rate: 1.0,
      activeSegment: {
        id: 'PHP:4:6',
        citation: 'Philippians 4:6',
        text: 'Do not be anxious about anything.',
        book: 'PHP',
        chapter: 4,
        verse: 6,
      },
      wordBoundary: null,
    };

    render(
      <ReaderView
        book="PHP"
        chapter={4}
        narrator={mockNarrator}
        narrationState={narrationState}
        savedVerses={[]}
        onOpenSelector={vi.fn()}
        onSaveVerse={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    // Wait for verses to load
    await waitFor(() => {
      expect(screen.getByText(/Do not be anxious/i)).toBeTruthy();
    });

    const verse6 = screen.getByText(/Do not be anxious/i).closest('p')!;
    const verse7 = screen.getByText(/And the peace of God/i).closest('p')!;

    // Verse 6 is currently being read aloud -> has yellow ring
    expect(verse6.className).toContain('ring-2 ring-amber-500/50');
    // Verse 7 is not selected yet -> no ring
    expect(verse7.className).not.toContain('ring-2 ring-amber-500/50');

    // User taps verse 7 to focus on it
    fireEvent.click(verse7);

    // BOTH verses now have the yellow border simultaneously in parallel
    expect(verse6.className).toContain('ring-2 ring-amber-500/50');
    expect(verse7.className).toContain('ring-2 ring-amber-500/50');
  });

  it('keeps saved verse quiet when entering reader until long-pressed', async () => {
    const savedVerses = [
      {
        id: '1',
        book: 'PHP',
        bookName: 'Philippians',
        chapter: 4,
        verse: 7,
        citation: 'Philippians 4:7',
        text: 'And the peace of God, which surpasses all understanding.',
        savedAt: Date.now(),
      },
    ];

    const onSaveVerse = vi.fn();

    render(
      <ReaderView
        book="PHP"
        chapter={4}
        targetVerse={7}
        narrator={mockNarrator}
        savedVerses={savedVerses}
        onOpenSelector={vi.fn()}
        onSaveVerse={onSaveVerse}
        onToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/And the peace of God/i)).toBeTruthy();
    });

    const verse7 = screen.getByText(/And the peace of God/i).closest('p')!;

    // Saved verse entering reader: NO yellow ring, NO yellow background highlight
    expect(verse7.className).not.toContain('ring-2 ring-amber-500/50');
    expect(verse7.style.backgroundColor).toBe('transparent');

    // No action buttons visible yet
    expect(screen.queryByRole('button', { name: /Unsave/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Copy/i })).toBeNull();

    // User long-presses (context menu) the saved verse
    fireEvent.contextMenu(verse7);

    // Yellow border appears upon interaction
    expect(verse7.className).toContain('ring-2 ring-amber-500/50');

    // Action buttons appear with logical "Unsave" button
    const unsaveButton = screen.getByRole('button', { name: /Unsave/i });
    expect(unsaveButton).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy/i })).toBeTruthy();

    // Clicking Unsave triggers onSaveVerse with verse details
    fireEvent.click(unsaveButton);
    expect(onSaveVerse).toHaveBeenCalledWith(
      expect.objectContaining({
        book: 'PHP',
        chapter: 4,
        verse: 7,
      }),
    );
  });

  it('shows "Save" button when long-pressing an unsaved verse', async () => {
    render(
      <ReaderView
        book="PHP"
        chapter={4}
        narrator={mockNarrator}
        savedVerses={[]}
        onOpenSelector={vi.fn()}
        onSaveVerse={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Do not be anxious/i)).toBeTruthy();
    });

    const verse6 = screen.getByText(/Do not be anxious/i).closest('p')!;

    // Long press on unsaved verse via mouse/touch events
    fireEvent.mouseDown(verse6, { button: 0, clientX: 100, clientY: 100 });
    // Advance timer past 400ms
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save/i })).toBeTruthy();
    });

    const saveButton = screen.getByRole('button', { name: /Save/i });
    expect(saveButton).toBeTruthy();
    expect(saveButton.textContent).toContain('Save');
  });

  it('immediately applies border on the very first click without needing a second click', async () => {
    render(
      <ReaderView
        book="PHP"
        chapter={4}
        narrator={mockNarrator}
        savedVerses={[]}
        onOpenSelector={vi.fn()}
        onSaveVerse={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Do not be anxious/i)).toBeTruthy();
    });

    const verse6 = screen.getByText(/Do not be anxious/i).closest('p')!;
    expect(verse6.className).not.toContain('ring-2 ring-amber-500/50');

    // First tap / click
    fireEvent.click(verse6);

    // Border MUST be present on first click!
    expect(verse6.className).toContain('ring-2 ring-amber-500/50');
  });

  it('keeps action buttons open when user releases after long-press', async () => {
    render(
      <ReaderView
        book="PHP"
        chapter={4}
        narrator={mockNarrator}
        savedVerses={[]}
        onOpenSelector={vi.fn()}
        onSaveVerse={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Do not be anxious/i)).toBeTruthy();
    });

    const verse6 = screen.getByText(/Do not be anxious/i).closest('p')!;

    // Mouse down initiates long press
    fireEvent.mouseDown(verse6, { button: 0, clientX: 50, clientY: 50 });

    // After 400ms, buttons appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save/i })).toBeTruthy();
    });

    // Mouse up and synthetic click when user lifts finger / mouse
    fireEvent.mouseUp(verse6);
    fireEvent.click(verse6);

    // Buttons MUST STILL be visible (not dismissed by release click)
    expect(screen.getByRole('button', { name: /Save/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy/i })).toBeTruthy();
  });
});
