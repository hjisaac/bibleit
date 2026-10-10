import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createDefaultEngine } from './composition';
import { Header, type Theme } from './components/Header';
import { Navbar, type ViewTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView, type PackageStatus } from './components/SettingsView';
import { BookSelectorModal } from './components/BookSelectorModal';
import { HelpModal } from './components/HelpModal';

export function App(): JSX.Element {
  const engine = useMemo(() => createDefaultEngine(), []);

  const [theme, setTheme] = useState<Theme>('paper');
  const [activeTab, setActiveTab] = useState<ViewTab>('search');
  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

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
  }>({
    book: 'PHP',
    chapter: 4,
    targetVerse: 7,
    scrollKey: 0,
  });

  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([
    {
      id: '1',
      ref: 'Philippians 4:7',
      text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
    },
  ]);

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

  const handleDownloadText = () => {
    setTextPackageStatus('downloading');
    setTextProgress(15);
    setTimeout(() => setTextProgress(55), 300);
    setTimeout(() => setTextProgress(85), 650);
    setTimeout(() => {
      setTextProgress(100);
      setTextPackageStatus('ready');
      showToast('Scripture text installed offline (2.0 MB)');
    }, 950);
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

  const handleClearStorage = () => {
    setTextPackageStatus('not_downloaded');
    setAiPackageStatus('not_downloaded');
    setTextProgress(0);
    setAiProgress(0);
    showToast('Offline artifacts cleared.');
  };

  const handleOpenStorage = () => {
    setActiveTab('settings');
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
    document.body.className = `antialiased font-sans min-h-screen theme-${theme}`;
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

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  const handleOpenReader = (book: string, chapter: number, verse: number) => {
    setReaderLocation({ book, chapter, targetVerse: verse, scrollKey: Date.now() });
    setActiveTab('reader');
  };

  const handleSaveVerse = (ref: string, text: string) => {
    setSavedVerses((prev) => [
      ...prev.filter((v) => v.ref !== ref),
      { id: Date.now().toString(), ref, text },
    ]);
  };

  return (
    <div
      class="w-full max-w-3xl min-h-screen flex flex-col sm:border-x shadow-sm relative transition-colors"
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
        {activeTab === 'search' && (
          <SearchView
            engine={engine}
            isOnline={isOnline}
            isAiEnabled={isAiEnabled}
            isInspectorMode={isInspectorMode}
            offlineTextStatus={textPackageStatus}
            hasSeenOnboarding={hasSeenStorageBanner}
            onOpenStorage={handleOpenStorage}
            onDismissOnboarding={handleDismissOnboarding}
            onOpenReader={handleOpenReader}
            onToast={showToast}
          />
        )}

        {activeTab === 'reader' && (
          <ReaderView
            book={readerLocation.book}
            chapter={readerLocation.chapter}
            targetVerse={readerLocation.targetVerse}
            scrollKey={readerLocation.scrollKey}
            onBackToSearch={() => setActiveTab('search')}
            onOpenSelector={() => setIsSelectorOpen(true)}
            onSaveVerse={handleSaveVerse}
            onToast={showToast}
          />
        )}

        {activeTab === 'saved' && (
          <SavedView
            savedVerses={savedVerses}
            onOpenVerse={(ref) => {
              const [book, rest] = ref.split(' ');
              const [chapter, verse] = (rest ?? '').split(':');
              handleOpenReader(book ?? 'PHP', Number(chapter ?? 4), Number(verse ?? 7));
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
            textPackageStatus={textPackageStatus}
            aiPackageStatus={aiPackageStatus}
            textProgress={textProgress}
            aiProgress={aiProgress}
            highlightStorage={highlightStorage}
            onClearHighlight={() => setHighlightStorage(false)}
            onDownloadText={handleDownloadText}
            onDownloadAi={handleDownloadAi}
            onClearStorage={handleClearStorage}
          />
        )}
      </main>

      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Book, Chapter & Verse Selection Modal */}
      <BookSelectorModal
        isOpen={isSelectorOpen}
        initialBookId={readerLocation.book}
        initialChapter={readerLocation.chapter}
        onClose={() => setIsSelectorOpen(false)}
        onSelectPassage={(bookId, chapter, verse) => handleOpenReader(bookId, chapter, verse)}
      />

      {/* Quick Help & Shortcuts Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div class="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-xs font-semibold text-white bg-stone-900 border border-stone-700 animate-fadeIn">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
