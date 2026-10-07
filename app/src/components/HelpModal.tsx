import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
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
    id: 'storage',
    title: 'Offline Storage & Privacy',
    summary: 'Zero remote tracking. Your texts and embeddings stay on your device.',
  },
];

export function HelpModal({ isOpen, onClose }: HelpModalProps): JSX.Element | null {
  if (!isOpen) return null;

  const [expandedId, setExpandedId] = useState<string | null>('install');

  const toggleSection = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        class="w-full max-w-lg rounded-2xl border p-5 sm:p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col"
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
        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          {SECTIONS.map((sec) => {
            const isExpanded = expandedId === sec.id;

            return (
              <div
                key={sec.id}
                class="rounded-xl border transition-all"
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
                  <div>
                    <h3 class="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
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
                            Tap the <b>Share</b> button (square with arrow) at the bottom $\to$ scroll down and select <b>Add to Home Screen</b>.
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>Android (Chrome): </span>
                            Tap the <b>three dots menu (⋮)</b> in the top right $\to$ select <b>Install App</b> (or <b>Add to Home Screen</b>).
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>Desktop (Chrome / Edge): </span>
                            Click the <b>Install</b> icon on the right side of the address bar $\to$ confirm <b>Install</b>.
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
                          <li><b>As-you-type navigator:</b> Typing a prefix like <code>Rom</code> reveals a 1–16 chapter strip to jump directly with 1 tap.</li>
                          <li><b>Visual book picker:</b> In the Reader tab, tap the book title to open the 2-tap 66-book selector.</li>
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
                        </ul>
                      </div>
                    )}

                    {sec.id === 'rag' && (
                      <div class="space-y-1.5">
                        <p>
                          When you type a thematic question (e.g. <i>"What did Jesus teach about worry?"</i>), an on-demand <b>Synthesize</b> banner appears.
                        </p>
                        <p>
                          The synthesis is strictly grounded on the retrieved Bible passages and cites exact chapter/verse references. The source verses remain immediately below for verification.
                        </p>
                      </div>
                    )}

                    {sec.id === 'storage' && (
                      <div class="space-y-1.5">
                        <p>
                          All scripture data, indexes, and quantized vector matrices run on your device via the browser’s <b>Origin Private File System (OPFS)</b>.
                        </p>
                        <p>
                          Search queries are never sent to external tracking servers. You can manage or clear cached data anytime from the <b>Settings</b> tab.
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
        <div class="pt-3 border-t flex justify-end shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            class="px-4 py-1.5 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
