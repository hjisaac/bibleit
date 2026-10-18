import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { BIBLE_BOOKS_BY_ID } from '../core/bible-books';
import type { AudioNarrator } from '../core/ports';
import type { NarrationSegment, NarrationState, NarrationWordBoundary } from '../core/types';
import { loadBook, type ChapterVerse } from '../adapters/book-store';
import type { SavedVerse } from './SavedView';

interface ReaderViewProps {
  book: string;
  chapter: number;
  targetVerse?: number;
  scrollKey?: number;
  narrator?: AudioNarrator;
  narrationState?: NarrationState;
  savedVerses?: SavedVerse[];
  onOpenSelector: () => void;
  onSaveVerse: (verse: {
    book: string;
    bookName: string;
    chapter: number;
    verse: number;
    citation: string;
    text: string;
  }) => void;
  onToast: (msg: string) => void;
}

function renderHighlightedText(
  text: string,
  boundary: NarrationWordBoundary | null | undefined,
): JSX.Element | string {
  if (!boundary || boundary.charLength <= 0 || boundary.charIndex >= text.length) {
    return text;
  }
  const start = Math.max(0, boundary.charIndex);
  const end = Math.min(text.length, start + boundary.charLength);
  return (
    <>
      {text.slice(0, start)}
      <mark
        class="rounded px-0.5 font-medium transition-colors"
        style={{ backgroundColor: 'var(--badge-sem-bg)', color: 'var(--badge-sem-text)' }}
      >
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

export function ReaderView({
  book,
  chapter,
  targetVerse,
  scrollKey,
  narrator,
  narrationState,
  savedVerses,
  onOpenSelector,
  onSaveVerse,
  onToast,
}: ReaderViewProps): JSX.Element {
  const [verses, setVerses] = useState<ChapterVerse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<ChapterVerse | null>(null);
  const [showActions, setShowActions] = useState<boolean>(false);
  const targetVerseRef = useRef<HTMLParagraphElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  const bookMeta = BIBLE_BOOKS_BY_ID[book];
  const bookTitle = bookMeta ? bookMeta.name : book;

  const isChapterActive =
    narrationState?.status !== 'idle' &&
    narrationState?.activeSegment?.book === book &&
    narrationState?.activeSegment?.chapter === chapter &&
    narrationState?.activeSegment?.id.startsWith(`${book}:${chapter}:`);
  const activeSpokenVerse = isChapterActive ? narrationState?.activeSegment?.verse : undefined;

  useEffect(() => {
    let isCancelled = false;
    const chKey = String(chapter);

    setIsLoading(true);
    setLoadError(null);

    loadBook(book)
      .then((data) => {
        if (!isCancelled) {
          setVerses(data.chapters[chKey] || []);
          setIsLoading(false);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error(`Error loading book ${book}:`, err);
          setLoadError(`Unable to load ${bookTitle} Chapter ${chapter}. Check internet or download offline text in Settings.`);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [book, chapter]);

  useEffect(() => {
    if (targetVerse === undefined) {
      return;
    }

    const timer = setTimeout(() => {
      if (targetVerse <= 1) {
        const container = document.getElementById('reader-scroll-container');
        if (container) {
          container.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
      const el = document.getElementById(`verse-${targetVerse}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 70);

    return () => clearTimeout(timer);
  }, [targetVerse, verses, scrollKey, book, chapter]);

  useEffect(() => {
    if (activeSpokenVerse === undefined) return;
    const el = document.getElementById(`verse-${activeSpokenVerse}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSpokenVerse]);


  const triggerHaptic = (pattern: number | number[] = 20) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Silently ignore vibration restrictions
    }
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Clipboard writeText failed, falling back to execCommand:', err);
      }
    }

    // Fallback using textarea for insecure contexts / mobile restrictions
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (fallbackErr) {
      console.error('Fallback clipboard copy failed:', fallbackErr);
      return false;
    }
  };

  const handleCopy = (e?: Event) => {
    e?.stopPropagation();
    if (!selectedVerse) return;

    triggerHaptic(20);
    const citation = `${bookTitle} ${chapter}:${selectedVerse.num}`;
    const textToCopy = `${citation} - ${selectedVerse.text}`;

    void copyTextToClipboard(textToCopy).then((success) => {
      if (success) {
        onToast(`Copied ${citation}`);
      } else {
        onToast(`Unable to copy automatically`);
      }
    });
  };

  const handleSave = (e?: Event) => {
    e?.stopPropagation();
    if (!selectedVerse) return;

    triggerHaptic(20);
    const citation = `${bookTitle} ${chapter}:${selectedVerse.num}`;
    onSaveVerse({
      book,
      bookName: bookTitle,
      chapter,
      verse: selectedVerse.num,
      citation,
      text: selectedVerse.text,
    });
    setSelectedVerse(null);
    setShowActions(false);
  };

  const buildChapterSegments = (): NarrationSegment[] =>
    verses.map((v) => ({
      id: `${book}:${chapter}:${v.num}`,
      citation: `${bookTitle} ${chapter}:${v.num}`,
      text: v.text,
      book,
      chapter,
      verse: v.num,
    }));

  const handleListenChapter = () => {
    if (!narrator || !narrator.supported) {
      onToast('Speech synthesis is not supported on this device');
      return;
    }
    if (isChapterActive) {
      if (narrationState?.status === 'playing') {
        narrator.pause();
      } else {
        narrator.resume();
      }
      return;
    }
    const segments = buildChapterSegments();
    const startIdx = selectedVerse
      ? Math.max(0, verses.findIndex((v) => v.num === selectedVerse.num))
      : 0;
    narrator.play(segments, startIdx);
  };

  const handleListenFromVerse = (e?: Event) => {
    e?.stopPropagation();
    if (!selectedVerse || !narrator || !narrator.supported) return;
    triggerHaptic(20);
    const segments = buildChapterSegments();
    const startIdx = Math.max(0, verses.findIndex((v) => v.num === selectedVerse.num));
    narrator.play(segments, startIdx);
    setShowActions(false);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleVerseClick = (v: ChapterVerse, e?: JSX.TargetedMouseEvent<HTMLParagraphElement>) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    e?.stopPropagation();
    // Toggle selection: tap to select/focus; tap again to deselect
    if (selectedVerse?.num === v.num && !showActions) {
      setSelectedVerse(null);
    } else {
      setSelectedVerse(v);
      setShowActions(false);
    }
  };

  const handleTouchStart = (verse: ChapterVerse, e: JSX.TargetedTouchEvent<HTMLParagraphElement>) => {
    clearLongPressTimer();
    isLongPressTriggeredRef.current = false;
    const touch = e.touches[0];
    if (touch) {
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    }
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setSelectedVerse(verse);
      setShowActions(true);
      triggerHaptic(20);
    }, 400);
  };

  const handleTouchMove = (e: JSX.TargetedTouchEvent<HTMLParagraphElement>) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    if (touch) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 12 || dy > 12) {
        clearLongPressTimer();
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
  };

  const handleMouseDown = (verse: ChapterVerse, e: JSX.TargetedMouseEvent<HTMLParagraphElement>) => {
    if (e.button !== 0) return;
    clearLongPressTimer();
    isLongPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setSelectedVerse(verse);
      setShowActions(true);
      triggerHaptic(20);
    }, 450);
  };

  const handleMouseUp = () => {
    clearLongPressTimer();
  };

  return (
    <section
      id="reader-scroll-container"
      class="flex-1 flex flex-col overflow-y-auto overscroll-y-contain"
      onClick={() => {
        setSelectedVerse(null);
        setShowActions(false);
      }}
    >
      {/* Chapter Text */}
      <div class="p-5 sm:p-8 pb-32 sm:pb-32 font-serif text-[18px] sm:text-[19px] leading-[1.85] space-y-4 max-w-2xl mx-auto w-full" style={{ color: 'var(--text-main)' }}>
        <div class="flex flex-col items-center mb-6">
          <button
            type="button"
            onClick={onOpenSelector}
            title="Tap to select book or chapter"
            class="group inline-flex items-center justify-center gap-2.5 px-4 py-1.5 rounded-2xl transition-all hover:bg-stone-500/10 active:scale-[0.98]"
          >
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-center font-serif" style={{ color: 'var(--text-main)' }}>
              {bookTitle} Chapter {chapter}
            </h1>
            <svg
              class="w-5 h-5 transition-transform group-hover:translate-y-0.5 opacity-40 group-hover:opacity-80"
              style={{ color: 'var(--text-main)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <span class="text-[11px] font-sans mt-0.5 tracking-wide font-normal" style={{ color: 'var(--text-subtle)' }}>
            Tap to change book & chapter
          </span>

          {narrator?.supported && !isLoading && !loadError && verses.length > 0 && (
            <button
              type="button"
              onClick={handleListenChapter}
              class="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border text-xs font-sans font-medium transition-all hover:opacity-85 active:scale-95"
              style={{
                borderColor: isChapterActive ? 'var(--accent)' : 'var(--border-subtle)',
                backgroundColor: isChapterActive ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                color: 'var(--text-main)',
              }}
            >
              {isChapterActive && narrationState?.status === 'playing' ? (
                <>
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                  </svg>
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                  <span>{isChapterActive && narrationState?.status === 'paused' ? 'Resume' : 'Listen'}</span>
                </>
              )}
            </button>
          )}
        </div>

        {isLoading && (
          <div class="py-12 text-center text-sm font-sans" style={{ color: 'var(--text-muted)' }}>
            Loading chapter text...
          </div>
        )}

        {loadError && (
          <div class="p-4 rounded-xl text-center text-sm font-sans bg-amber-500/10 text-amber-600 border border-amber-500/20">
            {loadError}
          </div>
        )}

        {!isLoading && !loadError && verses.length === 0 && (
          <div class="py-12 text-center text-sm font-sans" style={{ color: 'var(--text-muted)' }}>
            No verses found for this chapter.
          </div>
        )}

        {!isLoading && !loadError && verses.map((v) => {
          const isTarget = targetVerse === v.num;
          const isSelected = selectedVerse?.num === v.num;
          const isSpeaking = activeSpokenVerse === v.num;
          const isSaved = savedVerses?.some(
            (sv) => sv.book === book && sv.chapter === chapter && sv.verse === v.num,
          );
          const hasActions = isSelected && showActions;
          // Spoken verse and any tapped/focused verse show yellow border in parallel
          const hasYellowBorder = isSpeaking || isSelected;

          return (
            <div key={v.num} class="transition-all">
              <p
                id={`verse-${v.num}`}
                ref={isTarget ? targetVerseRef : undefined}
                tabIndex={0}
                onClick={(e) => handleVerseClick(v, e)}
                onFocus={() => {
                  if (selectedVerse?.num !== v.num) {
                    setSelectedVerse(v);
                    setShowActions(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedVerse(v);
                    setShowActions(true);
                    triggerHaptic(20);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  isLongPressTriggeredRef.current = true;
                  setSelectedVerse(v);
                  setShowActions(true);
                  triggerHaptic(20);
                }}
                onTouchStart={(e) => handleTouchStart(v, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onMouseDown={(e) => handleMouseDown(v, e)}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                class={`cursor-pointer transition-all p-2 rounded-xl scroll-mt-16 select-none outline-none ${
                  hasYellowBorder ? 'ring-2 ring-amber-500/50' : ''
                }`}
                style={{
                  backgroundColor: isTarget && !isSaved ? 'var(--highlight-verse)' : 'transparent',
                  WebkitTouchCallout: 'none',
                }}
              >
                <sup class="text-xs opacity-50 font-sans mr-1 font-normal">
                  {v.num}
                </sup>
                {isSpeaking
                  ? renderHighlightedText(v.text, narrationState?.wordBoundary)
                  : v.text}
              </p>

              {/* Action buttons revealed directly below the verse on long-press */}
              {hasActions && (
                <div
                  class="mt-2 mb-1 flex items-center justify-end gap-2 px-1 animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  {narrator?.supported && (
                    <button
                      type="button"
                      onClick={(e) => handleListenFromVerse(e)}
                      class="px-3 py-1 rounded-lg border text-xs font-sans font-medium transition-all hover:opacity-85 active:scale-95"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        backgroundColor: 'var(--bg-surface-elevated)',
                        color: 'var(--text-main)',
                      }}
                    >
                      Listen from here
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleCopy(e)}
                    class="px-3 py-1 rounded-lg border text-xs font-sans font-medium transition-all hover:opacity-85 active:scale-95"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      color: 'var(--text-main)',
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSave(e)}
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-sans font-medium transition-all hover:opacity-85 active:scale-95"
                    style={{
                      borderColor: isSaved ? '#D97706' : 'var(--border-subtle)',
                      backgroundColor: isSaved ? 'rgba(217, 119, 6, 0.12)' : 'var(--bg-surface-elevated)',
                      color: isSaved ? '#D97706' : 'var(--text-main)',
                    }}
                    title={isSaved ? 'Remove from bookmarks' : 'Save to bookmarks'}
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill={isSaved ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                      />
                    </svg>
                    <span>{isSaved ? 'Unsave' : 'Save'}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

