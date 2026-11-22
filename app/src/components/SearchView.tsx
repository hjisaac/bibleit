import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import type { AudioNarrator, SearchEngine, Telemetry } from '../core/ports';
import {
  DEFAULT_TRANSLATION,
  getChunkKey,
  PackageStatusEnum,
  type NarrationSegment,
  type NarrationState,
  type NarrationWordBoundary,
  SearchOriginEnum,
  type ScoredPassage,
} from '../core/types';
import { findBookByPrefix, formatCitation, getLocalizedBookName } from '@bibleit/engine';
import { resolvePassageText, resolveVerseText } from '../adapters/book-store';
import { getPopularTopics, getSearchSuggestions } from '../core/starter-topics';
import type { SavedVerse } from './SavedView';
import {
  $searchHistory,
  $lastSearch,
  addSearchHistory,
  MAX_HISTORY_ITEMS,
  SEARCH_HISTORY_KEY,
  SEARCH_STORAGE_KEY,
} from '../stores/search';
import { ScriptureOverviewCard } from './ScriptureOverviewCard';
import type { VoteDirection } from '../core/types';
import { $locale, i18n, isOnDeviceSupported } from '../stores/i18n';
import { $activeTranslation, $telemetryEnabled } from '../stores/preferences';
import { params } from '@nanostores/i18n';
import en from '../locales/en.json';

export const messages = i18n('search/view', {
  ...en['search/view'],
  readBookAria: params<{ book: string }>(en['search/view'].readBookAria),
  openChapterAria: params<{ book: string; ch: number }>(en['search/view'].openChapterAria),
  pauseRefAria: params<{ ref: string }>(en['search/view'].pauseRefAria),
  listenRefAria: params<{ ref: string }>(en['search/view'].listenRefAria),
  toastSearchFailed: params<{ message: string }>(en['search/view'].toastSearchFailed),
});

export { MAX_HISTORY_ITEMS, SEARCH_HISTORY_KEY, SEARCH_STORAGE_KEY };

interface SearchViewProps {
  engine: SearchEngine;
  narrator?: AudioNarrator;
  telemetry?: Telemetry;
  narrationState?: NarrationState;
  isOnline: boolean;
  isAiEnabled: boolean;
  isInspectorMode: boolean;
  showHeadings?: boolean;
  offlineTextStatus?: PackageStatusEnum;
  textProgress?: number;
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

export function renderHighlightedText(
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

function buildPassageSegments(
  passageList: ScoredPassage[],
  locale?: string,
  getText?: (p: ScoredPassage) => string,
): NarrationSegment[] {
  return passageList.map((p) => {
    const key = getChunkKey(p.chunk);
    return {
      id: `chunk-${key}`,
      citation: formatCitation(p.chunk.book, p.chunk.start, p.chunk.end, locale),
      text: getText ? getText(p) : p.chunk.text,
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
  displayText?: string,
): ChunkSectionView[] {
  const text = displayText ?? p.chunk.text;
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
        text,
      },
    ];
  }

  // Multi-heading passages (e.g. Romans 13:8-14)
  if (splitIdx && splitIdx > 0 && splitIdx < text.length) {
    const h1 = headings[0]!;
    const h2 = headings[1]!;
    return [
      {
        heading: h1[2],
        scope: `${p.chunk.start[1]}–${h2[1] - 1}`,
        text: text.slice(0, splitIdx).trim(),
      },
      {
        heading: h2[2],
        scope: `${h2[1]}–${p.chunk.end[1]}`,
        text: text.slice(splitIdx).trim(),
      },
    ];
  }

  return [
    {
      heading: headings[0]![2],
      scope: fullScope,
      text,
    },
  ];
}

function stripPreamble(text: string): string {
  return text
    .replace(
      /^(?:>?\s*)?(?:based on (?:the )?(?:provided )?passages[,\s:]*|according to (?:the )?(?:provided )?(?:passages|scripture|bible)[,\s:]*|here is what the bible (?:says|teaches|states)[^:\n]*:?\s*)+/i,
      '',
    )
    .replace(/^[\s:\-*]+/, '');
}

export function SearchView({
  engine,
  narrator,
  telemetry,
  narrationState,
  isOnline,
  isAiEnabled,
  isInspectorMode,
  showHeadings = true,
  offlineTextStatus = PackageStatusEnum.DOWNLOADED,
  textProgress,
  hasSeenOnboarding = true,
  savedVerses,
  onOpenStorage,
  onDismissOnboarding,
  onOpenReader,
  onSaveVerse,
  onToast,
}: SearchViewProps): JSX.Element {
  const tt = useStore(messages);
  const currentLocale = useStore($locale);
  const activeTranslation = useStore($activeTranslation);
  const isTelemetryEnabled = useStore($telemetryEnabled);
  const suggestions = getSearchSuggestions(currentLocale);
  const popularTopics = getPopularTopics(currentLocale);
  const [initialSearch] = useState(() => $lastSearch.get());
  const [query, setQuery] = useState(initialSearch.query);
  const [passages, setPassages] = useState<ScoredPassage[]>(initialSearch.passages);
  const [searchOrigin, setSearchOrigin] = useState<SearchOriginEnum | undefined>(() => initialSearch.origin);
  const [searchDurationMs, setSearchDurationMs] = useState<number | null>(() => initialSearch.durationMs ?? null);
  const [translatedQuery, setTranslatedQuery] = useState<string | undefined>(() => initialSearch.translatedQuery);
  const [translatedBy, setTranslatedBy] = useState<string | undefined>(() => initialSearch.translatedBy);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const lastSubmittedQueryRef = useRef(initialSearch.query);
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [searchFeedbackVote, setSearchFeedbackVote] = useState<VoteDirection | null>(null);
  const [localizedTexts, setLocalizedTexts] = useState<Record<string, string>>({});
  const [surroundingVerses, setSurroundingVerses] = useState<
    Record<string, { prev?: string; next?: string }>
  >({});
  const [splitPoints, setSplitPoints] = useState<Record<string, number>>({});

  const getDisplayText = (p: ScoredPassage): string =>
    activeTranslation === DEFAULT_TRANSLATION
      ? p.chunk.text
      : (localizedTexts[`${activeTranslation}:${getChunkKey(p.chunk)}`] ?? p.chunk.text);

  const [answerText, setAnswerText] = useState<string>(initialSearch.answerText);
  const [synthesisModel, setSynthesisModel] = useState<string | null>(
    () => initialSearch?.model ?? initialSearch?.provider ?? null,
  );
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisTtftMs, setSynthesisTtftMs] = useState<number | null>(() => initialSearch.ttftMs ?? null);
  const [synthesisTokensPerSec, setSynthesisTokensPerSec] = useState<number | null>(() => initialSearch.tokensPerSec ?? null);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isSynthesisCollapsed, setIsSynthesisCollapsed] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(initialSearch.query.trim().length > 0);
  const searchHistory = useStore($searchHistory);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus empty landing search input so the guidance panel opens immediately.
  useEffect(() => {
    if (initialSearch.query.trim().length === 0) {
      inputRef.current?.focus();
    }
  }, []);

  const searchRunIdRef = useRef(0);

  const prevOfflineTextStatusRef = useRef(offlineTextStatus);
  useEffect(() => {
    if (
      prevOfflineTextStatusRef.current !== PackageStatusEnum.DOWNLOADED &&
      offlineTextStatus === PackageStatusEnum.DOWNLOADED
    ) {
      if (passages.length === 0 && query.trim().length > 0) {
        runSearch(query);
      }
    }
    prevOfflineTextStatusRef.current = offlineTextStatus;
  }, [offlineTextStatus, passages.length, query]);

  useEffect(() => {
    if (offlineTextStatus === PackageStatusEnum.DOWNLOADED && passages.length === 0 && query.trim().length > 0) {
      runSearch(query);
    }
  }, []);

  const runSearch = (targetQuery: string) => {
    const trimmed = targetQuery.trim();
    const runId = ++searchRunIdRef.current;
    if (!trimmed) {
      setPassages([]);
      setSearchOrigin(undefined);
      setSearchDurationMs(null);
      setTranslatedQuery(undefined);
      setTranslatedBy(undefined);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setPassages([]);
    setSearchFeedbackVote(null);
    setHasSearched(true);
    const startTime = performance.now();
    const searchPromise = engine.retrieve(trimmed);
    void searchPromise
      .then((res) => {
        if (searchRunIdRef.current === runId) {
          const duration = Math.round(performance.now() - startTime);
          setSearchDurationMs(duration);
          setPassages(res.passages);
          setSearchOrigin(res.origin);
          setTranslatedQuery(res.translatedQuery);
          setTranslatedBy(res.translatedBy);
          telemetry?.capture('search', {
            query: trimmed,
            locale: currentLocale,
            origin: res.origin ?? 'local',
            duration_ms: duration,
            result_count: res.passages.length,
            translated_query: res.translatedQuery,
            translated_by: res.translatedBy,
          });
          if (res.fallbackReason === 'timeout') {
            onToast(tt.toastServerTimeout);
          } else if (res.fallbackReason === 'error') {
            onToast(tt.toastServerUnreachable);
          }
        }
      })
      .catch((err) => {
        console.error('[Search Error]:', err);
        onToast(tt.toastSearchFailed({ message: err instanceof Error ? err.message : String(err) }));
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
    if (isAiEnabled) {
      if (!isOnline && !engine.answerProvider.available) {
        setAnswerText('');
        setSynthesisModel(null);
        setSynthesisTtftMs(null);
        setSynthesisTokensPerSec(null);
        setSynthesisError(null);
        onToast(tt.toastUnavailableOffline);
        runSearch(trimmed);
      } else if (!engine.answerProvider.available) {
        setAnswerText('');
        setSynthesisModel(null);
        setSynthesisTtftMs(null);
        setSynthesisTokensPerSec(null);
        setSynthesisError(null);
        onToast(tt.toastUnavailableDevice);
        runSearch(trimmed);
      } else if (!isSynthesizing) {
        setSynthesisError(null);
        void handleSynthesize();
      }
    } else {
      setSynthesisError(null);
      setAnswerText('');
      setSynthesisModel(null);
      setSynthesisTtftMs(null);
      setSynthesisTokensPerSec(null);
      runSearch(trimmed);
    }
  };

  const matchedBook = findBookByPrefix(query, currentLocale);

  useEffect(() => {
    $lastSearch.set({
      query,
      passages,
      answerText,
      origin: searchOrigin,
      durationMs: searchDurationMs ?? undefined,
      provider: synthesisModel ?? undefined,
      model: synthesisModel ?? undefined,
      ttftMs: synthesisTtftMs ?? undefined,
      tokensPerSec: synthesisTokensPerSec ?? undefined,
      translatedQuery,
      translatedBy,
    });
  }, [
    query,
    passages,
    answerText,
    searchOrigin,
    searchDurationMs,
    synthesisModel,
    synthesisTtftMs,
    synthesisTokensPerSec,
    translatedQuery,
    translatedBy,
  ]);

  useEffect(() => {
    if (!isAiEnabled) {
      setIsSynthesizing(false);
      setAnswerText('');
      setSynthesisError(null);
      setSynthesisModel(null);
      setSynthesisTtftMs(null);
      setSynthesisTokensPerSec(null);
    }
  }, [isAiEnabled]);

  // Resolve retrieved passage text into the active translation (e.g., WEB -> LSG).
  useEffect(() => {
    if (activeTranslation === DEFAULT_TRANSLATION || passages.length === 0) return;

    let cancelled = false;
    void Promise.all(
      passages.map(async (p) => {
        const cacheKey = `${activeTranslation}:${getChunkKey(p.chunk)}`;
        const text = await resolvePassageText(p.chunk.book, p.chunk.start, p.chunk.end, activeTranslation);
        return text ? ([cacheKey, text] as const) : null;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) updates[entry[0]] = entry[1];
      }
      if (Object.keys(updates).length > 0) {
        setLocalizedTexts((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [passages, activeTranslation]);

  useEffect(() => {
    if (expandedCardKey === null) return;
    const passage = passages.find((p) => getChunkKey(p.chunk) === expandedCardKey);
    const cacheKey = `${activeTranslation}:${expandedCardKey}`;
    if (!passage || surroundingVerses[cacheKey]) return;

    let isSubscribed = true;
    const book = passage.chunk.book;
    const chStart = passage.chunk.start[0];
    const vStart = passage.chunk.start[1];
    const chEnd = passage.chunk.end[0];
    const vEnd = passage.chunk.end[1];

    void Promise.all([
      vStart > 1 ? resolveVerseText(book, chStart, vStart - 1, activeTranslation) : Promise.resolve(undefined),
      resolveVerseText(book, chEnd, vEnd + 1, activeTranslation),
    ]).then(([prev, next]) => {
      if (isSubscribed) {
        setSurroundingVerses((curr) => ({
          ...curr,
          [cacheKey]: { prev, next },
        }));
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [expandedCardKey, passages, surroundingVerses, activeTranslation]);

  useEffect(() => {
    const multi = passages.filter((p) => p.chunk.headings && p.chunk.headings.length > 1);
    if (multi.length === 0) return;

    let isSubscribed = true;
    for (const p of multi) {
      const key = getChunkKey(p.chunk);
      const cacheKey = `${activeTranslation}:${key}`;
      if (splitPoints[cacheKey] !== undefined) continue;
      const displayText =
        activeTranslation === DEFAULT_TRANSLATION ? p.chunk.text : (localizedTexts[cacheKey] ?? p.chunk.text);
      const h2 = p.chunk.headings![1]!;
      void resolveVerseText(p.chunk.book, h2[0], h2[1], activeTranslation).then((vText) => {
        if (!isSubscribed || !vText) return;
        const snippet = vText.trim().slice(0, 20);
        const idx = displayText.indexOf(snippet);
        if (idx > 0) {
          setSplitPoints((prev) => ({ ...prev, [cacheKey]: idx }));
        }
      });
    }

    return () => {
      isSubscribed = false;
    };
  }, [passages, splitPoints, activeTranslation, localizedTexts]);

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

  const handleSearchFeedback = (direction: VoteDirection) => {
    setSearchFeedbackVote(direction);
    onToast(tt.searchFeedbackThanks);
    telemetry?.capture('search_feedback', {
      query: lastSubmittedQueryRef.current || query.trim(),
      vote: direction,
      result_count: passages.length,
      locale: currentLocale,
    });
  };

  const handleSynthesize = async () => {
    const trimmed = query.trim();
    if (!trimmed || isSynthesizing || !isAiEnabled) return;
    lastSubmittedQueryRef.current = trimmed;
    setIsPanelOpen(false);
    inputRef.current?.blur();
    setIsSynthesizing(true);
    setIsSearching(true);
    setPassages([]);
    setSearchFeedbackVote(null);
    setAnswerText('');
    setSynthesisModel(null);
    setSynthesisError(null);
    setSynthesisTtftMs(null);
    setSynthesisTokensPerSec(null);
    setIsSynthesisCollapsed(false);
    setHasSearched(true);

    try {
      const startTime = performance.now();
      const res = await engine.retrieve(trimmed);
      const duration = Math.round(performance.now() - startTime);
      setSearchDurationMs(duration);
      setPassages(res.passages);
      setSearchOrigin(res.origin);
      setIsSearching(false);
      telemetry?.capture('search', {
        query: trimmed,
        locale: currentLocale,
        origin: res.origin ?? 'local',
        duration_ms: duration,
        result_count: res.passages.length,
      });
      if (res.fallbackReason === 'timeout') {
        onToast(tt.toastServerTimeout);
      } else if (res.fallbackReason === 'error') {
        onToast(tt.toastServerUnreachable);
      }
      if (res.passages.length === 0) {
        if (res.origin !== SearchOriginEnum.REMOTE && offlineTextStatus !== PackageStatusEnum.DOWNLOADED) {
          onToast(tt.toastNotDownloaded);
        }
        setIsSynthesizing(false);
        return;
      }

      let contextForAnswer = res;
      if (activeTranslation !== DEFAULT_TRANSLATION) {
        const localizedTop = await Promise.all(
          res.passages.slice(0, 5).map(async (p) => {
            const text = await resolvePassageText(p.chunk.book, p.chunk.start, p.chunk.end, activeTranslation);
            return text ? { ...p, chunk: { ...p.chunk, text } } : p;
          }),
        );
        contextForAnswer = { ...res, passages: [...localizedTop, ...res.passages.slice(5)] };
      }

      const streamStartTime = performance.now();
      let firstTokenTime: number | null = null;
      let totalChars = 0;
      const onMeta = (meta: { model?: string; provider?: string }) => {
        const modelName = meta.model || meta.provider;
        if (modelName) setSynthesisModel(modelName);
      };
      const stream =
        currentLocale && currentLocale !== 'en'
          ? engine.answerProvider.answer(trimmed, contextForAnswer, onMeta, currentLocale)
          : engine.answerProvider.answer(trimmed, contextForAnswer, onMeta);
      let receivedAny = false;
      let tokenCount = 0;
      for await (const chunk of stream) {
        receivedAny = true;
        tokenCount++;
        if (firstTokenTime === null) {
          firstTokenTime = performance.now();
          setSynthesisTtftMs(Math.round(firstTokenTime - streamStartTime));
        }
        totalChars += chunk.length;
        setAnswerText((prev) => stripPreamble(prev + chunk));
      }
      if (firstTokenTime !== null) {
        const generationDurationSec = (performance.now() - firstTokenTime) / 1000;
        const tokens = Math.max(tokenCount, Math.round(totalChars / 4));
        if (generationDurationSec > 0.05) {
          const rawRate = tokens / generationDurationSec;
          const rate = rawRate >= 10 ? Math.round(rawRate) : Math.round(rawRate * 10) / 10;
          setSynthesisTokensPerSec(rate);
        }
      }
      if (!receivedAny) {
        onToast(tt.toastAiOverviewUnavailable);
      }
    } catch (err) {
      console.error('[SearchView] AI overview failed:', err);
      onToast(tt.toastAiOverviewUnavailable);
    } finally {
      setIsSearching(false);
      setIsSynthesizing(false);
    }
  };

  return (
    <section class="flex-1 flex flex-col px-4 sm:px-8 pt-4 sm:pt-5 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain max-w-2xl mx-auto w-full">
      {/* Offline Storage Status Banner / Super Tiny Reminder */}
      {isOnDeviceSupported(currentLocale) && offlineTextStatus !== PackageStatusEnum.DOWNLOADED && (
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
                {tt.saveScriptureOfflineBanner}
              </span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenStorage}
                class="px-2 py-0.5 rounded-lg text-[11px] font-medium text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {tt.setUpButton}
              </button>
              {onDismissOnboarding && (
                <button
                  type="button"
                  onClick={onDismissOnboarding}
                  class="p-0.5 rounded-md text-[11px] hover:opacity-75"
                  style={{ color: 'var(--text-muted)' }}
                  title={tt.dismissBannerTitle}
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
              <span>{tt.saveScriptureOfflineCompact}</span>
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
            aria-label={tt.searchButtonLabel}
            onMouseDown={(e) => e.preventDefault()}
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
            placeholder={tt.searchPlaceholder}
            class="w-full bg-transparent text-sm font-medium outline-none leading-normal pl-0 pr-2"
            style={{
              color: 'var(--text-main)',
            }}
            onFocus={() => {
              setIsPanelOpen(true);
            }}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.keyCode === 13) {
                handleSubmit(e);
              }
            }}
            onBlur={() => {
              addQueryToHistory(query);
              setIsPanelOpen(false);
            }}
          />
          {query.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                searchRunIdRef.current++;
                setQuery('');
                setSearchDurationMs(null);
                inputRef.current?.focus();
              }}
              class="text-xs p-1 rounded-full hover:opacity-75 shrink-0 ml-1.5"
              style={{ color: 'var(--text-muted)' }}
              title={tt.clearQueryTitle}
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

      {/* Scripture Navigator Strip (Compact: book name & chapter buttons) */}
      {matchedBook && (() => {
        const bookName = getLocalizedBookName(matchedBook.id, currentLocale);
        return (
          <div
            class="mb-2.5 px-3 py-2 rounded-xl border flex items-center gap-2.5 animate-fadeIn shrink-0 overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'color-mix(in srgb, var(--border-subtle) 50%, transparent)',
            }}
          >
            <button
              type="button"
              onClick={() => onOpenReader(matchedBook.id, 1, 1)}
              class="shrink-0 text-xs font-semibold hover:opacity-80 transition-opacity text-left cursor-pointer hover:underline"
              style={{ color: 'var(--text-main)' }}
              title={tt.readBookAria({ book: bookName })}
            >
              {bookName}
            </button>

            <div class="h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }} />

            <div class="flex items-center gap-1 overflow-x-auto text-[11px] no-scrollbar py-0.5">
              {Array.from({ length: matchedBook.chapters }, (_, i) => i + 1).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => onOpenReader(matchedBook.id, ch, 1)}
                  class="shrink-0 w-6 h-6 rounded-md border flex items-center justify-center font-medium transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-main)',
                  }}
                  title={tt.openChapterAria({ book: bookName, ch })}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Guidance Panel P (Shown only while search input has focus) */}
      {isPanelOpen && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          class="py-3 mb-2 flex flex-col gap-4 animate-fadeIn"
        >
          {/* Recent Searches */}
          {searchHistory.length > 0 && (
            <div>
              <div class="mb-2">
                <span class="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-subtle)' }}>
                  {tt.recentSearches}
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
                {tt.suggestions}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
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
                {tt.popularTopics}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {popularTopics.map((topic) => (
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

      {/* Active Download Progress Card */}
      {offlineTextStatus === PackageStatusEnum.DOWNLOADING && (
        <div
          class="mb-4 p-4 rounded-xl border flex flex-col gap-2 animate-fadeIn"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--accent)',
          }}
        >
          <div class="flex items-center justify-between text-xs">
            <span class="font-medium flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
              <div class="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              {tt.savingScripture}
            </span>
            <span class="font-mono text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              {textProgress !== undefined ? `${textProgress}%` : ''}
            </span>
          </div>
          <div class="w-full bg-stone-200 dark:bg-stone-700 h-1.5 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-300 rounded-full"
              style={{
                backgroundColor: 'var(--accent)',
                width: `${Math.max(5, textProgress ?? 0)}%`,
              }}
            />
          </div>
          <p class="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {tt.searchRefreshNotice}
          </p>
        </div>
      )}

      {/* No Results & Error States */}
      {!isPanelOpen && !isSearching && hasSearched && query.trim().length > 0 && passages.length === 0 && offlineTextStatus !== PackageStatusEnum.DOWNLOADING && (
        (!isOnline || searchOrigin !== SearchOriginEnum.REMOTE) && offlineTextStatus !== PackageStatusEnum.DOWNLOADED ? (
          <div class="py-12 sm:py-16 flex flex-col items-center justify-center text-center animate-fadeIn max-w-sm mx-auto px-4">
            <div
              class={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${
                !isOnline ? 'bg-stone-500/10 text-stone-500' : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {!isOnline ? (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-12.728 0m0 0l2.829-2.829m-2.829 2.829L3 21m2.828-12.536a5 5 0 017.072 0" />
                </svg>
              ) : (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <p class="font-serif text-base font-semibold mb-1" style={{ color: 'var(--text-main)' }}>
              {!isOnline ? tt.offlineTitle : tt.serviceUnavailableTitle}
            </p>
            <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isOnDeviceSupported(currentLocale) ? tt.offlineDesc : tt.offlineDescUnsupportedLocale}
            </p>
          </div>
        ) : (
          <div class="py-16 flex flex-col items-center justify-center text-center animate-fadeIn">
            <p class="font-serif text-base font-semibold mb-1" style={{ color: 'var(--text-main)' }}>
              {tt.noMatchesTitle}
            </p>
            <p class="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
              {tt.noMatchesDesc}
            </p>
          </div>
        )
      )}

      {/* Technical Diagnostics Bar (Shown only in Inspector Mode when results are present) */}
      {isInspectorMode && passages.length > 0 && (
        <div
          class="flex items-center justify-between text-[9px] sm:text-[10px] mb-2 px-1 py-0.5 border-b border-dashed font-mono shrink-0 animate-fadeIn"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-subtle)',
          }}
        >
          <span>
            {passages.length > 1
              ? `RRF score: ${passages[0]!.score.toFixed(4)} - ${passages[passages.length - 1]!.score.toFixed(4)}`
              : `RRF score: ${passages[0]!.score.toFixed(4)}`}
          </span>
          {searchDurationMs !== null && (
            <span class="shrink-0">
              {searchOrigin === SearchOriginEnum.REMOTE ? tt.serverRetrieval : tt.deviceRetrieval}: {searchDurationMs}ms
            </span>
          )}
        </div>
      )}

      {/* Synthesized Answer Card */}
      <ScriptureOverviewCard
        isAiEnabled={isAiEnabled}
        answerText={answerText}
        isSynthesizing={isSynthesizing}
        synthesisError={synthesisError}
        synthesisModel={synthesisModel}
        isSynthesisCollapsed={isSynthesisCollapsed}
        onToggleCollapse={() => setIsSynthesisCollapsed(!isSynthesisCollapsed)}
        onDismissError={() => setSynthesisError(null)}
        narrator={narrator}
        narrationState={narrationState}
        firstPassage={passages[0]}
        isInspectorMode={isInspectorMode}
        synthesisTtftMs={synthesisTtftMs}
        synthesisTokensPerSec={synthesisTokensPerSec}
      />

      {/* Results Stream */}
      <div class="flex flex-col space-y-3 pb-4">
        {isSearching && (
          <div class="flex flex-col space-y-3 animate-fadeIn" aria-label={tt.loadingPassagesAria}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                class="p-4 rounded-2xl border transition-all"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div class="flex items-center justify-between mb-2.5">
                  <div class="skeleton-box h-5 w-32 rounded-lg" />
                  <div class="flex items-center gap-1.5">
                    <div class="skeleton-box h-6 w-6 rounded-full" />
                    <div class="skeleton-box h-6 w-6 rounded-full" />
                  </div>
                </div>
                <div class="space-y-2 py-1">
                  <div class="skeleton-box h-3.5 w-full" />
                  <div class="skeleton-box h-3.5 w-[94%]" />
                  <div class="skeleton-box h-3.5 w-[68%]" />
                </div>
                <div
                  class="mt-3 flex items-center justify-between pt-2 border-t border-dashed"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div class="skeleton-box h-3 w-20 rounded" />
                  <div class="skeleton-box h-3 w-12 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSearching && passages.map((p, cardIdx) => {
          const chunkKey = getChunkKey(p.chunk);
          const transKey = `${activeTranslation}:${chunkKey}`;
          const isExpanded = expandedCardKey === chunkKey;
          const refString = formatCitation(p.chunk.book, p.chunk.start, p.chunk.end, currentLocale);
          const displayText = getDisplayText(p);
          const sections = getChunkSectionViews(p, splitPoints[transKey], displayText);

          const isSaved =
            savedVerses?.some(
              (v) =>
                v.book === p.chunk.book &&
                v.chapter === p.chunk.start[0] &&
                v.verse === p.chunk.start[1],
            ) ?? false;

          const surrounding = surroundingVerses[transKey];
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
              {/* Header: Badges & Actions (title joins this row when badges are hidden) */}
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  {!isInspectorMode && (
                    <h2
                      class="font-serif text-lg font-semibold tracking-tight"
                      style={{ color: 'var(--text-main)' }}
                    >
                      {refString}
                    </h2>
                  )}
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
                        ? tt.badgeExactRef
                        : p.source === 'semantic'
                        ? tt.badgeSemantic
                        : tt.badgeKeyword}
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

                <div class="flex items-center gap-1.5 shrink-0">
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
                        const segments = buildPassageSegments(passages, currentLocale, getDisplayText);
                        narrator.play(segments, cardIdx);
                      }}
                      title={isCardPlaying ? tt.pauseNarrationTitle : tt.listenPassageTitle}
                      aria-label={isCardPlaying ? tt.pauseRefAria({ ref: refString }) : tt.listenRefAria({ ref: refString })}
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
                        const bookName = getLocalizedBookName(p.chunk.book, currentLocale);
                        onSaveVerse({
                          book: p.chunk.book,
                          bookName,
                          chapter: p.chunk.start[0],
                          verse: p.chunk.start[1],
                          citation: refString,
                          text: displayText,
                        });
                      }}
                      title={isSaved ? tt.removeFromBookmarksTitle : tt.saveToBookmarksTitle}
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
                </div>
              </div>

              {isInspectorMode && (
                <div class="mb-1.5">
                  <h2
                    class="font-serif text-lg font-semibold tracking-tight"
                    style={{ color: 'var(--text-main)' }}
                  >
                    {refString}
                  </h2>
                </div>
              )}

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
                    {tt.loadingSurroundingVerses}
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
                  <span>{isExpanded ? tt.collapsePassage : tt.expandPassage}</span>
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
                  <span>{tt.readChapter}</span>
                  <span>→</span>
                </button>
              </div>
            </article>
          );
        })}

        {/* End-of-Results Relevance Feedback (Borderless Editorial Colophon) */}
        {isTelemetryEnabled && passages.length > 0 && !isSearching && !isSynthesizing && !searchFeedbackVote && (
          <div class="pt-5 pb-2 flex flex-col items-center justify-center text-xs text-center transition-colors">
            <div class="flex flex-wrap items-center justify-center gap-1.5" style={{ color: 'var(--text-subtle)' }}>
              <span>{tt.searchFeedbackPrompt}</span>
              <span class="inline-flex items-center gap-1.5 font-medium ml-1">
                <button
                  type="button"
                  onClick={() => handleSearchFeedback('up')}
                  class="hover:underline transition-opacity py-0.5 px-1 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tt.searchFeedbackYes}
                </button>
                <span aria-hidden="true" style={{ color: 'var(--text-subtle)' }}>·</span>
                <button
                  type="button"
                  onClick={() => handleSearchFeedback('down')}
                  class="hover:underline transition-opacity py-0.5 px-1 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {tt.searchFeedbackNo}
                </button>
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
