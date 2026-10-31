import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { AudioNarrator, SearchEngine } from '../core/ports';
import { getChunkKey, type NarrationSegment, type NarrationState, type NarrationWordBoundary, type ScoredPassage } from '../core/types';
import { BIBLE_BOOKS_BY_ID, findBookByPrefix } from '../core/bible-books';
import { resolveVerseText } from '../adapters/book-store';
import { POPULAR_TOPICS, SEARCH_SUGGESTIONS } from '../core/starter-topics';
import type { SavedVerse } from './SavedView';
import {
  $searchHistory,
  $lastSearch,
  addSearchHistory,
  MAX_HISTORY_ITEMS,
  SEARCH_HISTORY_KEY,
  SEARCH_STORAGE_KEY,
} from '../stores/search';

export { MAX_HISTORY_ITEMS, SEARCH_HISTORY_KEY, SEARCH_STORAGE_KEY };

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

function buildPassageSegments(passageList: ScoredPassage[]): NarrationSegment[] {
  return passageList.map((p) => {
    const key = getChunkKey(p.chunk);
    return {
      id: `chunk-${key}`,
      citation: formatCitation(p.chunk.book, p.chunk.start, p.chunk.end),
      text: p.chunk.text,
      book: p.chunk.book,
      chapter: p.chunk.start[0],
      verse: p.chunk.start[1],
    };
  });
}


interface ChunkSectionView {
  heading?: string;
  scope: string;
  text: string;
}

function getChunkSectionViews(
  p: ScoredPassage,
  splitIdx?: number,
): ChunkSectionView[] {
  const headings = p.chunk.headings;
  const isSameChapter = p.chunk.start[0] === p.chunk.end[0];
  const isSameVerse = isSameChapter && p.chunk.start[1] === p.chunk.end[1];
  const fullScope = isSameVerse
    ? `${p.chunk.start[1]}`
    : isSameChapter
    ? `${p.chunk.start[1]}–${p.chunk.end[1]}`
    : `${p.chunk.start[0]}:${p.chunk.start[1]}–${p.chunk.end[0]}:${p.chunk.end[1]}`;

  if (!headings || headings.length <= 1) {
    return [
      {
        heading: headings?.[0]?.[2],
        scope: fullScope,
        text: p.chunk.text,
      },
    ];
  }

  // Multi-heading passages (e.g. Romans 13:8-14)
  if (splitIdx && splitIdx > 0 && splitIdx < p.chunk.text.length) {
    const h1 = headings[0]!;
    const h2 = headings[1]!;
    return [
      {
        heading: h1[2],
        scope: `${p.chunk.start[1]}–${h2[1] - 1}`,
        text: p.chunk.text.slice(0, splitIdx).trim(),
      },
      {
        heading: h2[2],
        scope: `${h2[1]}–${p.chunk.end[1]}`,
        text: p.chunk.text.slice(splitIdx).trim(),
      },
    ];
  }

  return [
    {
      heading: headings[0]![2],
      scope: fullScope,
      text: p.chunk.text,
    },
  ];
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
  const [initialSearch] = useState(() => $lastSearch.get());
  const [query, setQuery] = useState(initialSearch.query);
  const [passages, setPassages] = useState<ScoredPassage[]>(initialSearch.passages);
  const [isPanelOpen, setIsPanelOpen] = useState(
    initialSearch.query.trim().length === 0 ||
      (initialSearch.passages.length === 0 && initialSearch.answerText.trim().length === 0),
  );
  const lastSubmittedQueryRef = useRef(initialSearch.query);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [surroundingVerses, setSurroundingVerses] = useState<
    Record<string, { prev?: string; next?: string }>
  >({});
  const [splitPoints, setSplitPoints] = useState<Record<string, number>>({});

  const [answerText, setAnswerText] = useState<string>(initialSearch.answerText);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isSynthesisCollapsed, setIsSynthesisCollapsed] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(initialSearch.passages.length > 0);
  const searchHistory = useStore($searchHistory);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchRunIdRef = useRef(0);

  const runSearch = (targetQuery: string) => {
    const trimmed = targetQuery.trim();
    const runId = ++searchRunIdRef.current;
    if (!trimmed) {
      setPassages([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    void engine
      .retrieve(trimmed)
      .then((res) => {
        if (searchRunIdRef.current === runId) {
          setPassages(res.passages);
        }
      })
      .catch((err) => {
        console.error('[Search Error]:', err);
        onToast('Search failed: ' + (err instanceof Error ? err.message : String(err)));
      })
      .finally(() => {
        if (searchRunIdRef.current === runId) {
          setIsSearching(false);
        }
      });
  };

  const addQueryToHistory = (rawQuery: string) => {
    addSearchHistory(rawQuery);
  };

  const handleSelectQuery = (text: string) => {
    setQuery(text);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(text.length, text.length);
    }
  };

  const handleSubmit = (e?: Event) => {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    addQueryToHistory(trimmed);
    lastSubmittedQueryRef.current = trimmed;
    setIsPanelOpen(false);
    inputRef.current?.blur();
    if (isQuestion && isAiEnabled && engine.answers.available && isOnline && !isSynthesizing) {
      void handleSynthesize();
    } else {
      runSearch(trimmed);
    }
  };

  const isQuestion = isQuestionQuery(query);
  const matchedBook = findBookByPrefix(query);

  useEffect(() => {
    $lastSearch.set({ query, passages, answerText });
  }, [query, passages, answerText]);

  useEffect(() => {
    if (expandedCardKey === null) return;
    const passage = passages.find((p) => getChunkKey(p.chunk) === expandedCardKey);
    if (!passage || surroundingVerses[expandedCardKey]) return;

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
          [expandedCardKey]: { prev, next },
        }));
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [expandedCardKey, passages, surroundingVerses]);

  useEffect(() => {
    const multi = passages.filter((p) => p.chunk.headings && p.chunk.headings.length > 1);
    if (multi.length === 0) return;

    let isSubscribed = true;
    for (const p of multi) {
      const key = getChunkKey(p.chunk);
      if (splitPoints[key] !== undefined) continue;
      const h2 = p.chunk.headings![1]!;
      void resolveVerseText(p.chunk.book, h2[0], h2[1]).then((vText) => {
        if (!isSubscribed || !vText) return;
        const snippet = vText.trim().slice(0, 20);
        const idx = p.chunk.text.indexOf(snippet);
        if (idx > 0) {
          setSplitPoints((prev) => ({ ...prev, [key]: idx }));
        }
      });
    }

    return () => {
      isSubscribed = false;
    };
  }, [passages, splitPoints]);

  useEffect(() => {
    const activeId = narrationState?.activeSegment?.id;
    if (activeId?.startsWith('chunk-')) {
      const activeChunkKey = activeId.slice(6);
      setExpandedCardKey(activeChunkKey);
      const activeCard = document.getElementById('search-active-narrating-card');
      if (activeCard && typeof activeCard.scrollIntoView === 'function') {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [narrationState?.activeSegment?.id]);

  const toggleContext = (key: string) => {
    setExpandedCardKey((prev) => (prev === key ? null : key));
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    onToast('Copied to clipboard');
  };

  const handleSynthesize = async () => {
    const trimmed = query.trim();
    if (!trimmed || isSynthesizing) return;
    lastSubmittedQueryRef.current = trimmed;
    setIsPanelOpen(false);
    setIsSynthesizing(true);
    setAnswerText('');
    setIsSynthesisCollapsed(false);

    try {
      const res = await engine.retrieve(trimmed);
      setPassages(res.passages);
      const stream = engine.answers.answer(trimmed, res);
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
    <section class="flex-1 flex flex-col px-4 sm:px-8 pt-4 sm:pt-5 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain max-w-2xl mx-auto w-full">
      {/* Offline Storage Status Banner / Super Tiny Reminder */}
      {offlineTextStatus !== 'ready' && (
        !hasSeenOnboarding ? (
          <div
            class="mb-3.5 sm:mb-4 px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2.5 animate-fadeIn shrink-0 transition-all bg-amber-500/[0.07] border-amber-500/25"
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
          <div class="flex items-center justify-between mb-3.5 sm:mb-4 px-1 text-[11px] shrink-0">
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
      <form onSubmit={handleSubmit} action="javascript:void(0)" class="relative mb-2 shrink-0">
        <div
          onClick={() => inputRef.current?.focus()}
          class="relative flex items-center rounded-2xl border px-3 py-2.5 transition-all focus-within:ring-2 focus-within:ring-amber-500/30 shadow-sm cursor-text"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="submit"
            aria-label="Search"
            class="w-5 h-5 shrink-0 flex items-center justify-center mr-2 hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            {isSearching ? (
              <div class="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            ) : (
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            )}
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            placeholder="Search verses, topics, or questions..."
            class="w-full bg-transparent text-sm font-medium outline-none leading-normal pl-0 pr-2"
            style={{
              color: 'var(--text-main)',
            }}
            onFocus={() => {
              setIsPanelOpen(true);
            }}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setIsPanelOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.keyCode === 13) {
                handleSubmit(e);
              }
            }}
            onBlur={() => {
              addQueryToHistory(query);
            }}
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                searchRunIdRef.current++;
                setQuery('');
                setHasSearched(false);
                setIsPanelOpen(true);
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
      </form>

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


      {/* Guidance Panel P (Shown on cold start or when search is focused/empty) */}
      {isPanelOpen && (
        <div class="py-3 mb-2 flex flex-col gap-4 animate-fadeIn">
          {/* Recent Searches */}
          {searchHistory.length > 0 && (
            <div>
              <div class="mb-2">
                <span class="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-subtle)' }}>
                  Recent Searches
                </span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleSelectQuery(item)}
                    class="px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1.5 transition-all hover:opacity-80"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div>
            <div class="mb-2">
              <span class="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-subtle)' }}>
                Suggestions
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {SEARCH_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSelectQuery(suggestion)}
                  class="px-2.5 py-1 rounded-lg border text-xs transition-all hover:opacity-80"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-main)',
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Popular Topics */}
          <div>
            <div class="mb-2">
              <span class="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-subtle)' }}>
                Popular Topics
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {POPULAR_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleSelectQuery(topic)}
                  class="px-2.5 py-1 rounded-lg border text-xs transition-all hover:opacity-80"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                    color: 'var(--text-main)',
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Search Loading State */}
      {isSearching && (
        <div class="py-12 flex flex-col items-center justify-center text-center animate-fadeIn">
          <div class="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mb-2" />
          <p class="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Searching scripture...
          </p>
        </div>
      )}

      {/* No Results State */}
      {!isPanelOpen && !isSearching && hasSearched && query.trim().length > 0 && passages.length === 0 && (
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
      {(answerText.length > 0 || isSynthesizing) && (() => {
        const isSynthesisActive =
          narrationState?.status !== 'idle' &&
          narrationState?.activeSegment?.id === 'synthesis:overview';
        const isSynthesisPlaying = isSynthesisActive && narrationState?.status === 'playing';

        const handleToggleSynthesisNarration = () => {
          if (!narrator || !narrator.supported || !answerText) return;
          if (isSynthesisActive) {
            if (isSynthesisPlaying) {
              narrator.pause();
            } else {
              narrator.resume();
            }
            return;
          }
          const firstPassage = passages[0];
          narrator.play([
            {
              id: 'synthesis:overview',
              citation: 'Scripture Synthesis',
              text: answerText,
              book: firstPassage?.chunk.book ?? 'GEN',
              chapter: firstPassage?.chunk.start[0] ?? 1,
              verse: firstPassage?.chunk.start[1] ?? 1,
            },
          ]);
        };

        return (
          <div
            id={isSynthesisActive ? 'search-active-narrating-card' : undefined}
            data-segment-id="synthesis:overview"
            class={`mb-4 p-4 rounded-2xl border transition-all animate-fadeIn ${
              isSynthesisActive ? 'ring-2 ring-amber-500/50' : ''
            }`}
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--accent)',
            }}
          >
            <div
              class={`flex items-center justify-between ${
                isSynthesisCollapsed ? 'mb-0 cursor-pointer' : 'mb-2.5'
              }`}
              onClick={isSynthesisCollapsed ? () => setIsSynthesisCollapsed(false) : undefined}
            >
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

              <div class="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {narrator?.supported && answerText.length > 0 && !isSynthesizing && (
                  <button
                    type="button"
                    onClick={handleToggleSynthesisNarration}
                    title={isSynthesisPlaying ? 'Pause narration' : 'Listen to synthesis'}
                    aria-label={
                      isSynthesisPlaying ? 'Pause Scripture Synthesis' : 'Listen to Scripture Synthesis'
                    }
                    class="p-1 rounded hover:opacity-75 transition-opacity"
                    style={{ color: isSynthesisActive ? 'var(--text-main)' : 'var(--text-muted)' }}
                  >
                    {isSynthesisPlaying ? (
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

                {answerText.length > 0 && !isSynthesizing && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(answerText)}
                    class="p-1 rounded hover:opacity-75 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                    title="Copy answer"
                    aria-label="Copy Scripture Synthesis"
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
                )}
              </div>
            </div>

            {!isSynthesisCollapsed && (
              <div
                class="text-sm leading-relaxed whitespace-pre-wrap font-serif max-h-72 overflow-y-auto pr-1"
                style={{ color: 'var(--text-main)' }}
              >
                {isSynthesisActive
                  ? renderHighlightedText(answerText, narrationState?.wordBoundary)
                  : answerText}
                {isSynthesizing && (
                  <span class="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
                )}
              </div>
            )}

            {/* Card Footer Actions aligned with passage cards */}
            <div class="mt-2.5 flex items-center justify-between text-xs">
              {answerText.length > 0 && !isSynthesizing ? (
                <button
                  type="button"
                  onClick={() => setIsSynthesisCollapsed(!isSynthesisCollapsed)}
                  class="font-medium flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                  title={isSynthesisCollapsed ? 'Expand overview' : 'Collapse overview'}
                  aria-label={
                    isSynthesisCollapsed
                      ? 'Expand Scripture Synthesis'
                      : 'Collapse Scripture Synthesis'
                  }
                >
                  <span>{isSynthesisCollapsed ? '+ Expand overview' : '– Collapse overview'}</span>
                </button>
              ) : (
                <span />
              )}

              <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                Verified with cited passages below
              </span>
            </div>
          </div>
        );
      })()}

      {/* Results Stream */}
      <div class="flex flex-col space-y-3 pb-4">
        {passages.map((p, cardIdx) => {
          const chunkKey = getChunkKey(p.chunk);
          const isExpanded = expandedCardKey === chunkKey;
          const refString = formatCitation(p.chunk.book, p.chunk.start, p.chunk.end);
          const sections = getChunkSectionViews(p, splitPoints[chunkKey]);

          const isSaved =
            savedVerses?.some(
              (v) =>
                v.book === p.chunk.book &&
                v.chapter === p.chunk.start[0] &&
                v.verse === p.chunk.start[1],
            ) ?? false;

          const surrounding = surroundingVerses[chunkKey];
          const segmentId = `chunk-${chunkKey}`;
          const isCardActive =
            narrationState?.status !== 'idle' &&
            narrationState?.activeSegment?.id === segmentId;
          const isCardPlaying = isCardActive && narrationState?.status === 'playing';

          return (
            <article
              key={chunkKey}
              id={isCardActive ? 'search-active-narrating-card' : undefined}
              data-segment-id={segmentId}
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
                        ? `BM25 (rrf): ${p.score.toFixed(4)}`
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
                        setExpandedCardKey(chunkKey);
                        const segments = buildPassageSegments(passages);
                        narrator.play(segments, cardIdx);
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
              <div class="mb-1.5">
                <h2
                  class="font-serif text-lg font-semibold tracking-tight"
                  style={{ color: 'var(--text-main)' }}
                >
                  {refString}
                </h2>
              </div>

              <div
                class={`relative font-serif text-[17px] leading-relaxed transition-[max-height] duration-300 ease-in-out ${
                  isExpanded
                    ? 'max-h-96 sm:max-h-[30rem] overflow-y-auto overscroll-contain pr-1 py-1'
                    : 'max-h-36 overflow-hidden'
                }`}
                style={{
                  maskImage: isExpanded
                    ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 24px), transparent 100%)'
                    : 'linear-gradient(to bottom, black 60%, transparent 100%)',
                  WebkitMaskImage: isExpanded
                    ? 'linear-gradient(to bottom, transparent 0%, black 20px, black calc(100% - 24px), transparent 100%)'
                    : 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }}
              >
                {isExpanded && surrounding?.prev && (
                  <p class="opacity-70 leading-relaxed mb-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
                    <sup class="text-xs font-sans mr-1 opacity-50 font-normal">
                      {p.chunk.start[1] - 1}
                    </sup>
                    {surrounding.prev}
                  </p>
                )}

                {sections.map((sec, secIdx) => {
                  let secCharOffset = 0;
                  for (let i = 0; i < secIdx; i++) {
                    secCharOffset += (sections[i]?.text.length ?? 0) + 1;
                  }
                  const secBoundary: NarrationWordBoundary | null = narrationState?.wordBoundary
                    ? {
                        charIndex: narrationState.wordBoundary.charIndex - secCharOffset,
                        charLength: narrationState.wordBoundary.charLength,
                      }
                    : null;

                  return (
                    <div key={secIdx} class="mb-3 last:mb-0">
                      {showHeadings && sec.heading && (
                        <div class="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                          {sec.heading}
                        </div>
                      )}
                      <p style={{ color: 'var(--text-main)' }}>
                        <sup class="text-xs opacity-60 font-sans mr-1 font-semibold">
                          {sec.scope}
                        </sup>
                        {isCardActive
                          ? renderHighlightedText(sec.text, secBoundary)
                          : sec.text}
                      </p>
                    </div>
                  );
                })}

                {isExpanded && surrounding?.next && (
                  <p class="opacity-70 leading-relaxed mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
                    <sup class="text-xs font-sans mr-1 opacity-50 font-normal">
                      {p.chunk.end[1] + 1}
                    </sup>
                    {surrounding.next}
                  </p>
                )}

                {isExpanded && !surrounding && (
                  <div class="text-xs font-sans italic mt-1" style={{ color: 'var(--text-muted)' }}>
                    Loading surrounding verses...
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div class="mt-2.5 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => toggleContext(chunkKey)}
                  class="font-medium flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>{isExpanded ? '– Collapse passage' : '+ Expand passage'}</span>
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
