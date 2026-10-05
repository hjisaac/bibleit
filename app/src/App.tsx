import { h, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { createDefaultEngine } from './composition';
import { Header, type Theme } from './components/Header';
import { Navbar, type ViewTab } from './components/Navbar';
import { SearchView } from './components/SearchView';
import { ReaderView } from './components/ReaderView';
import { SavedView, type SavedVerse } from './components/SavedView';
import { SettingsView } from './components/SettingsView';

export function App(): JSX.Element {
  const engine = useMemo(() => createDefaultEngine(), []);

  const [theme, setTheme] = useState<Theme>('paper');
  const [activeTab, setActiveTab] = useState<ViewTab>('search');
  const [isInspectorMode, setIsInspectorMode] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
    document.body.className = `antialiased font-sans flex justify-center min-h-screen p-2 sm:p-6 theme-${theme}`;
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
      class="w-full max-w-md flex flex-col h-[840px] rounded-[36px] shadow-2xl border overflow-hidden relative transition-colors"
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
            onToast={showToast}
          />
        )}

        {activeTab === 'reader' && (
          <ReaderView
            book={readerLocation.book}
            chapter={readerLocation.chapter}
            targetVerse={readerLocation.targetVerse}
            onBackToSearch={() => setActiveTab('search')}
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
            isInspectorMode={isInspectorMode}
            onToggleInspector={setIsInspectorMode}
            onClearStorage={() => showToast('Offline artifacts cleared.')}
          />
        )}
      </main>

      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div class="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-xs font-semibold text-white bg-stone-900 border border-stone-700 animate-fadeIn">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
