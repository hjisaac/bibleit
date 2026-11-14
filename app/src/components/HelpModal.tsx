import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback?: () => void;
}

interface HelpSection {
  id: string;
  title: string;
  summary: string;
}

const SECTIONS: HelpSection[] = [
  {
    id: 'install',
    title: 'Install as an Offline App (PWA)',
    summary: 'Install bibleit on your phone or desktop for full-screen offline access.',
  },
  {
    id: 'lookup',
    title: 'Scripture Reference Lookups',
    summary: 'Fast book, chapter, and verse citations without clunky search forms.',
  },
  {
    id: 'search',
    title: 'Semantic & Keyword Search',
    summary: 'Find passages by meaning or exact phrasing with hybrid retrieval.',
  },
  {
    id: 'rag',
    title: 'Grounded Scripture Synthesis',
    summary: 'AI overviews strictly anchored to retrieved verses with exact citations.',
  },
  {
    id: 'audio',
    title: 'Audio Narration & Playback',
    summary: 'Listen to any passage, search result, or summary with natural speech.',
  },
  {
    id: 'storage',
    title: 'Offline Storage & Privacy',
    summary: 'Zero remote tracking. Your texts and embeddings stay on your device.',
  },
];

export function HelpModal({ isOpen, onClose, onOpenFeedback }: HelpModalProps): JSX.Element | null {
  if (!isOpen) return null;

  const [expandedSectionId, setExpandedSectionId] = useState<string | null>('install');

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
            <h2 class="font-serif text-lg font-semibold">Help & Guide</h2>
            <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
              How to install, search, and navigate bibleit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="p-1 rounded-full hover:opacity-70 text-xs"
            style={{ color: 'var(--text-muted)' }}
            title="Close guide"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Expandable Accordion List */}
        <div class="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain space-y-2 pr-1">
          {SECTIONS.map((sec) => {
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
                        <p>
                          bibleit is an offline Progressive Web App (PWA). You can install it on your device for standalone, instant launching without an app store:
                        </p>
                        <div class="space-y-1.5 pl-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>iOS (Safari): </span>
                            Tap the <b>Share</b> button (square with arrow) at the bottom → scroll down and select <b>Add to Home Screen</b>.
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>Android (Chrome): </span>
                            Tap the <b>three dots menu (⋮)</b> in the top right → select <b>Install App</b> (or <b>Add to Home Screen</b>).
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>Desktop (Chrome / Edge): </span>
                            Click the <b>Install</b> icon on the right side of the address bar → confirm <b>Install</b>.
                          </div>
                        </div>
                        <p class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          Once installed, the Bible text and indexes remain cached locally on your device.
                        </p>
                      </div>
                    )}

                    {sec.id === 'lookup' && (
                      <div class="space-y-1.5">
                        <p>
                          Jump directly to any passage by typing canonical citations:
                        </p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>Exact verse:</b> <code>John 3:16</code>, <code>Philippians 4:7</code></li>
                          <li><b>Full chapter:</b> <code>Genesis 1</code>, <code>Psalm 23</code></li>
                          <li><b>As-you-type navigator:</b> Typing a prefix like <code>Rom</code> reveals a 1-16 chapter strip to jump directly with 1 tap.</li>
                          <li><b>Visual book picker:</b> In the Reader tab, tap the book title to open the 66-book selector.</li>
                          <li><b>Bookmarks:</b> Tap the bookmark icon on any passage or card to save verses locally in the Saved tab.</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'search' && (
                      <div class="space-y-1.5">
                        <p>
                          bibleit uses a hybrid retrieval engine combining two search modes:
                        </p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>Keyword match (BM25):</b> Fast lexical search for exact terms and phrases (e.g. <code>armor of God</code>).</li>
                          <li><b>Semantic search:</b> Conceptual embeddings find passages by meaning even when words differ (e.g. <code>peace in anxiety</code>).</li>
                          <li><b>Reciprocal Rank Fusion:</b> Both lists merge into a single ranked result stream.</li>
                          <li><b>Retrieval Inspector:</b> Enable Inspector Mode in Settings to inspect cosine scores, BM25 signals, and retrieval timings.</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'rag' && (
                      <div class="space-y-1.5">
                        <p>
                          When search runs, bibleit generates a <b>Grounded Summary</b> anchored strictly to retrieved scripture passages with exact chapter and verse citations.
                        </p>
                        <p>
                          You can toggle AI summaries on or off in Settings, and install the on-device language model for completely offline generation.
                        </p>
                      </div>
                    )}

                    {sec.id === 'audio' && (
                      <div class="space-y-1.5">
                        <p>
                          Listen to scripture hands-free with built-in speech narration:
                        </p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>One-tap listening:</b> Tap the speaker icon on any passage card, AI summary, or chapter header to begin.</li>
                          <li><b>Speed controls:</b> Cycle playback speed between 0.5x, 0.75x, 1x, 1.25x, and 1.5x in the bottom audio bar.</li>
                          <li><b>Active tracking:</b> The audio bar follows along and automatically scrolls to the card or verse currently being spoken.</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'storage' && (
                      <div class="space-y-1.5">
                        <p>
                          All scripture data, indexes, and on-device models run locally via the browser's <b>Origin Private File System (OPFS)</b>.
                        </p>
                        <p>
                          Search queries and readings remain strictly on your device. You can download or clear offline packages anytime in the <b>Settings</b> tab.
                        </p>
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
              <span>Send Feedback</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
