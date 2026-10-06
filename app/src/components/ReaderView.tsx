import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { BIBLE_BOOKS } from '../core/bible-books';

interface ReaderViewProps {
  book: string;
  chapter: number;
  targetVerse?: number;
  onBackToSearch: () => void;
  onOpenSelector: () => void;
  onSaveVerse: (ref: string, text: string) => void;
  onToast: (msg: string) => void;
}

interface ChapterVerse {
  num: number;
  text: string;
}

interface BookData {
  id: string;
  name: string;
  chapters: Record<string, ChapterVerse[]>;
}

const bookCache = new Map<string, BookData>();

export function ReaderView({
  book,
  chapter,
  targetVerse,
  onBackToSearch,
  onOpenSelector,
  onSaveVerse,
  onToast,
}: ReaderViewProps): JSX.Element {
  const [verses, setVerses] = useState<ChapterVerse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<ChapterVerse | null>(null);
  const targetVerseRef = useRef<HTMLParagraphElement | null>(null);

  const bookMeta = BIBLE_BOOKS.find((b) => b.id === book);
  const bookTitle = bookMeta ? bookMeta.name : book;

  useEffect(() => {
    let isCancelled = false;
    const chKey = String(chapter);

    const applyData = (data: BookData) => {
      if (!isCancelled) {
        setVerses(data.chapters[chKey] || []);
        setIsLoading(false);
        setLoadError(null);
      }
    };

    if (bookCache.has(book)) {
      applyData(bookCache.get(book)!);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const url = `${import.meta.env.BASE_URL}data/books/${book}.json`;
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load ${book} (${res.status})`);
        }
        return res.json();
      })
      .then((data: BookData) => {
        bookCache.set(book, data);
        applyData(data);
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error(`Error loading book ${book}:`, err);
          setLoadError(`Unable to load ${bookTitle} Chapter ${chapter}.`);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [book, chapter]);

  useEffect(() => {
    if (targetVerse && targetVerseRef.current) {
      targetVerseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [targetVerse, verses]);

  const handleCopy = () => {
    if (selectedVerse) {
      void navigator.clipboard.writeText(`${book} ${chapter}:${selectedVerse.num} - ${selectedVerse.text}`);
      onToast(`Copied ${book} ${chapter}:${selectedVerse.num}`);
    }
  };

  const handleSave = () => {
    if (selectedVerse) {
      onSaveVerse(`${book} ${chapter}:${selectedVerse.num}`, selectedVerse.text);
      onToast(`Saved ${book} ${chapter}:${selectedVerse.num}`);
      setSelectedVerse(null);
    }
  };

  return (
    <section class="flex-1 flex flex-col overflow-y-auto">
      {/* Reader Navigation Header */}
      <div
        class="px-5 py-3 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-md"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={onOpenSelector}
          title="Change book or chapter"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold hover:opacity-80 transition-opacity"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-main)',
          }}
        >
          <span>{bookTitle} {chapter}</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onBackToSearch}
          class="text-xs font-medium hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Back to search
        </button>
      </div>

      {/* Chapter Text */}
      <div class="p-5 sm:p-8 font-serif text-[18px] sm:text-[19px] leading-[1.85] space-y-4 max-w-2xl mx-auto w-full" style={{ color: 'var(--text-main)' }}>
        <h1 class="text-xl font-bold tracking-tight mb-6 text-center">
          {bookTitle} Chapter {chapter}
        </h1>

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

          return (
            <p
              key={v.num}
              ref={isTarget ? targetVerseRef : undefined}
              onClick={() => setSelectedVerse(v)}
              class={`cursor-pointer transition-all p-2 rounded-xl ${
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
          );
        })}
      </div>

      {/* Verse Action Tray */}
      {selectedVerse && (
        <div
          class="px-5 py-3 border-t flex items-center justify-between sticky bottom-0 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span class="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
            Verse {selectedVerse.num} selected
          </span>
          <div class="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleCopy}
              class="px-2.5 py-1 rounded-lg border font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
              }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleSave}
              class="px-2.5 py-1 rounded-lg border font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSelectedVerse(null)}
              class="p-1 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
