import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { $locale, i18n } from '../stores/i18n';
import { $activeTranslation } from '../stores/preferences';
import { getLocalizedBookName } from '@bibleit/engine';
import { resolveVerseText } from '../adapters/book-store';

export const messages = i18n('saved/view', {
  title: 'Saved Passages',
  subtitle: 'Stored privately in your browser.',
  emptyMessage: 'No saved verses yet. Tap the bookmark icon in search results or long-press a verse in the reader to save passages.',
  removeBookmarkTitle: 'Remove from bookmarks',
  unsaveButton: 'Unsave',
});

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

interface SavedVerseCardProps {
  item: SavedVerse;
  locale: string;
  activeTranslation: string;
  removeBookmarkTitle: string;
  unsaveButton: string;
  onOpenVerse: (verse: SavedVerse) => void;
  onUnsaveVerse?: (verse: SavedVerse) => void;
}

function SavedVerseCard({
  item,
  locale,
  activeTranslation,
  removeBookmarkTitle,
  unsaveButton,
  onOpenVerse,
  onUnsaveVerse,
}: SavedVerseCardProps): JSX.Element {
  const [displayText, setDisplayText] = useState<string>(item.text);

  // Sync displayed text with active translation while preserving fallback to stored text
  useEffect(() => {
    let cancelled = false;
    resolveVerseText(item.book, item.chapter, item.verse, activeTranslation).then((text) => {
      if (!cancelled && text) {
        setDisplayText(text);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.book, item.chapter, item.verse, activeTranslation]);

  const localizedBook = getLocalizedBookName(item.book, locale);
  const citation = `${localizedBook} ${item.chapter}:${item.verse}`;

  return (
    <article
      onClick={() => onOpenVerse(item)}
      class="p-4 rounded-2xl border space-y-1 cursor-pointer hover:shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div class="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span class="font-semibold text-amber-700 dark:text-amber-400">{citation}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnsaveVerse?.(item);
          }}
          title={removeBookmarkTitle}
          class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-lg transition-all hover:opacity-80 active:opacity-60 cursor-pointer"
          style={{ color: 'var(--accent)' }}
        >
          <svg
            class="w-3.5 h-3.5 shrink-0"
            fill="currentColor"
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
          <span>{unsaveButton}</span>
        </button>
      </div>
      <p class="font-serif text-sm leading-relaxed" style={{ color: 'var(--text-main)' }}>
        "{displayText}"
      </p>
    </article>
  );
}

export function SavedView({ savedVerses, onOpenVerse, onUnsaveVerse }: SavedViewProps): JSX.Element {
  const t = useStore(messages);
  const currentLocale = useStore($locale);
  const activeTranslation = useStore($activeTranslation);

  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain space-y-4 max-w-2xl mx-auto w-full">
      <div>
        <h1 class="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
          {t.title}
        </h1>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.subtitle}
        </p>
      </div>

      {savedVerses.length === 0 ? (
        <p
          class="py-8 text-center text-xs leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          {t.emptyMessage}
        </p>
      ) : (
        <div class="flex flex-col space-y-3">
          {savedVerses.map((item) => (
            <SavedVerseCard
              key={item.id}
              item={item}
              locale={currentLocale}
              activeTranslation={activeTranslation}
              removeBookmarkTitle={t.removeBookmarkTitle}
              unsaveButton={t.unsaveButton}
              onOpenVerse={onOpenVerse}
              onUnsaveVerse={onUnsaveVerse}
            />
          ))}
        </div>
      )}
    </section>
  );
}
