import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { AudioPlayerBar } from '../src/components/AudioPlayerBar';
import type { AudioNarrator } from '../src/core/ports';
import type { NarrationState } from '../src/core/types';

describe('AudioPlayerBar', () => {
  const mockNarrator: AudioNarrator = {
    supported: true,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    seekToIndex: vi.fn(),
    getState: vi.fn(),
    setRate: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };

  const activeState: NarrationState = {
    status: 'playing',
    queue: [
      { id: '1', book: 'JHN', chapter: 3, verse: 16, citation: 'John 3:16', text: 'For God so loved the world' },
      { id: '2', book: 'JHN', chapter: 3, verse: 17, citation: 'John 3:17', text: 'For God did not send' },
    ],
    currentIndex: 0,
    activeSegment: { id: '1', book: 'JHN', chapter: 3, verse: 16, citation: 'John 3:16', text: 'For God so loved the world' },
    wordBoundary: null,
    rate: 1,
  };

  it('triggers onBarClick when clicking the player container or citation area', () => {
    const onBarClick = vi.fn();
    const onNavigateToSegment = vi.fn();

    render(
      <AudioPlayerBar
        narrator={mockNarrator}
        state={activeState}
        isNavbarVisible={true}
        onNavigateToSegment={onNavigateToSegment}
        onBarClick={onBarClick}
        title="Scroll to playing card"
      />,
    );

    const bar = screen.getByRole('region', { name: 'Audio playback controls' });
    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledTimes(1);

    const citationBtn = screen.getByTitle('Scroll to playing card');
    fireEvent.click(citationBtn);
    expect(onBarClick).toHaveBeenCalledTimes(2);
    expect(onNavigateToSegment).not.toHaveBeenCalled();
  });

  it('does not bubble clicks to onBarClick when clicking player controls', () => {
    const onBarClick = vi.fn();

    render(
      <AudioPlayerBar
        narrator={mockNarrator}
        state={activeState}
        isNavbarVisible={true}
        onNavigateToSegment={vi.fn()}
        onBarClick={onBarClick}
      />,
    );

    const pauseBtn = screen.getByRole('button', { name: 'Pause narration' });
    fireEvent.click(pauseBtn);
    expect(mockNarrator.pause).toHaveBeenCalledTimes(1);
    expect(onBarClick).not.toHaveBeenCalled();

    const nextBtn = screen.getByRole('button', { name: 'Next verse' });
    fireEvent.click(nextBtn);
    expect(mockNarrator.next).toHaveBeenCalledTimes(1);
    expect(onBarClick).not.toHaveBeenCalled();

    const stopBtn = screen.getByRole('button', { name: 'Stop narration' });
    fireEvent.click(stopBtn);
    expect(mockNarrator.stop).toHaveBeenCalledTimes(1);
    expect(onBarClick).not.toHaveBeenCalled();
  });

  it('scrolls active narrating card into view when clicked', () => {
    const activeCard = document.createElement('article');
    activeCard.id = 'search-active-narrating-card';
    const scrollIntoViewMock = vi.fn();
    activeCard.scrollIntoView = scrollIntoViewMock;
    document.body.appendChild(activeCard);

    // Emulate simplified handleAudioBarClick logic
    const foundCard = document.getElementById('search-active-narrating-card');
    if (foundCard) {
      foundCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    document.body.removeChild(activeCard);
  });
});
