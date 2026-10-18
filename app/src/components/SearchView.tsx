import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AudioNarrator, SearchEngine } from '../core/ports';
import type { NarrationState, NarrationWordBoundary, ScoredPassage } from '../core/types';
import { BIBLE_BOOKS_BY_ID, findBookByPrefix } from '../core/bible-books';
import { resolveVerseText } from '../adapters/book-store';
import type { SavedVerse } from './SavedView';

interface SearchViewProps {
  engine: SearchEngine;
  narrator?: AudioNarrator;
  narrationState?: NarrationState;
  isOnline: boolean;
  isAiEnabled: boolean;
  isInspectorMode: boolean;
  showHeadings?: boolean;
  offlineTextStatus?: 'not_downloaded' | 'downloading' | 'ready';
  hasSeenOnboarding?: boolean;
  savedVerses?: SavedVerse[];
  onOpenStorage?: () => void;
  onDismissOnboarding?: () => void;
  onOpenReader: (book: string, chapter: number, verse: number) => void;
  onSaveVerse?: (verse: {
    book: string;
    bookName: string;
    chapter: number;
    verse: number;
    citation: string;
    text: string;
  }) => void;
  onToast: (message: string) => void;
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

function formatCitation(bookId: string, start: [number, number], end: [number, number]): string {
  const bookName = BIBLE_BOOKS_BY_ID[bookId]?.name ?? bookId;
  const [startCh, startV] = start;
  const [endCh, endV] = end;

  if (startCh === endCh) {
    if (startV === endV) {
      return `${bookName} ${startCh}:${startV}`;
    }
    return `${bookName} ${startCh}:${startV}–${endV}`;
  }
  return `${bookName} ${startCh}:${startV}–${endCh}:${endV}`;
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
  narrator,
  narrationState,
  isOnline,
  isAiEnabled,
  isInspectorMode,
  showHeadings = true,
  offlineTextStatus = 'ready',
  hasSeenOnboarding = true,
  savedVerses,
  onOpenStorage,
  onDismissOnboarding,
  onOpenReader,
  onSaveVerse,
  onToast,
}: SearchViewProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [passages, setPassages] = useState<ScoredPassage[]>([]);
  const [latencyMs, setLatencyMs] = useState(38);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [surroundingVerses, setSurroundingVerses] = useState<
    Record<number, { prev?: string; next?: string }>
  >({});

  const [answerText, setAnswerText] = useState<string>('');
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleApplySuggestion = (text: string) => {
    setQuery(text);

    setAnswerText('');
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(text.length, text.length);
    }
  };

  const isQuestion = isQuestionQuery(query);
  const trimmedLower = query.trim().toLowerCase();
  // Only match book picker if query is strictly a single book name / alias (no chapter numbers or extra words)
  const isExactBookQuery = /^[1-3]?\s*[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+$/.test(trimmedLower);
  const matchedBook = isExactBookQuery ? findBookByPrefix(trimmedLower) : undefined;

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

  useEffect(() => {
    setAnswerText('');
    setIsSynthesizing(false);
  }, [query]);

  useEffect(() => {
    if (expandedCardId === null) return;
    const passage = passages.find((p) => p.chunk.id === expandedCardId);
    if (!passage || surroundingVerses[expandedCardId]) return;

    let isSubscribed = true;
    const book = passage.chunk.book;
    const chStart = passage.chunk.start[0];
    const vStart = passage.chunk.start[1];
    const chEnd = passage.chunk.end[0];
    const vEnd = passage.chunk.end[1];

    void Promise.all([
      vStart > 1 ? resolveVerseText(book, chStart, vStart - 1) : Promise.resolve(undefined),
      resolveVerseText(book, chEnd, vEnd + 1),
    ]).then(([prev, next]) => {
      if (isSubscribed) {
        setSurroundingVerses((curr) => ({
          ...curr,
          [expandedCardId]: { prev, next },
        }));
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [expandedCardId, passages, surroundingVerses]);

  const toggleContext = (id: number) => {
    setExpandedCardId((prev) => (prev === id ? null : id));
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    onToast('Copied to clipboard');
  };

  const handleSynthesize = async () => {
    const trimmed = query.trim();
    if (!trimmed || isSynthesizing) return;
    setIsSynthesizing(true);
    setAnswerText('');

    try {
      let currentPassages = passages;
      if (currentPassages.length === 0) {
        const res = await engine.retrieve(trimmed);
        currentPassages = res.passages;
        setPassages(currentPassages);
      }
      const stream = engine.answers.answer(trimmed, { passages: currentPassages, parsedRefs: [] });
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
    <section class="flex-1 flex flex-col p-4 sm:p-8 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain max-w-2xl mx-auto w-full">
      {/* Offline Storage Status Banner / Super Tiny Reminder */}
      {offlineTextStatus !== 'ready' && (
        !hasSeenOnboarding ? (
          <div
            class="mb-3 px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2.5 animate-fadeIn shrink-0 transition-all bg-amber-500/[0.07] border-amber-500/25"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <svg
                class="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span class="text-[11px] font-medium truncate" style={{ color: 'var(--text-main)' }}>
                Save scripture for offline searches
              </span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenStorage}
                class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Set Up →
              </button>
              {onDismissOnboarding && (
                <button
                  type="button"
                  onClick={onDismissOnboarding}
                  class="p-0.5 rounded-md text-[11px] hover:opacity-75"
                  style={{ color: 'var(--text-muted)' }}
                  title="Dismiss banner"
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
        ) : (
          <div class="flex items-center justify-between mb-2 px-1 text-[11px] shrink-0">
            <button
              type="button"
              onClick={onOpenStorage}
              class="flex items-center gap-1.5 transition-opacity hover:opacity-80 truncate"
              style={{ color: 'var(--text-subtle)' }}
            >
              <svg
                class="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Save scripture for offline searches · Tap to set up →</span>
            </button>
          </div>
        )
      )}

      {/* Search & Question Prompt Box */}
      <div class="relative mb-2 shrink-0">
        <div
          onClick={() => inputRef.current?.focus()}
          class="relative flex items-center rounded-2xl border px-3 py-2.5 transition-all focus-within:ring-2 focus-within:ring-amber-500/30 shadow-sm cursor-text"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            placeholder="Search verses, topics, or questions..."
            class="peer w-full bg-transparent text-sm font-medium outline-none leading-normal placeholder:pl-6 focus:placeholder:pl-6"
            style={{
              color: 'var(--text-main)',
            }}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
                if (isQuestion && isAiEnabled && engine.answers.available && isOnline && !isSynthesizing) {
                  void handleSynthesize();
                }
              }
            }}
          />
          {/* Crisp SVG icon that natively fades out when user types, giving 100% width */}
          <svg
            class="w-4 h-4 shrink-0 absolute left-3 pointer-events-none transition-opacity duration-150 peer-placeholder-shown:opacity-100 opacity-0"
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
          {query.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQuery('');
                setAnswerText('');
                inputRef.current?.focus();
              }}
              class="text-xs p-1 rounded-full hover:opacity-75 shrink-0 ml-1.5"
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

      {/* Scripture Navigator Strip (Compact: appears only when query is purely a book name) */}
      {matchedBook && (
        <div
          class="mb-2.5 px-3 py-2 rounded-xl border flex items-center gap-2.5 animate-fadeIn shrink-0 overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => onOpenReader(matchedBook.id, 1, 1)}
            class="flex items-center gap-1.5 shrink-0 text-xs font-semibold hover:opacity-80 transition-opacity text-left cursor-pointer"
            style={{ color: 'var(--text-main)' }}
            title={`Read ${matchedBook.name} 1:1`}
          >
            <svg
              class="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--accent)' }}
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
            <span class="hover:underline">{matchedBook.name}</span>
            <span class="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
              ({matchedBook.chapters} ch)
            </span>
          </button>

          <div class="h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }} />

          <div class="flex items-center gap-1 overflow-x-auto text-[11px] no-scrollbar py-0.5">
            {Array.from({ length: matchedBook.chapters }, (_, i) => i + 1).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => onOpenReader(matchedBook.id, ch, 1)}
                class="shrink-0 w-6 h-6 rounded-md border flex items-center justify-center font-medium transition-all hover:ring-1 hover:ring-amber-500/40 hover:bg-amber-500/10"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
                title={`Open ${matchedBook.name} ${ch}`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mixed Suggestion Chips */}
      <div class="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 text-xs shrink-0 no-scrollbar">
        <span class="text-[10px] shrink-0 font-medium tracking-wide uppercase" style={{ color: 'var(--text-subtle)' }}>
          Try:
        </span>
        <button
          type="button"
          onClick={() => handleApplySuggestion('Philippians 4:7')}
          class="shrink-0 px-2 py-0.5 rounded-md border text-[11px] transition-opacity hover:opacity-80"
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
          onClick={() => handleApplySuggestion('peace that surpasses')}
          class="shrink-0 px-2 py-0.5 rounded-md border text-[11px] transition-opacity hover:opacity-80"
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
          onClick={() => handleApplySuggestion('What did Jesus teach about worry and peace?')}
          class="shrink-0 px-2 py-0.5 rounded-md border text-[11px] transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          What did Jesus teach about worry?
        </button>
      </div>

      {/* Technical Diagnostics Bar (Shown only in Inspector Mode when a query has run) */}
      {isInspectorMode && query.trim().length > 0 && (
        <div
          class="flex items-center justify-between text-[10px] sm:text-[11px] mb-2.5 px-1 py-1 border-b border-dashed font-mono shrink-0"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-subtle)',
          }}
        >
          <div class="flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>MiniLM-L6 (int8) · 31,102 verses</span>
          </div>
          <span class="text-emerald-600 dark:text-emerald-400 font-semibold">{latencyMs}ms latency</span>
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
            class="text-sm leading-relaxed whitespace-pre-wrap font-serif max-h-72 overflow-y-auto pr-1"
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
          const refString = formatCitation(p.chunk.book, p.chunk.start, p.chunk.end);
          const isSameChapter = p.chunk.start[0] === p.chunk.end[0];
          const isSameVerse = isSameChapter && p.chunk.start[1] === p.chunk.end[1];
          const verseLabel = isSameVerse
            ? `${p.chunk.start[1]}`
            : isSameChapter
            ? `${p.chunk.start[1]}–${p.chunk.end[1]}`
            : `${p.chunk.start[0]}:${p.chunk.start[1]}–${p.chunk.end[0]}:${p.chunk.end[1]}`;

          const primaryHeading =
            showHeadings && p.chunk.headings && p.chunk.headings.length > 0
              ? p.chunk.headings.map(([,, title]) => title).join(' • ')
              : null;

          const isSaved =
            savedVerses?.some(
              (v) =>
                v.book === p.chunk.book &&
                v.chapter === p.chunk.start[0] &&
                v.verse === p.chunk.start[1],
            ) ?? false;

          const surrounding = surroundingVerses[p.chunk.id];
          const segmentId = `chunk-${p.chunk.id}`;
          const isCardActive =
            narrationState?.status !== 'idle' &&
            narrationState?.activeSegment?.id === segmentId;
          const isCardPlaying = isCardActive && narrationState?.status === 'playing';

          return (
            <article
              key={p.chunk.id}
              class={`p-4 rounded-2xl border transition-all hover:shadow-sm ${
                isCardActive ? 'ring-2 ring-amber-500/50' : ''
              }`}
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

                <div class="flex items-center gap-1.5">
                  {narrator?.supported && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isCardActive) {
                          if (isCardPlaying) {
                            narrator.pause();
                          } else {
                            narrator.resume();
                          }
                          return;
                        }
                        narrator.play([
                          {
                            id: segmentId,
                            citation: refString,
                            text: p.chunk.text,
                            book: p.chunk.book,
                            chapter: p.chunk.start[0],
                            verse: p.chunk.start[1],
                          },
                        ]);
                      }}
                      title={isCardPlaying ? 'Pause narration' : 'Listen to passage'}
                      aria-label={isCardPlaying ? `Pause ${refString}` : `Listen to ${refString}`}
                      class="p-1 rounded hover:opacity-75 transition-opacity"
                      style={{ color: isCardActive ? 'var(--text-main)' : 'var(--text-muted)' }}
                    >
                      {isCardPlaying ? (
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                        </svg>
                      ) : (
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                          />
                        </svg>
                      )}
                    </button>
                  )}

                  {onSaveVerse && (
                    <button
                      type="button"
                      onClick={() => {
                        const bookName = BIBLE_BOOKS_BY_ID[p.chunk.book]?.name ?? p.chunk.book;
                        onSaveVerse({
                          book: p.chunk.book,
                          bookName,
                          chapter: p.chunk.start[0],
                          verse: p.chunk.start[1],
                          citation: refString,
                          text: p.chunk.text,
                        });
                      }}
                      title={isSaved ? 'Remove from bookmarks' : 'Save to bookmarks'}
                      class="p-1 rounded hover:opacity-75 transition-opacity"
                      style={{ color: isSaved ? 'var(--text-main)' : 'var(--text-muted)' }}
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
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${refString} - ${p.chunk.text}`)}
                    title="Copy passage citation and text"
                    class="p-1 rounded hover:opacity-75 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
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

              {/* Title & Scripture Citation Hierarchy */}
              <div class="mb-2">
                <h2
                  class="font-serif text-lg font-semibold tracking-tight"
                  style={{ color: 'var(--text-main)' }}
                >
                  {refString}
                </h2>
                {primaryHeading && (
                  <div
                    class="text-xs font-medium mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {primaryHeading}
                  </div>
                )}
              </div>

              <p
                class="font-serif text-[17px] leading-relaxed"
                style={{ color: 'var(--text-main)' }}
              >
                <sup class="text-xs opacity-60 font-sans mr-1 font-semibold">
                  {verseLabel}
                </sup>
                {isCardActive
                  ? renderHighlightedText(p.chunk.text, narrationState?.wordBoundary)
                  : p.chunk.text}
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
                  {surrounding?.prev && (
                    <p class="opacity-70 leading-relaxed">
                      <sup class="text-xs font-sans mr-1 opacity-50 font-normal">
                        {p.chunk.start[1] - 1}
                      </sup>
                      {surrounding.prev}
                    </p>
                  )}
                  <p class="font-medium leading-relaxed" style={{ color: 'var(--text-main)' }}>
                    <sup class="text-xs opacity-60 font-sans mr-1 font-semibold">{verseLabel}</sup>
                    {p.chunk.text}
                  </p>
                  {surrounding?.next && (
                    <p class="opacity-70 leading-relaxed">
                      <sup class="text-xs font-sans mr-1 opacity-50 font-normal">
                        {p.chunk.end[1] + 1}
                      </sup>
                      {surrounding.next}
                    </p>
                  )}
                  {!surrounding && (
                    <div class="text-xs font-sans italic" style={{ color: 'var(--text-muted)' }}>
                      Loading surrounding verses...
                    </div>
                  )}
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
                      p.chunk.book,
                      p.chunk.start[0],
                      p.chunk.start[1],
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
