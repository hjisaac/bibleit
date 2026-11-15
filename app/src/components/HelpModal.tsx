import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { i18n } from '../stores/i18n';

export const messages = i18n('modal/help', {
  modalTitle: 'Help & Guide',
  modalSubtitle: 'How to install, search, and navigate bibleit',
  closeButtonTitle: 'Close guide',
  sendFeedbackButton: 'Send Feedback',

  secInstallTitle: 'Install as an Offline App (PWA)',
  secInstallSummary: 'Install bibleit on your phone or desktop for full-screen offline access.',
  secInstallP1: 'bibleit is an offline Progressive Web App (PWA). You can install it on your device for standalone, instant launching without an app store:',
  secInstallIosLabel: 'iOS (Safari): ',
  secInstallIosText: 'Tap the Share button (square with arrow) at the bottom → scroll down and select Add to Home Screen.',
  secInstallAndroidLabel: 'Android (Chrome): ',
  secInstallAndroidText: 'Tap the three dots menu (⋮) in the top right → select Install App (or Add to Home Screen).',
  secInstallDesktopLabel: 'Desktop (Chrome / Edge): ',
  secInstallDesktopText: 'Click the Install icon on the right side of the address bar → confirm Install.',
  secInstallFooter: 'Once installed, the Bible text and indexes remain cached locally on your device.',

  secLookupTitle: 'Scripture Reference Lookups',
  secLookupSummary: 'Fast book, chapter, and verse citations without clunky search forms.',
  secLookupP1: 'Jump directly to any passage by typing canonical citations:',
  secLookupLi1Prefix: 'Exact verse: ',
  secLookupLi2Prefix: 'Full chapter: ',
  secLookupLi3Prefix: 'As-you-type navigator: ',
  secLookupLi3Text: 'Typing a prefix like Rom reveals a 1-16 chapter strip to jump directly with 1 tap.',
  secLookupLi4Prefix: 'Visual book picker: ',
  secLookupLi4Text: 'In the Reader tab, tap the book title to open the 66-book selector.',
  secLookupLi5Prefix: 'Bookmarks: ',
  secLookupLi5Text: 'Tap the bookmark icon on any passage or card to save verses locally in the Saved tab.',

  secSearchTitle: 'Semantic & Keyword Search',
  secSearchSummary: 'Find passages by meaning or exact phrasing with hybrid retrieval.',
  secSearchP1: 'bibleit uses a hybrid retrieval engine combining two search modes:',
  secSearchLi1Prefix: 'Keyword match (BM25): ',
  secSearchLi1Text: 'Fast lexical search for exact terms and phrases (e.g. armor of God).',
  secSearchLi2Prefix: 'Semantic search: ',
  secSearchLi2Text: 'Conceptual embeddings find passages by meaning even when words differ (e.g. peace in anxiety).',
  secSearchLi3Prefix: 'Reciprocal Rank Fusion: ',
  secSearchLi3Text: 'Both lists merge into a single ranked result stream.',
  secSearchLi4Prefix: 'Retrieval Inspector: ',
  secSearchLi4Text: 'Enable Inspector Mode in Settings to inspect cosine scores, BM25 signals, and retrieval timings.',

  secRagTitle: 'Grounded Scripture Synthesis',
  secRagSummary: 'AI overviews strictly anchored to retrieved verses with exact citations.',
  secRagP1: 'When search runs, bibleit generates a Grounded Summary anchored strictly to retrieved scripture passages with exact chapter and verse citations.',
  secRagP2: 'You can toggle AI summaries on or off in Settings, and install the on-device language model for completely offline generation.',

  secAudioTitle: 'Audio Narration & Playback',
  secAudioSummary: 'Listen to any passage, search result, or summary with natural speech.',
  secAudioP1: 'Listen to scripture hands-free with built-in speech narration:',
  secAudioLi1Prefix: 'One-tap listening: ',
  secAudioLi1Text: 'Tap the speaker icon on any passage card, AI summary, or chapter header to begin.',
  secAudioLi2Prefix: 'Speed controls: ',
  secAudioLi2Text: 'Cycle playback speed between 0.5x, 0.75x, 1x, 1.25x, and 1.5x in the bottom audio bar.',
  secAudioLi3Prefix: 'Active tracking: ',
  secAudioLi3Text: 'The audio bar follows along and automatically scrolls to the card or verse currently being spoken.',

  secStorageTitle: 'Offline Storage & Privacy',
  secStorageSummary: 'Zero remote tracking. Your texts and embeddings stay on your device.',
  secStorageP1: "All scripture data, indexes, and on-device models run locally via the browser's Origin Private File System (OPFS).",
  secStorageP2: 'Search queries and readings remain strictly on your device. You can download or clear offline packages anytime in the Settings tab.',
});

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback?: () => void;
}

export function HelpModal({ isOpen, onClose, onOpenFeedback }: HelpModalProps): JSX.Element | null {
  const t = useStore(messages);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>('install');

  if (!isOpen) return null;

  const sections = [
    {
      id: 'install',
      title: t.secInstallTitle,
      summary: t.secInstallSummary,
    },
    {
      id: 'lookup',
      title: t.secLookupTitle,
      summary: t.secLookupSummary,
    },
    {
      id: 'search',
      title: t.secSearchTitle,
      summary: t.secSearchSummary,
    },
    {
      id: 'rag',
      title: t.secRagTitle,
      summary: t.secRagSummary,
    },
    {
      id: 'audio',
      title: t.secAudioTitle,
      summary: t.secAudioSummary,
    },
    {
      id: 'storage',
      title: t.secStorageTitle,
      summary: t.secStorageSummary,
    },
  ];

  const toggleSection = (id: string) => {
    setExpandedSectionId((prev) => (prev === id ? null : id));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-fadeIn overflow-hidden overscroll-contain"
      onClick={onClose}
    >
      <div
        class="w-full max-w-lg rounded-t-[28px] sm:rounded-2xl border p-5 sm:p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col overscroll-contain"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div class="flex items-center justify-between border-b pb-3 shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h2 class="font-serif text-lg font-semibold">{t.modalTitle}</h2>
            <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="p-1 rounded-full hover:opacity-70 text-xs"
            style={{ color: 'var(--text-muted)' }}
            title={t.closeButtonTitle}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Expandable Accordion List */}
        <div class="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain space-y-2 pr-1">
          {sections.map((sec) => {
            const isExpanded = expandedSectionId === sec.id;

            return (
              <div
                key={sec.id}
                class="rounded-xl border transition-colors duration-150 overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: isExpanded ? 'var(--accent)' : 'var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  class="w-full text-left p-3 flex items-center justify-between gap-2 transition-opacity hover:opacity-90"
                >
                  <div class="min-w-0 flex-1">
                    <h3 class="text-xs font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                      {sec.title}
                    </h3>
                    {!isExpanded && (
                      <p class="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {sec.summary}
                      </p>
                    )}
                  </div>
                  <svg
                    class={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-amber-600 dark:text-amber-400' : ''
                    }`}
                    style={{ color: isExpanded ? undefined : 'var(--text-subtle)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div
                    class="px-3 pb-3.5 pt-1 text-xs leading-relaxed border-t animate-fadeIn space-y-2.5"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {sec.id === 'install' && (
                      <div class="space-y-2">
                        <p>{t.secInstallP1}</p>
                        <div class="space-y-1.5 pl-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{t.secInstallIosLabel}</span>
                            {t.secInstallIosText}
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{t.secInstallAndroidLabel}</span>
                            {t.secInstallAndroidText}
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{t.secInstallDesktopLabel}</span>
                            {t.secInstallDesktopText}
                          </div>
                        </div>
                        <p class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {t.secInstallFooter}
                        </p>
                      </div>
                    )}

                    {sec.id === 'lookup' && (
                      <div class="space-y-1.5">
                        <p>{t.secLookupP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{t.secLookupLi1Prefix}</b><code>John 3:16</code>, <code>Philippians 4:7</code></li>
                          <li><b>{t.secLookupLi2Prefix}</b><code>Genesis 1</code>, <code>Psalm 23</code></li>
                          <li><b>{t.secLookupLi3Prefix}</b>{t.secLookupLi3Text}</li>
                          <li><b>{t.secLookupLi4Prefix}</b>{t.secLookupLi4Text}</li>
                          <li><b>{t.secLookupLi5Prefix}</b>{t.secLookupLi5Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'search' && (
                      <div class="space-y-1.5">
                        <p>{t.secSearchP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{t.secSearchLi1Prefix}</b>{t.secSearchLi1Text}</li>
                          <li><b>{t.secSearchLi2Prefix}</b>{t.secSearchLi2Text}</li>
                          <li><b>{t.secSearchLi3Prefix}</b>{t.secSearchLi3Text}</li>
                          <li><b>{t.secSearchLi4Prefix}</b>{t.secSearchLi4Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'rag' && (
                      <div class="space-y-1.5">
                        <p>{t.secRagP1}</p>
                        <p>{t.secRagP2}</p>
                      </div>
                    )}

                    {sec.id === 'audio' && (
                      <div class="space-y-1.5">
                        <p>{t.secAudioP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{t.secAudioLi1Prefix}</b>{t.secAudioLi1Text}</li>
                          <li><b>{t.secAudioLi2Prefix}</b>{t.secAudioLi2Text}</li>
                          <li><b>{t.secAudioLi3Prefix}</b>{t.secAudioLi3Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'storage' && (
                      <div class="space-y-1.5">
                        <p>{t.secStorageP1}</p>
                        <p>{t.secStorageP2}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {onOpenFeedback && (
          <div
            class="pt-3 border-t shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFeedback();
              }}
              class="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
              style={{
                backgroundColor: 'var(--accent)',
              }}
            >
              <svg
                class="w-3.5 h-3.5 shrink-0 text-white/80"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <span>{t.sendFeedbackButton}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
