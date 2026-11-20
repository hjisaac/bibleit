import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createArtifactStore,
  createEmbedder,
  createEngine,
  createNarrator,
  createAnswerProvider,
} from './composition';
import { Header } from './components/Header';
import { Navbar } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView } from './components/SettingsView';
import { BookSelectorModal } from './components/BookSelectorModal';
import { HelpModal } from './components/HelpModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { TOAST_DURATION_MS } from './constants';
import { getLocalizedBookName } from '@bibleit/engine';
import { $locale, i18n } from './stores/i18n';
import { params } from '@nanostores/i18n';
import { useHeadroom } from './core/headroom';
import {
  PackageStatusEnum,
  ViewTabEnum,
  SearchModeEnum,
  NetworkStatusEnum,
  ThemeEnum,
  type Manifest,
  type NarrationState,
} from './core/types';
import { useStore } from '@nanostores/preact';
import {
  $textPackageStatus,
  $aiPackageStatus,
  $modelPackageStatus,
  $slmPackageStatus,
} from './stores/packages';
import {
  $theme,
  $activeTab,
  $isAiEnabled,
  $showHeadings,
  $hasSeenStorageBanner,
  $searchMode,
} from './stores/preferences';
import { $readerLocation, $savedVerses, type ReaderLocation } from './stores/reader';

export const messages = i18n('app', {
  aiOverviewEnabled: 'AI Scripture Overview enabled',
  aiOverviewDisabled: 'AI Scripture Overview deactivated',
  headingsEnabled: 'Pericope headings enabled',
  headingsHidden: 'Pericope headings hidden',
  searchModeDevice: 'Device-only search enabled: Searching locally',
  searchModeAuto: 'Auto mode: Cloud search with offline fallback',
  textInstalled: 'Scripture text verified & installed in OPFS (1.2 MB)',
  textCancelled: 'Scripture download cancelled.',
  downloadInterrupted: 'Download interrupted. Check network and try again.',
  vectorsInstalled: 'Verse vectors verified & installed in OPFS (2.1 MB)',
  vectorsCancelled: 'AI vectors download cancelled.',
  vectorsInterrupted: 'AI download interrupted. Check network and try again.',
  modelInstalled: 'Neural query model installed in browser cache (137 MB)',
  modelCancelled: 'Model download cancelled.',
  modelInterrupted: 'Model download interrupted. Check network and try again.',
  slmInstalled: 'On-device AI model installed in OPFS (370 MB)',
  slmCancelled: 'AI model download cancelled.',
  slmInterrupted: 'AI model download interrupted. Check network and try again.',
  storageCleared: 'Offline storage and model cache cleared.',
  backOnline: 'Connected: Back online',
  offlineActive: 'Offline: Local search & reader active',
  bookmarkRemoved: params('Removed {citation} from bookmarks'),
  bookmarkSaved: params('Saved {citation} to bookmarks'),
});

export function App(): JSX.Element {
  // Composition root wires production adapters for the app lifecycle.
  const store = useMemo(() => createArtifactStore(), []);
  const embedder = useMemo(() => createEmbedder(), []);
  const slmProvider = useMemo(
    () => createAnswerProvider(() => $slmPackageStatus.get() === PackageStatusEnum.DOWNLOADED),
    [],
  );
  const engine = useMemo(
    () =>
      createEngine(
        store,
        embedder,
        () => $searchMode.get() === SearchModeEnum.DEVICE,
        slmProvider,
      ),
    [store, embedder, slmProvider],
  );
  const narrator = useMemo(() => createNarrator(), []);
  const [narrationState, setNarrationState] = useState<NarrationState>(() => narrator.getState());
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    store.manifest?.().then(setManifest).catch(() => {});
  }, [store]);

  useEffect(() => {
    const unsubscribe = narrator.subscribe(setNarrationState);
    return () => {
      unsubscribe();
      narrator.stop();
    };
  }, [narrator]);


  const theme = useStore($theme);
  const handleThemeChange = (nextTheme: ThemeEnum) => $theme.set(nextTheme);

  const activeTab = useStore($activeTab);
  const [isBarVisible, setIsBarVisible] = useHeadroom({ threshold: 50, deltaThreshold: 8 });

  const handleTabChange = (tab: ViewTabEnum) => {
    $activeTab.set(tab);
    setIsBarVisible(true);
  };

  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const textPackageStatus = useStore($textPackageStatus);
  const aiPackageStatus = useStore($aiPackageStatus);
  const modelPackageStatus = useStore($modelPackageStatus);
  const slmPackageStatus = useStore($slmPackageStatus);
  const [textProgress, setTextProgress] = useState<number>(() =>
    $textPackageStatus.get() === PackageStatusEnum.DOWNLOADED ? 100 : 0,
  );
  const [aiProgress, setAiProgress] = useState<number>(() =>
    $aiPackageStatus.get() === PackageStatusEnum.DOWNLOADED ? 100 : 0,
  );
  const [modelProgress, setModelProgress] = useState<number>(() =>
    $modelPackageStatus.get() === PackageStatusEnum.DOWNLOADED ? 100 : 0,
  );
  const [slmProgress, setSlmProgress] = useState<number>(() =>
    $slmPackageStatus.get() === PackageStatusEnum.DOWNLOADED ? 100 : 0,
  );
  const hasSeenStorageBanner = useStore($hasSeenStorageBanner);
  const [highlightStorage, setHighlightStorage] = useState<boolean>(false);
  const [isStorageAvailable, setIsStorageAvailable] = useState<boolean>(true);

  useEffect(() => {
    store.isStorageAvailable?.().then(setIsStorageAvailable).catch(() => setIsStorageAvailable(false));
  }, [store]);

  const readerLocation = useStore($readerLocation);
  const setReaderLocation = (
    loc: ReaderLocation | ((prev: ReaderLocation) => ReaderLocation),
  ) => {
    if (typeof loc === 'function') {
      $readerLocation.set(loc($readerLocation.get()));
    } else {
      $readerLocation.set(loc);
    }
  };

  const savedVerses = useStore($savedVerses);
  const setSavedVerses = (
    verses: SavedVerse[] | ((prev: SavedVerse[]) => SavedVerse[]),
  ) => {
    if (typeof verses === 'function') {
      $savedVerses.set(verses($savedVerses.get()));
    } else {
      $savedVerses.set(verses);
    }
  };

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const isAiEnabled = useStore($isAiEnabled);
  const handleToggleAi = (enabled: boolean) => {
    $isAiEnabled.set(enabled);
    const t = messages.get();
    showToast(enabled ? t.aiOverviewEnabled : t.aiOverviewDisabled);
  };

  const showHeadings = useStore($showHeadings);
  const handleToggleHeadings = (enabled: boolean) => {
    $showHeadings.set(enabled);
    const t = messages.get();
    showToast(enabled ? t.headingsEnabled : t.headingsHidden);
  };

  const searchMode = useStore($searchMode);
  const handleToggleSearchMode = (mode: SearchModeEnum) => {
    $searchMode.set(mode);
    const t = messages.get();
    showToast(mode === SearchModeEnum.DEVICE ? t.searchModeDevice : t.searchModeAuto);
  };

  // Reconcile in-memory state if page was reloaded mid-download
  useEffect(() => {
    if ($textPackageStatus.get() === PackageStatusEnum.DOWNLOADING) $textPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    if ($aiPackageStatus.get() === PackageStatusEnum.DOWNLOADING) $aiPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    if ($modelPackageStatus.get() === PackageStatusEnum.DOWNLOADING) $modelPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    if ($slmPackageStatus.get() === PackageStatusEnum.DOWNLOADING) $slmPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
  }, []);

  // Sync offline packages state with real OPFS and browser cache in background
  useEffect(() => {
    store.hasVerses?.().then((has) => {
      $textPackageStatus.set(has ? PackageStatusEnum.DOWNLOADED : PackageStatusEnum.NOT_DOWNLOADED);
      if (has) setTextProgress(100);
    });
    store.hasEmbeddings?.().then((has) => {
      $aiPackageStatus.set(has ? PackageStatusEnum.DOWNLOADED : PackageStatusEnum.NOT_DOWNLOADED);
      if (has) setAiProgress(100);
    });
    embedder.hasModel?.().then((isCached) => {
      if (isCached) {
        $modelPackageStatus.set(PackageStatusEnum.DOWNLOADED);
        setModelProgress(100);
      }
    });
    slmProvider.hasModel?.().then((isCached) => {
      if (isCached) {
        $slmPackageStatus.set(PackageStatusEnum.DOWNLOADED);
        setSlmProgress(100);
      }
    });
  }, [store, embedder, slmProvider]);

  // Subscribe to query embedder progress events
  useEffect(() => {
    const unsub = embedder.onProgress?.((fraction) => {
      if ($modelPackageStatus.get() !== PackageStatusEnum.DOWNLOADED) {
        $modelPackageStatus.set(PackageStatusEnum.DOWNLOADING);
        setModelProgress(Math.round(fraction * 100));
      }
    });
    return unsub;
  }, [embedder]);

  // Subscribe to SLM generator progress events
  useEffect(() => {
    const unsub = slmProvider.onProgress?.((fraction) => {
      if ($slmPackageStatus.get() !== PackageStatusEnum.DOWNLOADED) {
        $slmPackageStatus.set(PackageStatusEnum.DOWNLOADING);
        setSlmProgress(Math.round(fraction * 100));
      }
    });
    return unsub;
  }, [slmProvider]);

  useEffect(() => {
    engine.ready.then(() => {
      embedder.hasModel?.().then((isCached) => {
        if (isCached) {
          $modelPackageStatus.set(PackageStatusEnum.DOWNLOADED);
          setModelProgress(100);
        }
      });
      slmProvider.hasModel?.().then((isCached) => {
        if (isCached) {
          $slmPackageStatus.set(PackageStatusEnum.DOWNLOADED);
          setSlmProgress(100);
        }
      });
    }).catch(() => {});
  }, [engine, embedder, slmProvider]);

  const textAbortRef = useRef<AbortController | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const handleDownloadText = async () => {
    textAbortRef.current?.abort();
    const controller = new AbortController();
    textAbortRef.current = controller;

    $textPackageStatus.set(PackageStatusEnum.DOWNLOADING);
    setTextProgress(0);
    try {
      await store.verses((pct) => setTextProgress(Math.round(pct * 0.8)), controller.signal);
      await store.chunks((pct) => setTextProgress(80 + Math.round(pct * 0.2)), controller.signal);
      setTextProgress(100);
      await engine.sync?.();
      $textPackageStatus.set(PackageStatusEnum.DOWNLOADED);
      showToast(messages.get().textInstalled);
    } catch (err) {
      if (controller.signal.aborted) {
        $textPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
        setTextProgress(0);
        showToast(messages.get().textCancelled);
        return;
      }
      console.error('Download failed:', err);
      showToast(
        err instanceof Error && (err.name === 'CorruptArtifactError' || err.name === 'StorageUnavailableError')
          ? err.message
          : messages.get().downloadInterrupted,
      );
      $textPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    } finally {
      if (textAbortRef.current === controller) {
        textAbortRef.current = null;
      }
    }
  };

  const handleCancelDownloadText = () => {
    textAbortRef.current?.abort();
  };

  const handleDownloadAi = async () => {
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    $aiPackageStatus.set(PackageStatusEnum.DOWNLOADING);
    setAiProgress(0);
    try {
      await store.embeddings((pct) => setAiProgress(pct), controller.signal);
      setAiProgress(100);
      await engine.sync?.();
      $aiPackageStatus.set(PackageStatusEnum.DOWNLOADED);
      showToast(messages.get().vectorsInstalled);
    } catch (err) {
      if (controller.signal.aborted) {
        $aiPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
        setAiProgress(0);
        showToast(messages.get().vectorsCancelled);
        return;
      }
      console.error('Download failed:', err);
      showToast(
        err instanceof Error && (err.name === 'CorruptArtifactError' || err.name === 'StorageUnavailableError')
          ? err.message
          : messages.get().vectorsInterrupted,
      );
      $aiPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    } finally {
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
      }
    }
  };

  const handleCancelDownloadAi = () => {
    aiAbortRef.current?.abort();
  };

  const isModelAbortedRef = useRef(false);

  const handleDownloadModel = async () => {
    isModelAbortedRef.current = false;
    $modelPackageStatus.set(PackageStatusEnum.DOWNLOADING);
    setModelProgress(0);
    try {
      await embedder.load((fraction) => setModelProgress(Math.round(fraction * 100)));
      setModelProgress(100);
      await engine.sync?.();
      $modelPackageStatus.set(PackageStatusEnum.DOWNLOADED);
      showToast(messages.get().modelInstalled);
    } catch (err) {
      if (isModelAbortedRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        $modelPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
        setModelProgress(0);
        showToast(messages.get().modelCancelled);
        return;
      }
      console.error('Model download failed:', err);
      showToast(messages.get().modelInterrupted);
      $modelPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    }
  };

  const handleCancelDownloadModel = () => {
    isModelAbortedRef.current = true;
    embedder.cancelLoad?.();
  };

  const isSlmAbortedRef = useRef(false);

  const handleDownloadSlm = async () => {
    isSlmAbortedRef.current = false;
    $slmPackageStatus.set(PackageStatusEnum.DOWNLOADING);
    setSlmProgress(0);
    try {
      await slmProvider.load?.((fraction) => setSlmProgress(Math.round(fraction * 100)));
      setSlmProgress(100);
      $slmPackageStatus.set(PackageStatusEnum.DOWNLOADED);
      showToast(messages.get().slmInstalled);
    } catch (err) {
      if (isSlmAbortedRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        $slmPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
        setSlmProgress(0);
        showToast(messages.get().slmCancelled);
        return;
      }
      console.error('SLM download failed:', err);
      showToast(messages.get().slmInterrupted);
      $slmPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    }
  };

  const handleCancelDownloadSlm = () => {
    isSlmAbortedRef.current = true;
    slmProvider.cancelLoad?.();
  };

  const handleClearStorage = async () => {
    await store.clear();
    await embedder.clear?.();
    await slmProvider.clear?.();
    await engine.sync?.();
    $textPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    $aiPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    $modelPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    $slmPackageStatus.set(PackageStatusEnum.NOT_DOWNLOADED);
    setTextProgress(0);
    setAiProgress(0);
    setModelProgress(0);
    setSlmProgress(0);
    showToast(messages.get().storageCleared);
  };

  const handleOpenStorage = () => {
    handleTabChange(ViewTabEnum.SETTINGS);
    setHighlightStorage(true);
  };

  const handleDismissOnboarding = () => {
    $hasSeenStorageBanner.set(true);
  };

  const handleAudioBarClick = () => {
    if (activeTab === ViewTabEnum.SEARCH) {
      const activeCard = document.getElementById('search-active-narrating-card');
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (narrationState.activeSegment) {
      handleOpenReader(
        narrationState.activeSegment.book,
        narrationState.activeSegment.chapter,
        narrationState.activeSegment.verse ?? 1,
      );
    }
  };

  // Sync theme class to document body.
  useEffect(() => {
    document.body.className = `antialiased font-sans h-full overflow-hidden theme-${theme}`;
  }, [theme]);

  // Monitor network status in real time with event listeners and polling heartbeat
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast(messages.get().backOnline);
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast(messages.get().offlineActive);
    };

    window.addEventListener(NetworkStatusEnum.ONLINE, handleOnline);
    window.addEventListener(NetworkStatusEnum.OFFLINE, handleOffline);

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined') {
        const current = navigator.onLine;
        setIsOnline((prev) => {
          if (prev !== current) {
            const t = messages.get();
            showToast(current ? t.backOnline : t.offlineActive);
            return current;
          }
          return prev;
        });
      }
    }, 800);

    return () => {
      window.removeEventListener(NetworkStatusEnum.ONLINE, handleOnline);
      window.removeEventListener(NetworkStatusEnum.OFFLINE, handleOffline);
      clearInterval(interval);
    };
  }, []);

  const toastTimerRef = useRef<number | null>(null);

  const showToast = (message: string) => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  };

  const handleOpenReader = (book: string, chapter: number, verse: number) => {
    setReaderLocation({ book, chapter, targetVerse: verse, scrollKey: Date.now() });
    handleTabChange(ViewTabEnum.READER);
  };

  const handleSaveVerse = (verse: {
    book: string;
    bookName: string;
    chapter: number;
    verse: number;
    citation: string;
    text: string;
  }) => {
    setSavedVerses((prev) => {
      const exists = prev.some(
        (v) => v.book === verse.book && v.chapter === verse.chapter && v.verse === verse.verse,
      );
      let next;
      const localizedBook = getLocalizedBookName(verse.book, $locale.get());
      const citation = `${localizedBook} ${verse.chapter}:${verse.verse}`;
      const t = messages.get();
      if (exists) {
        next = prev.filter(
          (v) => !(v.book === verse.book && v.chapter === verse.chapter && v.verse === verse.verse),
        );
        showToast(t.bookmarkRemoved({ citation }));
      } else {
        next = [
          ...prev,
          {
            id: Date.now().toString(),
            ...verse,
            savedAt: Date.now(),
          },
        ];
        showToast(t.bookmarkSaved({ citation }));
      }
      return next;
    });
  };

  return (
    <div
      class="w-full max-w-3xl h-full overflow-hidden flex flex-col sm:border-x shadow-sm relative transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <Header
        isOnline={isOnline}
        isAiEnabled={isAiEnabled}
        searchMode={searchMode}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <main class="flex-1 flex flex-col overflow-hidden">
        <div class={activeTab === ViewTabEnum.SEARCH ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
          <SearchView
            engine={engine}
            narrator={narrator}
            narrationState={narrationState}
            isOnline={isOnline}
            isAiEnabled={isAiEnabled}
            isInspectorMode={isInspectorMode}
            showHeadings={showHeadings}
            offlineTextStatus={textPackageStatus}
            textProgress={textProgress}
            hasSeenOnboarding={hasSeenStorageBanner}
            savedVerses={savedVerses}
            onOpenStorage={handleOpenStorage}
            onDismissOnboarding={handleDismissOnboarding}
            onOpenReader={handleOpenReader}
            onSaveVerse={handleSaveVerse}
            onToast={showToast}
          />
        </div>

        <div class={activeTab === ViewTabEnum.READER ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
          <ReaderView
            book={readerLocation.book}
            chapter={readerLocation.chapter}
            targetVerse={readerLocation.targetVerse}
            scrollKey={readerLocation.scrollKey}
            narrator={narrator}
            narrationState={narrationState}
            savedVerses={savedVerses}
            onOpenSelector={() => setIsSelectorOpen(true)}
            onSaveVerse={handleSaveVerse}
            onToast={showToast}
          />
        </div>

        {activeTab === ViewTabEnum.SAVED && (
          <SavedView
            savedVerses={savedVerses}
            onOpenVerse={(item) => {
              handleOpenReader(item.book, item.chapter, item.verse);
            }}
            onUnsaveVerse={handleSaveVerse}
          />
        )}

        {activeTab === ViewTabEnum.SETTINGS && (
          <SettingsView
            manifest={manifest}
            currentTheme={theme}
            onThemeChange={handleThemeChange}
            isAiEnabled={isAiEnabled}
            onToggleAi={handleToggleAi}
            isInspectorMode={isInspectorMode}
            onToggleInspector={setIsInspectorMode}
            showHeadings={showHeadings}
            onToggleHeadings={handleToggleHeadings}
            textPackageStatus={textPackageStatus}
            aiPackageStatus={aiPackageStatus}
            modelPackageStatus={modelPackageStatus}
            slmPackageStatus={slmPackageStatus}
            textProgress={textProgress}
            aiProgress={aiProgress}
            modelProgress={modelProgress}
            slmProgress={slmProgress}
            searchMode={searchMode}
            onToggleSearchMode={handleToggleSearchMode}
            highlightStorage={highlightStorage}
            isStorageAvailable={isStorageAvailable}
            onDownloadText={handleDownloadText}
            onCancelDownloadText={handleCancelDownloadText}
            onDownloadAi={handleDownloadAi}
            onCancelDownloadAi={handleCancelDownloadAi}
            onDownloadModel={handleDownloadModel}
            onCancelDownloadModel={handleCancelDownloadModel}
            onDownloadSlm={handleDownloadSlm}
            onCancelDownloadSlm={handleCancelDownloadSlm}
            onClearStorage={handleClearStorage}
          />
        )}
      </main>

      <AudioPlayerBar
        narrator={narrator}
        state={narrationState}
        isNavbarVisible={isBarVisible}
        onNavigateToSegment={handleOpenReader}
        onBarClick={handleAudioBarClick}
        title={activeTab === ViewTabEnum.SEARCH ? 'Scroll to playing card' : 'Jump to passage in Reader'}
      />

      <Navbar activeTab={activeTab} onTabChange={handleTabChange} isVisible={isBarVisible} />


      {/* Book, Chapter & Verse Selection Modal */}
      <BookSelectorModal
        isOpen={isSelectorOpen}
        initialBookId={readerLocation.book}
        initialChapter={readerLocation.chapter}
        onClose={() => setIsSelectorOpen(false)}
        onSelectPassage={(bookId, chapter, verse) => handleOpenReader(bookId, chapter, verse)}
      />

      {/* Quick Help & Shortcuts Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
      />

      {/* Feedback & Bug Report Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onToast={showToast}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          class={`fixed left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full shadow-lg text-xs font-semibold text-white bg-stone-900 border border-stone-700 animate-fadeIn transition-all duration-300 ${
            narrationState.status !== 'idle'
              ? isBarVisible
                ? 'bottom-32'
                : 'bottom-20'
              : isBarVisible
                ? 'bottom-20'
                : 'bottom-6'
          }`}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
