import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createDefaultArtifactStore, createDefaultEngine, createDefaultNarrator } from './composition';
import { Header, type Theme } from './components/Header';
import { Navbar, type ViewTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView } from './components/SettingsView';
import { BookSelectorModal } from './components/BookSelectorModal';
import { HelpModal } from './components/HelpModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { useHeadroom } from './core/headroom';
import type { Manifest, NarrationState } from './core/types';
import { useStore } from '@nanostores/preact';
import { $textPackageStatus, $aiPackageStatus } from './stores/packages';
import { $theme, $activeTab, $isAiEnabled, $showHeadings, $hasSeenStorageBanner } from './stores/preferences';
import { $readerLocation, $savedVerses, type ReaderLocation } from './stores/reader';

export function App(): JSX.Element {
  const store = useMemo(() => createDefaultArtifactStore(), []);
  const engine = useMemo(() => createDefaultEngine(store), [store]);
  const narrator = useMemo(() => createDefaultNarrator(), []);
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
  const handleThemeChange = (nextTheme: Theme) => $theme.set(nextTheme);

  const activeTab = useStore($activeTab);
  const [isBarVisible, setIsBarVisible] = useHeadroom({ threshold: 50, deltaThreshold: 8 });

  const handleTabChange = (tab: ViewTab) => {
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
  const [textProgress, setTextProgress] = useState<number>(() =>
    $textPackageStatus.get() === 'ready' ? 100 : 0,
  );
  const [aiProgress, setAiProgress] = useState<number>(() =>
    $aiPackageStatus.get() === 'ready' ? 100 : 0,
  );
  const hasSeenStorageBanner = useStore($hasSeenStorageBanner);
  const [highlightStorage, setHighlightStorage] = useState<boolean>(false);

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
    showToast(enabled ? 'AI Scripture Overview enabled' : 'AI Scripture Overview deactivated');
  };

  const showHeadings = useStore($showHeadings);
  const handleToggleHeadings = (enabled: boolean) => {
    $showHeadings.set(enabled);
    showToast(enabled ? 'Pericope headings enabled' : 'Pericope headings hidden');
  };

  // Reconcile in-memory state if page was reloaded mid-download
  useEffect(() => {
    if ($textPackageStatus.get() === 'downloading') $textPackageStatus.set('not_downloaded');
    if ($aiPackageStatus.get() === 'downloading') $aiPackageStatus.set('not_downloaded');
  }, []);

  // Sync offline packages state with real OPFS storage in background
  useEffect(() => {
    store.hasVerses?.().then((has) => {
      $textPackageStatus.set(has ? 'ready' : 'not_downloaded');
      if (has) setTextProgress(100);
    });
    store.hasEmbeddings?.().then((has) => {
      $aiPackageStatus.set(has ? 'ready' : 'not_downloaded');
      if (has) setAiProgress(100);
    });
  }, [store]);

  const handleDownloadText = async () => {
    $textPackageStatus.set('downloading');
    setTextProgress(0);
    try {
      await store.verses((pct) => setTextProgress(Math.round(pct * 0.8)));
      await store.chunks((pct) => setTextProgress(80 + Math.round(pct * 0.2)));
      $textPackageStatus.set('ready');
      setTextProgress(100);
      showToast('Scripture text verified & installed in OPFS (1.2 MB)');
    } catch (err) {
      console.error('Download failed:', err);
      showToast(
        err instanceof Error && err.name === 'CorruptArtifactError'
          ? err.message
          : 'Download interrupted. Check network and try again.',
      );
      $textPackageStatus.set('not_downloaded');
    }
  };

  const handleDownloadAi = async () => {
    $aiPackageStatus.set('downloading');
    setAiProgress(0);
    try {
      await store.embeddings((pct) => setAiProgress(pct));
      $aiPackageStatus.set('ready');
      setAiProgress(100);
      showToast('AI semantic embeddings verified & installed (2.1 MB)');
    } catch (err) {
      console.error('Download failed:', err);
      showToast(
        err instanceof Error && err.name === 'CorruptArtifactError'
          ? err.message
          : 'AI download interrupted. Check network and try again.',
      );
      $aiPackageStatus.set('not_downloaded');
    }
  };

  const handleClearStorage = async () => {
    await store.clear();
    $textPackageStatus.set('not_downloaded');
    $aiPackageStatus.set('not_downloaded');
    setTextProgress(0);
    setAiProgress(0);
    showToast('Offline storage cleared.');
  };

  const handleOpenStorage = () => {
    handleTabChange('settings');
    setHighlightStorage(true);
  };

  const handleDismissOnboarding = () => {
    $hasSeenStorageBanner.set(true);
  };

  // Sync theme class to document body.
  useEffect(() => {
    document.body.className = `antialiased font-sans h-full overflow-hidden theme-${theme}`;
  }, [theme]);

  // Monitor network status in real time with event listeners and polling heartbeat
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connected: Back online');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Offline: Local search & reader active');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined') {
        const current = navigator.onLine;
        setIsOnline((prev) => {
          if (prev !== current) {
            showToast(current ? 'Connected: Back online' : 'Offline: Local search & reader active');
            return current;
          }
          return prev;
        });
      }
    }, 800);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
    }, 2200);
  };

  const handleOpenReader = (book: string, chapter: number, verse: number) => {
    setReaderLocation({ book, chapter, targetVerse: verse, scrollKey: Date.now() });
    handleTabChange('reader');
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
      if (exists) {
        next = prev.filter(
          (v) => !(v.book === verse.book && v.chapter === verse.chapter && v.verse === verse.verse),
        );
        showToast(`Removed ${verse.citation} from bookmarks`);
      } else {
        next = [
          ...prev,
          {
            id: Date.now().toString(),
            ...verse,
            savedAt: Date.now(),
          },
        ];
        showToast(`Saved ${verse.citation} to bookmarks`);
      }
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('bibleit_saved_verses', JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
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
        onOpenHelp={() => setIsHelpOpen(true)}
        onOpenAccount={() => showToast('Offline profile (Guest mode)')}
      />

      <main class="flex-1 flex flex-col overflow-hidden">
        <div class={activeTab === 'search' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
          <SearchView
            engine={engine}
            manifest={manifest}
            narrator={narrator}
            narrationState={narrationState}
            isOnline={isOnline}
            isAiEnabled={isAiEnabled}
            isInspectorMode={isInspectorMode}
            showHeadings={showHeadings}
            offlineTextStatus={textPackageStatus}
            hasSeenOnboarding={hasSeenStorageBanner}
            savedVerses={savedVerses}
            onOpenStorage={handleOpenStorage}
            onDismissOnboarding={handleDismissOnboarding}
            onOpenReader={handleOpenReader}
            onSaveVerse={handleSaveVerse}
            onToast={showToast}
          />
        </div>

        <div class={activeTab === 'reader' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
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

        {activeTab === 'saved' && (
          <SavedView
            savedVerses={savedVerses}
            onOpenVerse={(item) => {
              handleOpenReader(item.book, item.chapter, item.verse);
            }}
          />
        )}

        {activeTab === 'settings' && (
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
            textProgress={textProgress}
            aiProgress={aiProgress}
            highlightStorage={highlightStorage}
            onClearHighlight={() => setHighlightStorage(false)}
            onDownloadText={handleDownloadText}
            onDownloadAi={handleDownloadAi}
            onClearStorage={handleClearStorage}
            onOpenFeedback={() => setIsFeedbackOpen(true)}
          />
        )}
      </main>

      <AudioPlayerBar
        narrator={narrator}
        state={narrationState}
        isNavbarVisible={isBarVisible}
        onNavigateToSegment={handleOpenReader}
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
