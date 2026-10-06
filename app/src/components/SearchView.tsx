import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { SearchEngine } from '../core/ports';
import type { ScoredPassage } from '../core/types';
import { findBookByPrefix } from '../core/bible-books';

interface SearchViewProps {
  engine: SearchEngine;
  isInspectorMode: boolean;
  onOpenReader: (book: string, chapter: number, verse: number) => void;
  onOpenSelector: () => void;
  onToast: (message: string) => void;
}

export function SearchView({
  engine,
  isInspectorMode,
  onOpenReader,
  onOpenSelector,
  onToast,
}: SearchViewProps): JSX.Element {
  const [query, setQuery] = useState('peace that surpasses understanding');
  const [passages, setPassages] = useState<ScoredPassage[]>([]);
  const [latencyMs, setLatencyMs] = useState(38);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);

  const matchedBook = findBookByPrefix(query);

  useEffect(() => {
    let isCancelled = false;
    const startTime = performance.now();

    void engine.retrieve(query).then((res) => {
      if (!isCancelled) {
        setPassages(res.passages);
        setLatencyMs(Math.round(performance.now() - startTime));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [engine, query]);

  const toggleContext = (id: number) => {
    setExpandedCardId((prev) => (prev === id ? null : id));
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    onToast('Copied to clipboard');
  };

  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto max-w-2xl mx-auto w-full">
      {/* Search Input Bar */}
      <div class="relative mb-2 shrink-0">
        <div
          class="flex items-center rounded-2xl border px-3.5 py-2.5 transition-all focus-within:ring-2 focus-within:ring-amber-500/30"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <svg
            class="w-4 h-4 mr-2.5 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            placeholder="Search reference, phrase, or topic..."
            class="w-full bg-transparent text-sm font-medium outline-none"
            style={{ color: 'var(--text-main)' }}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <div class="flex items-center gap-1.5 shrink-0">
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                class="text-xs p-1 rounded-full hover:opacity-75"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSelector}
              title="Open Bible book & chapter picker"
              class="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            >
              <span>📖</span>
              <span class="hidden sm:inline">Books</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scripture Navigator Strip (Appears when query matches a book prefix) */}
      {matchedBook && (
        <div
          class="mb-3 p-3 rounded-2xl border flex flex-col gap-2 animate-fadeIn shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-main)' }}>
              <span>📖</span>
              <span>{matchedBook.name}</span>
              <span class="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                ({matchedBook.chapters} chapters)
              </span>
            </span>
            <span class="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
              Tap chapter to jump
            </span>
          </div>

          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {Array.from({ length: matchedBook.chapters }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => onOpenReader(matchedBook.id, ch, 1)}
                class="shrink-0 px-2.5 py-1 rounded-lg border font-medium transition-all hover:ring-2 hover:ring-amber-500/40"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Quick Queries */}
      <div class="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-xs shrink-0">
        <span class="text-[11px] shrink-0 font-medium" style={{ color: 'var(--text-subtle)' }}>
          Try:
        </span>
        <button
          type="button"
          onClick={() => setQuery('Philippians 4:7')}
          class="shrink-0 px-2.5 py-1 rounded-lg border text-xs transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          Philippians 4:7
        </button>
        <button
          type="button"
          onClick={() => setQuery('peace that surpasses')}
          class="shrink-0 px-2.5 py-1 rounded-lg border text-xs transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          peace that surpasses
        </button>
        <button
          type="button"
          onClick={() => setQuery('anxiety and trust')}
          class="shrink-0 px-2.5 py-1 rounded-lg border text-xs transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          anxiety & trust
        </button>
      </div>

      {/* Technical Diagnostics Bar (Shown only in Inspector Mode) */}
      {isInspectorMode && (
        <div
          class="flex items-center justify-between text-[11px] mb-2 px-2 py-1 rounded-lg border text-xs font-mono"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span>MiniLM-L6 (int8) · 31,102 verses</span>
          <span class="text-emerald-600 font-semibold">{latencyMs}ms latency</span>
        </div>
      )}

      {/* Empty Guidance State */}
      {query.trim().length === 0 && (
        <div class="py-16 flex flex-col items-center justify-center text-center animate-fadeIn">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-3 border shadow-sm"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <span>📖</span>
          </div>
          <p class="font-serif text-lg font-semibold mb-1" style={{ color: 'var(--text-main)' }}>
            Search Scripture
          </p>
          <p class="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Search by book & verse reference (e.g. <i>John 3:16</i>), topic, or phrase. Or tap <b>Books</b> above to jump directly to any chapter.
          </p>
        </div>
      )}

      {/* No Results State */}
      {query.trim().length > 0 && passages.length === 0 && (
        <div class="py-16 flex flex-col items-center justify-center text-center animate-fadeIn">
          <p class="font-serif text-base font-semibold mb-1" style={{ color: 'var(--text-main)' }}>
            No matching passages found
          </p>
          <p class="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
            Try checking spelling, searching for a book name, or using broader keywords.
          </p>
        </div>
      )}

      {/* Results Stream */}
      <div class="flex flex-col space-y-3 pb-4">
        {passages.map((p) => {
          const isExpanded = expandedCardId === p.chunk.id;
          const refString = `${p.chunk.start.book} ${p.chunk.start.chapter}:${p.chunk.start.verse}`;

          return (
            <article
              key={p.chunk.id}
              class="p-4 rounded-2xl border transition-all hover:shadow-sm"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {/* Header: Badges & Actions */}
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5">
                  {isInspectorMode && (
                    <span
                      class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          p.source === 'reference'
                            ? 'var(--badge-ref-bg)'
                            : p.source === 'semantic'
                            ? 'var(--badge-sem-bg)'
                            : 'var(--badge-key-bg)',
                        color:
                          p.source === 'reference'
                            ? 'var(--badge-ref-text)'
                            : p.source === 'semantic'
                            ? 'var(--badge-sem-text)'
                            : 'var(--badge-key-text)',
                      }}
                    >
                      {p.source === 'reference'
                        ? 'Exact Reference'
                        : p.source === 'semantic'
                        ? 'Semantic Passage'
                        : 'Keyword Match'}
                    </span>
                  )}
                  {isInspectorMode && (
                    <span class="font-mono text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                      {p.source === 'semantic'
                        ? `cos: ${p.score.toFixed(3)}`
                        : p.source === 'lexical'
                        ? `BM25: ${p.score.toFixed(2)}`
                        : 'RRF #1'}
                    </span>
                  )}
                </div>

                <div class="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span class="font-medium">{refString}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${refString} - ${p.chunk.text}`)}
                    title="Copy verse"
                    class="hover:opacity-75"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Title & Scripture Body */}
              <h2
                class="font-serif text-lg font-semibold mb-1.5 tracking-tight"
                style={{ color: 'var(--text-main)' }}
              >
                {refString}
              </h2>

              <p
                class="font-serif text-[17px] leading-relaxed"
                style={{ color: 'var(--text-main)' }}
              >
                <sup class="text-xs opacity-50 font-sans mr-1 font-normal">
                  {p.chunk.start.verse}
                </sup>
                {p.chunk.text}
              </p>

              {/* Inline Context Accordion */}
              {isExpanded && (
                <div
                  class="mt-3 pt-3 border-t font-serif text-[15px] space-y-2 animate-fadeIn"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <p>
                    <sup class="text-xs opacity-40 font-sans mr-1">
                      {Math.max(1, p.chunk.start.verse - 1)}
                    </sup>
                    In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.
                  </p>
                  <p class="font-medium" style={{ color: 'var(--text-main)' }}>
                    <sup class="text-xs opacity-40 font-sans mr-1">{p.chunk.start.verse}</sup>
                    {p.chunk.text}
                  </p>
                  <p>
                    <sup class="text-xs opacity-40 font-sans mr-1">{p.chunk.start.verse + 1}</sup>
                    Finally, whatever things are true, whatever things are honorable, whatever things are just, think on these things.
                  </p>
                </div>
              )}

              {/* Card Footer Actions */}
              <div
                class="mt-3 flex items-center justify-between pt-2 border-t text-xs"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => toggleContext(p.chunk.id)}
                  class="font-medium flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>{isExpanded ? '– Collapse context' : '+ Expand context'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onOpenReader(
                      p.chunk.start.book,
                      p.chunk.start.chapter,
                      p.chunk.start.verse,
                    )
                  }
                  class="font-medium flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline"
                >
                  <span>Read chapter</span>
                  <span>→</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
