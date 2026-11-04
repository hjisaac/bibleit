import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { SavedView, type SavedVerse } from '../src/components/SavedView';

const mockVerses: SavedVerse[] = [
  {
    id: 'JHN.3.16',
    book: 'JHN',
    bookName: 'John',
    chapter: 3,
    verse: 16,
    citation: 'John 3:16',
    text: 'For God so loved the world...',
    savedAt: 1234567890,
  },
];

describe('SavedView Component', () => {
  it('renders saved verses and handles inline unsave confirmation', () => {
    const handleOpen = vi.fn();
    const handleUnsave = vi.fn();

    render(
      <SavedView
        savedVerses={mockVerses}
        onOpenVerse={handleOpen}
        onUnsaveVerse={handleUnsave}
      />,
    );

    expect(screen.getByText('John 3:16')).toBeTruthy();
    expect(screen.getByText('"For God so loved the world..."')).toBeTruthy();

    const unbookmarkBtn = screen.getByTitle('Remove from saved passages');
    expect(unbookmarkBtn).toBeTruthy();

    // Clicking unbookmark should reveal inline confirmation without navigating
    fireEvent.click(unbookmarkBtn);
    expect(handleOpen).not.toHaveBeenCalled();
    expect(screen.getByText('Unsave?')).toBeTruthy();

    // Clicking Cancel restores icon
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(handleUnsave).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsave?')).toBeNull();

    // Clicking unbookmark again and confirming with Yes
    fireEvent.click(screen.getByTitle('Remove from saved passages'));
    const yesBtn = screen.getByText('Yes');
    fireEvent.click(yesBtn);

    expect(handleUnsave).toHaveBeenCalledWith(mockVerses[0]);
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it('triggers onOpenVerse when tapping anywhere else on the card', () => {
    const handleOpen = vi.fn();

    render(
      <SavedView
        savedVerses={mockVerses}
        onOpenVerse={handleOpen}
      />,
    );

    fireEvent.click(screen.getByText('John 3:16'));
    expect(handleOpen).toHaveBeenCalledWith(mockVerses[0]);
  });

  it('renders clean unboxed empty state message when no verses are saved', () => {
    render(<SavedView savedVerses={[]} onOpenVerse={vi.fn()} />);

    expect(
      screen.getByText(/Tap the bookmark icon in search results or long-press a verse in the reader/i),
    ).toBeTruthy();
  });
});
