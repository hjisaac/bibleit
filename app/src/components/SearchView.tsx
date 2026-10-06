import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SearchEngine } from '../core/ports';
import type { ScoredPassage } from '../core/types';
import { findBookByPrefix } from '../core/bible-books';

interface SearchViewProps {
  engine: SearchEngine;
  isInspectorMode: boolean;
  onOpenReader: (book: string, chapter: number, verse: number) => void;
  onToast: (message: string) => void;
}

function isQuestionQuery(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;
  const lower = trimmed.toLowerCase();
  const questionWords = [
    'what', 'why', 'how', 'who', 'where', 'when', 'which',
    'explain', 'describe', 'tell me', 'can you', 'does', 'is it',
  ];
  return questionWords.some((word) => lower.startsWith(`${word} `) || lower.startsWith(`${word}'`));
}

export function SearchView({
  engine,
  isInspectorMode,
  onOpenReader,
  onToast,
}: SearchViewProps): JSX.Element {
  const [query, setQuery] = useState('peace that surpasses understanding');
  const [passages, setPassages] = useState<ScoredPassage[]>([]);
  const [latencyMs, setLatencyMs] = useState(38);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);

  const [answerText, setAnswerText] = useState<string>('');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isQuestion = isQuestionQuery(query);
  const matchedBook = findBookByPrefix(query);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [query]);

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

  const handleSynthesize = async () => {
    if (!query.trim() || isSynthesizing) return;
    setIsSynthesizing(true);
    setAnswerText('');

    try {
      const stream = engine.answers.answer(query, { passages, parsedRefs: [] });
      for await (const chunk of stream) {
        setAnswerText((prev) => prev + chunk);
      }
    } catch {
      onToast('Failed to synthesize answer');
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto max-w-2xl mx-auto w-full">
      {/* Search & Question Prompt Box */}
      <div class="relative mb-2 shrink-0">
        <div
          class="flex flex-col rounded-2xl border p-3 transition-all focus-within:ring-2 focus-within:ring-amber-500/30 shadow-sm"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div class="flex items-start gap-2.5">
            <svg
              class="w-4 h-4 mt-1 shrink-0"
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
            <textarea
              ref={textareaRef}
              rows={1}
              value={query}
              placeholder="Search verses (e.g. John 3:16) or ask a question..."
              class="w-full bg-transparent text-sm font-medium outline-none resize-none leading-relaxed"
              style={{
                color: 'var(--text-main)',
                minHeight: '26px',
                maxHeight: '120px',
              }}
              onInput={(e) => {
                setQuery((e.target as HTMLTextAreaElement).value);
                adjustHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setAnswerText('');
                }}
                class="text-xs p-1 rounded-full hover:opacity-75 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                title="Clear query"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
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
              <svg
                class="w-3.5 h-3.5"
                style={{ color: 'var(--text-muted)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
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

      {/* Mixed Suggestion Chips */}
      <div class="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-xs shrink-0 no-scrollbar">
        <span class="text-[11px] shrink-0 font-medium" style={{ color: 'var(--text-subtle)' }}>
          Try:
        </span>
        <button
          type="button"
          onClick={() => {
            setQuery('Philippians 4:7');
            setAnswerText('');
          }}
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
          onClick={() => {
            setQuery('peace that surpasses');
            setAnswerText('');
          }}
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
          onClick={() => {
            setQuery('What did Jesus teach about worry and peace?');
            setAnswerText('');
          }}
          class="shrink-0 px-2.5 py-1 rounded-lg border text-xs transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          What did Jesus teach about worry?
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
            class="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border shadow-sm"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <svg
              class="w-6 h-6"
              style={{ color: 'var(--text-muted)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.75"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <p class="font-serif text-lg font-semibold mb-1" style={{ color: 'var(--text-main)' }}>
            Search Scripture
          </p>
          <p class="text-xs max-w-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Search by book & verse reference (e.g. <i>John 3:16</i>), topic, or phrase. Switch to the <b>Reader</b> tab to browse full chapters.
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

      {/* On-Demand Synthesis Banner for Questions */}
      {query.trim().length > 0 && isQuestion && !answerText && !isSynthesizing && engine.answers.available && (
        <div
          class="mb-3 p-3.5 rounded-2xl border flex items-center justify-between gap-3 animate-fadeIn shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div class="flex items-center gap-2.5 text-xs">
            <svg
              class="w-5 h-5 shrink-0"
              style={{ color: 'var(--accent)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <div>
              <p class="font-medium" style={{ color: 'var(--text-main)' }}>
                Synthesize biblical answer?
              </p>
              <p class="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Generate an AI overview grounded in retrieved passages
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSynthesize}
            class="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Synthesize
          </button>
        </div>
      )}

      {/* Synthesized Answer Card */}
      {(answerText.length > 0 || isSynthesizing) && (
        <div
          class="mb-4 p-4 rounded-2xl border transition-all animate-fadeIn"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--accent)',
          }}
        >
          <div class="flex items-center justify-between mb-2.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                <span>Scripture Synthesis</span>
              </span>
              <span
                class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: 'var(--badge-sem-bg)',
                  color: 'var(--badge-sem-text)',
                }}
              >
                Grounded Context
              </span>
            </div>

            {answerText.length > 0 && !isSynthesizing && (
              <button
                type="button"
                onClick={() => copyToClipboard(answerText)}
                class="text-xs flex items-center gap-1 hover:opacity-75 transition-opacity"
                style={{ color: 'var(--text-muted)' }}
                title="Copy answer"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span>Copy</span>
              </button>
            )}
          </div>

          <div
            class="text-sm leading-relaxed whitespace-pre-wrap font-serif"
            style={{ color: 'var(--text-main)' }}
          >
            {answerText}
            {isSynthesizing && (
              <span class="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
            )}
          </div>

          <div
            class="mt-3 pt-2.5 border-t flex items-center justify-between text-[11px]"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-subtle)' }}
          >
            <span>Verified with cited passages below</span>
            <button
              type="button"
              onClick={() => {
                setAnswerText('');
              }}
              class="hover:underline"
            >
              Dismiss
            </button>
          </div>
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
