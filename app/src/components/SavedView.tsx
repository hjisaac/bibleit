import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

export interface SavedVerse {
  id: string;
  book: string;
  bookName: string;
  chapter: number;
  verse: number;
  citation: string;
  text: string;
  savedAt: number;
}

interface SavedViewProps {
  savedVerses: SavedVerse[];
  onOpenVerse: (verse: SavedVerse) => void;
  onUnsaveVerse?: (verse: SavedVerse) => void;
}

export function SavedView({ savedVerses, onOpenVerse, onUnsaveVerse }: SavedViewProps): JSX.Element {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain space-y-4 max-w-2xl mx-auto w-full">
      <div>
        <h1 class="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
          Saved Passages
        </h1>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          Stored privately in your browser.
        </p>
      </div>

      {savedVerses.length === 0 ? (
        <p
          class="py-8 text-center text-xs leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          No saved verses yet. Tap the bookmark icon in search results or long-press a verse in the reader to save passages.
        </p>
      ) : (
        <div class="flex flex-col space-y-3">
          {savedVerses.map((item) => (
            <article
              key={item.id}
              onClick={() => onOpenVerse(item)}
              class="p-4 rounded-2xl border space-y-1 cursor-pointer hover:shadow-sm transition-all"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div class="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span class="font-semibold text-amber-700 dark:text-amber-400">{item.citation}</span>
                {confirmId === item.id ? (
                  <div class="flex items-center gap-1.5 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                    <span class="text-[11px] font-medium text-red-600 dark:text-red-400">Unsave?</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(null);
                        onUnsaveVerse?.(item);
                      }}
                      class="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(null);
                      }}
                      class="px-2 py-0.5 rounded text-[10px] font-semibold border hover:opacity-75 transition-opacity cursor-pointer"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(item.id);
                    }}
                    title="Remove from saved passages"
                    class="p-1 -mr-1 rounded hover:opacity-75 transition-opacity flex items-center justify-center cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                      />
                      <line
                        x1="3"
                        y1="3"
                        x2="21"
                        y2="21"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <p class="font-serif text-sm leading-relaxed" style={{ color: 'var(--text-main)' }}>
                "{item.text}"
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
