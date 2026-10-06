import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createDefaultEngine } from './composition';
import { Header, type Theme } from './components/Header';
import { Navbar, type ViewTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView } from './components/SettingsView';
import { BookSelectorModal } from './components/BookSelectorModal';

export function App(): JSX.Element {
  const engine = useMemo(() => createDefaultEngine(), []);

  const [theme, setTheme] = useState<Theme>('paper');
  const [activeTab, setActiveTab] = useState<ViewTab>('search');
  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const [readerLocation, setReaderLocation] = useState<{
    book: string;
    chapter: number;
    targetVerse?: number;
  }>({
    book: 'PHP',
    chapter: 4,
    targetVerse: 7,
  });

  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([
    {
      id: '1',
      ref: 'Philippians 4:7',
      text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.',
    },
  ]);

  // Sync theme class to document body.
  useEffect(() => {
    document.body.className = `antialiased font-sans flex justify-center min-h-screen theme-${theme}`;
  }, [theme]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  const handleOpenReader = (book: string, chapter: number, verse: number) => {
    setReaderLocation({ book, chapter, targetVerse: verse });
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
        currentTheme={theme}
        onThemeChange={setTheme}
        isOfflineReady={true}
      />

      <main class="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'search' && (
          <SearchView
            engine={engine}
            isInspectorMode={isInspectorMode}
            onOpenReader={handleOpenReader}
            onOpenSelector={() => setIsSelectorOpen(true)}
            onToast={showToast}
          />
        )}

        {activeTab === 'reader' && (
          <ReaderView
            book={readerLocation.book}
            chapter={readerLocation.chapter}
            targetVerse={readerLocation.targetVerse}
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
            isInspectorMode={isInspectorMode}
            onToggleInspector={setIsInspectorMode}
            onClearStorage={() => showToast('Offline artifacts cleared.')}
          />
        )}
      </main>

      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Book & Chapter Selection Modal */}
      <BookSelectorModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        onSelectChapter={(bookId, chapter) => handleOpenReader(bookId, chapter, 1)}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div class="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-xs font-semibold text-white bg-stone-900 border border-stone-700 animate-fadeIn">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
