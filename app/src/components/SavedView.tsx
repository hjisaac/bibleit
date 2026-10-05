import { h, type JSX } from 'preact';

export interface SavedVerse {
  id: string;
  ref: string;
  text: string;
}

interface SavedViewProps {
  savedVerses: SavedVerse[];
  onOpenVerse: (ref: string) => void;
}

export function SavedView({ savedVerses, onOpenVerse }: SavedViewProps): JSX.Element {
  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto space-y-4 max-w-2xl mx-auto w-full">
      <div>
        <h1 class="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
          Saved Passages
        </h1>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          Stored privately in your browser.
        </p>
      </div>

      {savedVerses.length === 0 ? (
        <div
          class="p-6 text-center rounded-2xl border text-xs"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          No saved verses yet. In the reader or search results, tap Save to bookmark passages.
        </div>
      ) : (
        <div class="flex flex-col space-y-3">
          {savedVerses.map((item) => (
            <article
              key={item.id}
              onClick={() => onOpenVerse(item.ref)}
              class="p-4 rounded-2xl border space-y-1 cursor-pointer hover:shadow-sm transition-all"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div class="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span class="font-semibold text-amber-700 dark:text-amber-400">{item.ref}</span>
                <span class="text-[10px]">Saved</span>
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
