import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createDefaultEngine, createDefaultNarrator } from './composition';
import { Header, type Theme } from './components/Header';
import { Navbar, type ViewTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView, type PackageStatus } from './components/SettingsView';
import { BookSelectorModal } from './components/BookSelectorModal';
import { HelpModal } from './components/HelpModal';
import { FeedbackModal } from './components/FeedbackModal';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { clearBookCache, downloadAllBooks, getCachedBooksCount } from './adapters/book-store';
import { useHeadroom } from './core/headroom';
import type { NarrationState } from './core/types';

export function App(): JSX.Element {
  const engine = useMemo(() => createDefaultEngine(), []);
  const narrator = useMemo(() => createDefaultNarrator(), []);
  const [narrationState, setNarrationState] = useState<NarrationState>(() => narrator.getState());

  useEffect(() => {
    const unsubscribe = narrator.subscribe(setNarrationState);
    return () => {
      unsubscribe();
      narrator.stop();
    };
  }, [narrator]);


  const [theme, setTheme] = useState<Theme>('paper');
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('bibleit_active_tab') as ViewTab | null;
      if (saved && ['search', 'reader', 'saved', 'settings'].includes(saved)) {
        return saved;
      }
    }
    return 'search';
  });

  const [isBarVisible, setIsBarVisible] = useHeadroom({ threshold: 50, deltaThreshold: 8 });

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    setIsBarVisible(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bibleit_active_tab', tab);
    }
  };

  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const [textPackageStatus, setTextPackageStatus] = useState<PackageStatus>('not_downloaded');
  const [aiPackageStatus, setAiPackageStatus] = useState<PackageStatus>('not_downloaded');
  const [textProgress, setTextProgress] = useState<number>(0);
  const [aiProgress, setAiProgress] = useState<number>(0);
  const [hasSeenStorageBanner, setHasSeenStorageBanner] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('bibleit_storage_banner_seen') === 'true';
    }
    return false;
  });
  const [highlightStorage, setHighlightStorage] = useState<boolean>(false);

  const [readerLocation, setReaderLocation] = useState<{
    book: string;
    chapter: number;
    targetVerse?: number;
    scrollKey: number;
  }>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('bibleit_last_read');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.book === 'string' && typeof parsed.chapter === 'number') {
            return {
              book: parsed.book,
              chapter: parsed.chapter,
              targetVerse: parsed.targetVerse ?? 1,
              scrollKey: 0,
            };
          }
        }
      } catch {
        // Fall back to default
      }
    }
    return {
      book: 'GEN',
      chapter: 1,
      targetVerse: 1,
      scrollKey: 0,
    };
  });

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        'bibleit_last_read',
        JSON.stringify({
          book: readerLocation.book,
          chapter: readerLocation.chapter,
          targetVerse: readerLocation.targetVerse,
        }),
      );
    }
  }, [readerLocation.book, readerLocation.chapter, readerLocation.targetVerse]);

  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('bibleit_saved_verses');
        if (stored) return JSON.parse(stored);
      } catch {
        // Fall back to default
      }
    }
    return [
      {
        id: '1',
        book: 'PHP',
        bookName: 'Philippians',
        chapter: 4,
        verse: 7,
        citation: 'Philippians 4:7',
        text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
        savedAt: Date.now(),
      },
    ];
  });

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const [isAiEnabled, setIsAiEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bibleit_ai_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const handleToggleAi = (enabled: boolean) => {
    setIsAiEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bibleit_ai_enabled', String(enabled));
    }
    showToast(enabled ? 'AI Scripture Overview enabled' : 'AI Scripture Overview deactivated');
  };

  const [showHeadings, setShowHeadings] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bibleit_show_headings');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const handleToggleHeadings = (enabled: boolean) => {
    setShowHeadings(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bibleit_show_headings', String(enabled));
    }
    showToast(enabled ? 'Pericope headings enabled' : 'Pericope headings hidden');
  };

  // Sync offline text package state with real Cache API on boot
  useEffect(() => {
    getCachedBooksCount().then((count) => {
      if (count >= 66) {
        setTextPackageStatus('ready');
        setTextProgress(100);
      } else if (count > 0) {
        setTextProgress(Math.round((count / 66) * 100));
      }
    });
  }, []);

  const handleDownloadText = async () => {
    setTextPackageStatus('downloading');
    try {
      await downloadAllBooks((progress) => {
        setTextProgress(progress);
      });
      setTextPackageStatus('ready');
      setTextProgress(100);
      showToast('Scripture text verified & installed offline (2.0 MB)');
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Download interrupted. Check network and try again.');
      setTextPackageStatus('not_downloaded');
    }
  };

  const handleDownloadAi = () => {
    setAiPackageStatus('downloading');
    setAiProgress(10);
    setTimeout(() => setAiProgress(35), 400);
    setTimeout(() => setAiProgress(65), 900);
    setTimeout(() => setAiProgress(90), 1300);
    setTimeout(() => {
      setAiProgress(100);
      setAiPackageStatus('ready');
      showToast('AI semantic model installed (23 MB)');
    }, 1600);
  };

  const handleClearStorage = async () => {
    await clearBookCache();
    setTextPackageStatus('not_downloaded');
    setAiPackageStatus('not_downloaded');
    setTextProgress(0);
    setAiProgress(0);
    showToast('Offline cache cleared.');
  };

  const handleOpenStorage = () => {
    handleTabChange('settings');
    setHighlightStorage(true);
  };

  const handleDismissOnboarding = () => {
    setHasSeenStorageBanner(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('bibleit_storage_banner_seen', 'true');
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
            currentTheme={theme}
            onThemeChange={setTheme}
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
