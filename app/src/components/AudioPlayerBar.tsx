import type { JSX } from 'preact';
import type { AudioNarrator } from '../core/ports';
import type { NarrationState } from '../core/types';

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

interface AudioPlayerBarProps {
  narrator: AudioNarrator;
  state: NarrationState;
  isNavbarVisible: boolean;
  onNavigateToSegment: (book: string, chapter: number, verse: number) => void;
  onBarClick?: () => void;
  title?: string;
}

export function AudioPlayerBar({
  narrator,
  state,
  isNavbarVisible,
  onNavigateToSegment,
  onBarClick,
  title,
}: AudioPlayerBarProps): JSX.Element | null {
  if (state.status === 'idle' || !state.activeSegment) {
    return null;
  }

  const { activeSegment, status, queue, currentIndex, rate } = state;
  const isPlaying = status === 'playing';
  const hasMultiple = queue.length > 1;

  const handleTogglePlay = () => {
    if (isPlaying) {
      narrator.pause();
    } else {
      narrator.resume();
    }
  };

  const handleCycleRate = () => {
    const idx = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
    const nextRate = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length] ?? 1;
    narrator.setRate(nextRate);
  };

  return (
    <div
      role="region"
      aria-label="Audio playback controls"
      onClick={onBarClick}
      class={`fixed left-3 right-3 max-w-2xl mx-auto z-30 px-3.5 py-2.5 rounded-2xl border shadow-lg flex items-center justify-between gap-2 transition-all duration-300 ease-in-out ${
        onBarClick ? 'cursor-pointer' : ''
      } ${
        isNavbarVisible ? 'bottom-[4.5rem]' : 'bottom-3'
      }`}
      style={{
        backgroundColor: 'var(--bg-surface-elevated)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-main)',
      }}
    >
      {/* Left: Play/Pause + Citation */}
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePlay();
          }}
          aria-label={isPlaying ? 'Pause narration' : 'Resume narration'}
          class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white transition-transform active:scale-95"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {isPlaying ? (
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg class="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onBarClick) {
              onBarClick();
            } else {
              onNavigateToSegment(
                activeSegment.book,
                activeSegment.chapter,
                activeSegment.verse ?? 1,
              );
            }
          }}
          title={title || 'Jump to passage in Reader'}
          class="flex flex-col items-start min-w-0 text-left hover:opacity-80 transition-opacity"
        >
          <span class="text-xs font-semibold font-serif truncate max-w-full">
            {activeSegment.citation}
          </span>
          <span class="text-[10px] font-sans truncate max-w-full" style={{ color: 'var(--text-muted)' }}>
            {hasMultiple
              ? `Verse ${currentIndex + 1} of ${queue.length} · ${isPlaying ? 'Reading aloud' : 'Paused'}`
              : isPlaying
              ? 'Reading passage aloud'
              : 'Paused'}
          </span>
        </button>
      </div>

      {/* Right: Prev / Next / Speed / Stop */}
      <div class="flex items-center gap-1 shrink-0">
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                narrator.prev();
              }}
              disabled={currentIndex <= 0}
              aria-label="Previous verse"
              title="Previous verse"
              class="p-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-30"
              style={{ color: 'var(--text-main)' }}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                narrator.next();
              }}
              disabled={currentIndex >= queue.length - 1}
              aria-label="Next verse"
              title="Next verse"
              class="p-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-30"
              style={{ color: 'var(--text-main)' }}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCycleRate();
          }}
          aria-label={`Playback speed ${rate}x`}
          title="Change playback speed"
          class="px-2 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-main)',
          }}
        >
          {rate}x
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            narrator.stop();
          }}
          aria-label="Stop narration"
          title="Stop narration"
          class="p-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
