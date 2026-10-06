import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { BIBLE_BOOKS, type BibleBook } from '../core/bible-books';

interface BookSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChapter: (bookId: string, chapter: number) => void;
}

type TestamentFilter = 'ALL' | 'OT' | 'NT';

export function BookSelectorModal({
  isOpen,
  onClose,
  onSelectChapter,
}: BookSelectorModalProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [filterTestament, setFilterTestament] = useState<TestamentFilter>('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  const filteredBooks = BIBLE_BOOKS.filter((b) => {
    const matchesTestament =
      filterTestament === 'ALL' || b.testament === filterTestament;
    const matchesSearch =
      searchFilter.trim().length === 0 ||
      b.name.toLowerCase().includes(searchFilter.trim().toLowerCase()) ||
      b.aliases.some((a) => a.startsWith(searchFilter.trim().toLowerCase()));
    return matchesTestament && matchesSearch;
  });

  const handleSelectBook = (book: BibleBook) => {
    if (book.chapters === 1) {
      onSelectChapter(book.id, 1);
      onClose();
    } else {
      setSelectedBook(book);
    }
  };

  const handleSelectChapter = (ch: number) => {
    if (selectedBook) {
      onSelectChapter(selectedBook.id, ch);
      setSelectedBook(null);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        class="w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-t-[28px] sm:rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
      >
        {/* Modal Header */}
        <div
          class="px-5 py-3.5 border-b flex items-center justify-between shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {selectedBook ? (
            <button
              type="button"
              onClick={() => setSelectedBook(null)}
              class="flex items-center gap-1.5 text-xs font-semibold hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>← Back to books</span>
            </button>
          ) : (
            <span class="text-sm font-semibold tracking-tight">Select Passage</span>
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

        {/* Content Body */}
        <div class="p-4 overflow-y-auto flex-1 custom-scroll">
          {selectedBook ? (
            /* Stage 2: Chapter Grid */
            <div>
              <div class="mb-3 text-center">
                <h3 class="font-serif text-lg font-bold">{selectedBook.name}</h3>
                <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Select a chapter (1–{selectedBook.chapters})
                </p>
              </div>

              <div class="grid grid-cols-6 sm:grid-cols-8 gap-2">
                {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleSelectChapter(ch)}
                    class="py-2.5 rounded-xl border text-xs font-semibold transition-all hover:ring-2 hover:ring-amber-500/40"
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
          ) : (
            /* Stage 1: Book Selection */
            <div class="space-y-3">
              {/* Quick Filter Input */}
              <input
                type="text"
                placeholder="Filter books (e.g. John, Rom, Ps)..."
                value={searchFilter}
                onInput={(e) => setSearchFilter((e.target as HTMLInputElement).value)}
                class="w-full px-3.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-amber-500/40"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />

              {/* Testament Tabs */}
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
                  All (66)
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
                  Old Testament (39)
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
                  New Testament (27)
                </button>
              </div>

              {/* Book Grid */}
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {filteredBooks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBook(b)}
                    class="p-2.5 rounded-xl border text-left transition-all hover:ring-2 hover:ring-amber-500/30 flex items-center justify-between"
                    style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <span class="text-xs font-semibold">{b.name}</span>
                    <span class="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {b.chapters} ch
                    </span>
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
