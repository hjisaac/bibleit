import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { BIBLE_BOOKS, BIBLE_BOOKS_BY_ID, type BibleBook, getLocalizedBookName } from '../core/bible-books';
import { getVerseCount } from '../core/verse-counts';
import { $locale, i18n } from '../stores/i18n';
import { params } from '@nanostores/i18n';

export const messages = i18n('modal/bookSelector', {
  backToChapters: 'Back to chapters',
  backToBooks: 'Back to books',
  selectPassage: 'Select Passage',
  stepBook: '1. Book',
  stepChapter: params('2. Chapter {ch}'),
  stepVerse: '3. Verse',
  filterPlaceholder: 'Filter books (e.g. John, Rom, Ps)...',
  filterAll: 'All (66)',
  filterOt: 'OT (39)',
  filterNt: 'NT (27)',
  chaptersSingular: 'ch',
  chaptersPlural: 'chs',
  selectChapterSubtitle: params('Select chapter (1–{max})'),
  chapterHeader: params('{book} Chapter {ch}'),
  selectVerseSubtitle: params('Select verse (1–{max})'),
});

interface BookSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassage: (bookId: string, chapter: number, verse: number) => void;
  initialBookId?: string;
  initialChapter?: number;
}

type SelectorStep = 'book' | 'chapter' | 'verse';
type TestamentFilter = 'ALL' | 'OT' | 'NT';

export function BookSelectorModal({
  isOpen,
  onClose,
  onSelectPassage,
  initialBookId,
  initialChapter,
}: BookSelectorModalProps): JSX.Element | null {
  const t = useStore(messages);
  const currentLocale = useStore($locale);

  if (!isOpen) {
    return null;
  }

  const [currentStep, setCurrentStep] = useState<SelectorStep>('book');
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [filterTestament, setFilterTestament] = useState<TestamentFilter>('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  // Sync initial location when modal opens.
  useEffect(() => {
    if (isOpen) {
      const initial = initialBookId ? BIBLE_BOOKS_BY_ID[initialBookId] : null;
      setSelectedBook(initial ?? BIBLE_BOOKS[0]!);
      setSelectedChapter(initialChapter ?? 1);
      setCurrentStep('book');
      setSearchFilter('');
    }
  }, [isOpen, initialBookId, initialChapter]);

  const filteredBooks = BIBLE_BOOKS.filter((b) => {
    const matchesTestament =
      filterTestament === 'ALL' || b.testament === filterTestament;
    const localized = getLocalizedBookName(b.id, currentLocale);
    const matchesSearch =
      searchFilter.trim().length === 0 ||
      b.name.toLowerCase().includes(searchFilter.trim().toLowerCase()) ||
      localized.toLowerCase().includes(searchFilter.trim().toLowerCase()) ||
      b.aliases.some((a) => a.startsWith(searchFilter.trim().toLowerCase()));
    return matchesTestament && matchesSearch;
  });

  const totalVerses = selectedBook
    ? getVerseCount(selectedBook.id, selectedChapter)
    : 30;

  const handleSelectBook = (book: BibleBook) => {
    setSelectedBook(book);
    setSelectedChapter(1);
    if (book.chapters === 1) {
      setCurrentStep('verse');
    } else {
      setCurrentStep('chapter');
    }
  };

  const handleSelectChapter = (ch: number) => {
    setSelectedChapter(ch);
    setCurrentStep('verse');
  };

  const handleSelectVerse = (verseNum: number) => {
    if (selectedBook) {
      onSelectPassage(selectedBook.id, selectedChapter, verseNum);
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep === 'verse') {
      if (selectedBook && selectedBook.chapters === 1) {
        setCurrentStep('book');
      } else {
        setCurrentStep('chapter');
      }
    } else if (currentStep === 'chapter') {
      setCurrentStep('book');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn overflow-hidden overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        class="w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-t-[28px] sm:rounded-2xl border shadow-2xl overflow-hidden overscroll-contain"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
      >
        {/* Modal Header */}
        <div
          class="px-5 py-3 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {currentStep !== 'book' ? (
            <button
              type="button"
              onClick={handleBack}
              class="flex items-center gap-1.5 text-xs font-semibold hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
              </svg>
              <span>
                {currentStep === 'verse' && selectedBook?.chapters !== 1
                  ? t.backToChapters
                  : t.backToBooks}
              </span>
            </button>
          ) : (
            <span class="text-sm font-semibold tracking-tight">{t.selectPassage}</span>
          )}

          <button
            type="button"
            onClick={onClose}
            class="p-1 rounded-full text-xs font-semibold hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Step Tabs */}
        <div
          class="px-4 py-2 border-b flex items-center gap-1.5 shrink-0 text-xs overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentStep('book')}
            class={`px-3 py-1 rounded-lg font-semibold transition-all ${
              currentStep === 'book'
                ? 'shadow-sm'
                : 'hover:opacity-75'
            }`}
            style={{
              backgroundColor: currentStep === 'book' ? 'var(--bg-surface)' : 'transparent',
              color: currentStep === 'book' ? 'var(--text-main)' : 'var(--text-muted)',
            }}
          >
            {selectedBook ? `1. ${getLocalizedBookName(selectedBook.id, currentLocale)}` : t.stepBook}
          </button>

          <span class="text-xs opacity-40">›</span>

          <button
            type="button"
            disabled={!selectedBook || selectedBook.chapters === 1}
            onClick={() => selectedBook && setCurrentStep('chapter')}
            class={`px-3 py-1 rounded-lg font-semibold transition-all ${
              currentStep === 'chapter'
                ? 'shadow-sm'
                : 'hover:opacity-75'
            } ${!selectedBook || selectedBook.chapters === 1 ? 'opacity-35 cursor-not-allowed' : ''}`}
            style={{
              backgroundColor: currentStep === 'chapter' ? 'var(--bg-surface)' : 'transparent',
              color: currentStep === 'chapter' ? 'var(--text-main)' : 'var(--text-muted)',
            }}
          >
            {t.stepChapter({ ch: selectedBook?.chapters === 1 ? '1' : String(selectedChapter) })}
          </button>

          <span class="text-xs opacity-40">›</span>

          <button
            type="button"
            disabled={!selectedBook}
            onClick={() => selectedBook && setCurrentStep('verse')}
            class={`px-3 py-1 rounded-lg font-semibold transition-all ${
              currentStep === 'verse'
                ? 'shadow-sm'
                : 'hover:opacity-75'
            } ${!selectedBook ? 'opacity-35 cursor-not-allowed' : ''}`}
            style={{
              backgroundColor: currentStep === 'verse' ? 'var(--bg-surface)' : 'transparent',
              color: currentStep === 'verse' ? 'var(--text-main)' : 'var(--text-muted)',
            }}
          >
            {t.stepVerse}
          </button>
        </div>

        {/* Content Body */}
        <div class="p-4 overflow-y-auto overscroll-contain flex-1 custom-scroll">
          {/* Step 1: Books */}
          {currentStep === 'book' && (
            <div class="space-y-3">
              <input
                type="text"
                placeholder={t.filterPlaceholder}
                value={searchFilter}
                onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
                class="w-full px-3.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-amber-500/40"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />

              <div
                class="flex items-center p-1 rounded-xl text-xs"
                style={{ backgroundColor: 'var(--bg-surface-elevated)' }}
              >
                <button
                  type="button"
                  onClick={() => setFilterTestament('ALL')}
                  class={`flex-1 py-1 rounded-lg font-medium transition-all ${
                    filterTestament === 'ALL' ? 'shadow-sm font-semibold' : ''
                  }`}
                  style={{
                    backgroundColor:
                      filterTestament === 'ALL' ? 'var(--bg-surface)' : 'transparent',
                    color:
                      filterTestament === 'ALL' ? 'var(--text-main)' : 'var(--text-muted)',
                  }}
                >
                  {t.filterAll}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTestament('OT')}
                  class={`flex-1 py-1 rounded-lg font-medium transition-all ${
                    filterTestament === 'OT' ? 'shadow-sm font-semibold' : ''
                  }`}
                  style={{
                    backgroundColor:
                      filterTestament === 'OT' ? 'var(--bg-surface)' : 'transparent',
                    color:
                      filterTestament === 'OT' ? 'var(--text-main)' : 'var(--text-muted)',
                  }}
                >
                  {t.filterOt}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTestament('NT')}
                  class={`flex-1 py-1 rounded-lg font-medium transition-all ${
                    filterTestament === 'NT' ? 'shadow-sm font-semibold' : ''
                  }`}
                  style={{
                    backgroundColor:
                      filterTestament === 'NT' ? 'var(--bg-surface)' : 'transparent',
                    color:
                      filterTestament === 'NT' ? 'var(--text-main)' : 'var(--text-muted)',
                  }}
                >
                  {t.filterNt}
                </button>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {filteredBooks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBook(b)}
                    class={`p-2.5 rounded-xl border text-left transition-all hover:ring-2 hover:ring-amber-500/30 flex items-center justify-between ${
                      selectedBook?.id === b.id ? 'ring-2 ring-amber-500/50' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span class="text-xs font-semibold">{getLocalizedBookName(b.id, currentLocale)}</span>
                    <span class="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {b.chapters} {b.chapters === 1 ? t.chaptersSingular : t.chaptersPlural}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Chapters */}
          {currentStep === 'chapter' && selectedBook && (
            <div class="space-y-3">
              <div class="text-center">
                <h3 class="font-serif text-lg font-bold">{getLocalizedBookName(selectedBook.id, currentLocale)}</h3>
                <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t.selectChapterSubtitle({ max: selectedBook.chapters })}
                </p>
              </div>

              <div class="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleSelectChapter(ch)}
                    class={`py-2.5 rounded-xl border text-xs font-semibold transition-all hover:ring-2 hover:ring-amber-500/40 ${
                      selectedChapter === ch ? 'ring-2 ring-amber-500/50' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Verses */}
          {currentStep === 'verse' && selectedBook && (
            <div class="space-y-3">
              <div class="text-center">
                <h3 class="font-serif text-lg font-bold">
                  {t.chapterHeader({ book: getLocalizedBookName(selectedBook.id, currentLocale), ch: selectedChapter })}
                </h3>
                <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t.selectVerseSubtitle({ max: totalVerses })}
                </p>
              </div>

              <div class="grid grid-cols-6 sm:grid-cols-8 gap-2 pt-1">
                {Array.from({ length: totalVerses }, (_, i) => i + 1).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleSelectVerse(v)}
                    class="py-2.5 rounded-xl border text-xs font-semibold transition-all hover:ring-2 hover:ring-amber-500/40"
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
