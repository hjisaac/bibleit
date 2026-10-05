import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

interface ReaderViewProps {
  book: string;
  chapter: number;
  targetVerse?: number;
  onBackToSearch: () => void;
  onSaveVerse: (ref: string, text: string) => void;
  onToast: (msg: string) => void;
}

interface ChapterVerse {
  num: number;
  text: string;
}

const PHILIPPIANS_4_VERSES: ChapterVerse[] = [
  { num: 1, text: 'Therefore, my brothers, beloved and longed for, my joy and crown, so stand firm in the Lord, my beloved.' },
  { num: 2, text: 'I exhort Euodia, and I exhort Syntyche, to be of the same mind in the Lord.' },
  { num: 3, text: 'Yes, I beg you also, true partner, help these women, for they labored with me in the Good News, with Clement also, and the rest of my fellow workers, whose names are in the book of life.' },
  { num: 4, text: 'Rejoice in the Lord always! Again I will say, “Rejoice!”' },
  { num: 5, text: 'Let your gentleness be known to all men. The Lord is at hand.' },
  { num: 6, text: 'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.' },
  { num: 7, text: 'And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.' },
  { num: 8, text: 'Finally, brothers, whatever things are true, whatever things are honorable, whatever things are just, whatever things are pure, whatever things are lovely, whatever things are of good report; if there is any virtue, and if there is any praise, think about these things.' },
];

export function ReaderView({
  book,
  chapter,
  targetVerse,
  onBackToSearch,
  onSaveVerse,
  onToast,
}: ReaderViewProps): JSX.Element {
  const [selectedVerse, setSelectedVerse] = useState<ChapterVerse | null>(null);
  const targetVerseRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (targetVerseRef.current) {
      targetVerseRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [targetVerse]);

  const handleCopy = () => {
    if (selectedVerse) {
      void navigator.clipboard.writeText(`${book} ${chapter}:${selectedVerse.num} - ${selectedVerse.text}`);
      onToast(`Copied ${book} ${chapter}:${selectedVerse.num}`);
    }
  };

  const handleSave = () => {
    if (selectedVerse) {
      onSaveVerse(`${book} ${chapter}:${selectedVerse.num}`, selectedVerse.text);
      onToast(`Saved ${book} ${chapter}:${selectedVerse.num}`);
      setSelectedVerse(null);
    }
  };

  return (
    <section class="flex-1 flex flex-col overflow-y-auto">
      {/* Reader Navigation Header */}
      <div
        class="px-5 py-3 border-b flex items-center justify-between sticky top-0 z-10 backdrop-blur-md"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-main)',
          }}
        >
          <span>{book === 'PHP' ? 'Philippians' : book} {chapter}</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onBackToSearch}
          class="text-xs font-medium hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          ← Back to search
        </button>
      </div>

      {/* Chapter Text */}
      <div class="p-5 sm:p-8 font-serif text-[18px] sm:text-[19px] leading-[1.85] space-y-4 max-w-2xl mx-auto w-full" style={{ color: 'var(--text-main)' }}>
        <h1 class="text-xl font-bold tracking-tight mb-1 text-center">
          {book === 'PHP' ? 'Philippians' : book} Chapter {chapter}
        </h1>
        <p class="text-xs font-sans uppercase tracking-wider font-semibold text-center mb-6" style={{ color: 'var(--text-subtle)' }}>
          Exhortation to Rejoice & Stand Firm
        </p>

        {PHILIPPIANS_4_VERSES.map((v) => {
          const isTarget = targetVerse === v.num;
          const isSelected = selectedVerse?.num === v.num;

          return (
            <p
              key={v.num}
              ref={isTarget ? targetVerseRef : undefined}
              onClick={() => setSelectedVerse(v)}
              class={`cursor-pointer transition-all p-2 rounded-xl ${
                isTarget ? 'ring-2 ring-amber-500/40' : ''
              } ${isSelected ? 'ring-2 ring-stone-500/40' : ''}`}
              style={{
                backgroundColor: isTarget ? 'var(--highlight-verse)' : 'transparent',
              }}
            >
              <sup class="text-xs opacity-50 font-sans mr-1 font-normal">
                {v.num}
              </sup>
              {v.text}
            </p>
          );
        })}
      </div>

      {/* Verse Action Tray */}
      {selectedVerse && (
        <div
          class="px-5 py-3 border-t flex items-center justify-between sticky bottom-0 backdrop-blur-md"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span class="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
            Verse {selectedVerse.num} selected
          </span>
          <div class="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleCopy}
              class="px-2.5 py-1 rounded-lg border font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
              }}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleSave}
              class="px-2.5 py-1 rounded-lg border font-medium"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setSelectedVerse(null)}
              class="p-1 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
