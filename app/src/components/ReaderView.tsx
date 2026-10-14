import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { BIBLE_BOOKS_BY_ID } from '../core/bible-books';
import { loadBook, type ChapterVerse } from '../adapters/book-store';

interface ReaderViewProps {
  book: string;
  chapter: number;
  targetVerse?: number;
  scrollKey?: number;
  onBackToSearch: () => void;
  onOpenSelector: () => void;
  onSaveVerse: (ref: string, text: string) => void;
  onToast: (msg: string) => void;
}

export function ReaderView({
  book,
  chapter,
  targetVerse,
  scrollKey,
  onBackToSearch,
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

  const bookMeta = BIBLE_BOOKS_BY_ID[book];
  const bookTitle = bookMeta ? bookMeta.name : book;

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

  const triggerHaptic = (duration: number = 20) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(duration);
      }
    } catch {
      // Ignore vibration errors if disabled by system policy
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

    triggerHaptic(15);
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

    triggerHaptic(25);
    const citation = `${bookTitle} ${chapter}:${selectedVerse.num}`;
    onSaveVerse(citation, selectedVerse.text);
    onToast(`Saved ${citation} to bookmarks`);
    setSelectedVerse(null);
    setShowActions(false);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleVerseClick = (v: ChapterVerse) => {
    // If clicking a new verse or clicking the same verse, select and highlight it with border
    if (selectedVerse?.num !== v.num) {
      setSelectedVerse(v);
      setShowActions(false);
    }
  };

  const handleTouchStart = (verse: ChapterVerse, e: TouchEvent) => {
    clearLongPressTimer();
    const touch = e.touches[0];
    if (touch) {
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    }
    // Long-press activates the two action buttons on the selected verse
    longPressTimerRef.current = setTimeout(() => {
      setSelectedVerse(verse);
      setShowActions(true);
      triggerHaptic(20);
    }, 450);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    if (touch) {
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 8 || dy > 8) {
        clearLongPressTimer();
      }
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
  };

  return (
    <section id="reader-scroll-container" class="flex-1 flex flex-col overflow-y-auto">
      {/* Reader Navigation Header */}
      <div
        class="px-4 sm:px-6 py-3 border-b flex items-center sticky top-0 z-10 backdrop-blur-md"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={onBackToSearch}
          class="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg transition-opacity hover:opacity-75"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to search</span>
        </button>
      </div>

      {/* Chapter Text */}
      <div class="p-5 sm:p-8 font-serif text-[18px] sm:text-[19px] leading-[1.85] space-y-4 max-w-2xl mx-auto w-full" style={{ color: 'var(--text-main)' }}>
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
          const hasActions = isSelected && showActions;

          return (
            <div key={v.num} class="transition-all">
              <p
                id={`verse-${v.num}`}
                ref={isTarget ? targetVerseRef : undefined}
                onClick={() => handleVerseClick(v)}
                onTouchStart={(e) => handleTouchStart(v, e as unknown as TouchEvent)}
                onTouchMove={(e) => handleTouchMove(e as unknown as TouchEvent)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                class={`cursor-pointer transition-all p-2 rounded-xl scroll-mt-16 select-none ${
                  isTarget ? 'ring-2 ring-amber-500/40' : ''
                } ${isSelected ? 'ring-2 ring-stone-500/40' : ''}`}
                style={{
                  backgroundColor: isTarget ? 'var(--highlight-verse)' : 'transparent',
                }}
              >
                <sup class="text-xs opacity-50 font-sans mr-1 font-normal">
                  {v.num}
                </sup>
                {v.text}
              </p>

              {/* Two buttons revealed directly below the verse on long-press with clear margin */}
              {hasActions && (
                <div
                  class="mt-2 mb-1 flex items-center justify-end gap-2 px-1 animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
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
                    class="px-3 py-1 rounded-lg border text-xs font-sans font-medium transition-all hover:opacity-85 active:scale-95"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      color: 'var(--text-main)',
                    }}
                  >
                    Save
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
