import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { i18n } from '../stores/i18n';
import en from '../locales/en.json';

export const messages = i18n('modal/help', en['modal/help']);

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFeedback?: () => void;
}

export function HelpModal({ isOpen, onClose, onOpenFeedback }: HelpModalProps): JSX.Element | null {
  const tt = useStore(messages);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>('install');

  if (!isOpen) return null;

  const sections = [
    {
      id: 'install',
      title: tt.secInstallTitle,
      summary: tt.secInstallSummary,
    },
    {
      id: 'lookup',
      title: tt.secLookupTitle,
      summary: tt.secLookupSummary,
    },
    {
      id: 'search',
      title: tt.secSearchTitle,
      summary: tt.secSearchSummary,
    },
    {
      id: 'rag',
      title: tt.secRagTitle,
      summary: tt.secRagSummary,
    },
    {
      id: 'audio',
      title: tt.secAudioTitle,
      summary: tt.secAudioSummary,
    },
    {
      id: 'storage',
      title: tt.secStorageTitle,
      summary: tt.secStorageSummary,
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
            <h2 class="font-serif text-lg font-semibold">{tt.modalTitle}</h2>
            <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
              {tt.modalSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="p-1 rounded-full hover:opacity-70 text-xs"
            style={{ color: 'var(--text-muted)' }}
            title={tt.closeButtonTitle}
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
                        <p>{tt.secInstallP1}</p>
                        <div class="space-y-1.5 pl-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{tt.secInstallIosLabel}</span>
                            {tt.secInstallIosText}
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{tt.secInstallAndroidLabel}</span>
                            {tt.secInstallAndroidText}
                          </div>
                          <div>
                            <span class="font-semibold" style={{ color: 'var(--text-main)' }}>{tt.secInstallDesktopLabel}</span>
                            {tt.secInstallDesktopText}
                          </div>
                        </div>
                        <p class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {tt.secInstallFooter}
                        </p>
                      </div>
                    )}

                    {sec.id === 'lookup' && (
                      <div class="space-y-1.5">
                        <p>{tt.secLookupP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{tt.secLookupLi1Prefix}</b><code>John 3:16</code>, <code>Philippians 4:7</code></li>
                          <li><b>{tt.secLookupLi2Prefix}</b><code>Genesis 1</code>, <code>Psalm 23</code></li>
                          <li><b>{tt.secLookupLi3Prefix}</b>{tt.secLookupLi3Text}</li>
                          <li><b>{tt.secLookupLi4Prefix}</b>{tt.secLookupLi4Text}</li>
                          <li><b>{tt.secLookupLi5Prefix}</b>{tt.secLookupLi5Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'search' && (
                      <div class="space-y-1.5">
                        <p>{tt.secSearchP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{tt.secSearchLi1Prefix}</b>{tt.secSearchLi1Text}</li>
                          <li><b>{tt.secSearchLi2Prefix}</b>{tt.secSearchLi2Text}</li>
                          <li><b>{tt.secSearchLi3Prefix}</b>{tt.secSearchLi3Text}</li>
                          <li><b>{tt.secSearchLi4Prefix}</b>{tt.secSearchLi4Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'rag' && (
                      <div class="space-y-1.5">
                        <p>{tt.secRagP1}</p>
                        <p>{tt.secRagP2}</p>
                      </div>
                    )}

                    {sec.id === 'audio' && (
                      <div class="space-y-1.5">
                        <p>{tt.secAudioP1}</p>
                        <ul class="list-disc list-inside space-y-1 pl-1">
                          <li><b>{tt.secAudioLi1Prefix}</b>{tt.secAudioLi1Text}</li>
                          <li><b>{tt.secAudioLi2Prefix}</b>{tt.secAudioLi2Text}</li>
                          <li><b>{tt.secAudioLi3Prefix}</b>{tt.secAudioLi3Text}</li>
                        </ul>
                      </div>
                    )}

                    {sec.id === 'storage' && (
                      <div class="space-y-1.5">
                        <p>{tt.secStorageP1}</p>
                        <p>{tt.secStorageP2}</p>
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
              <span>{tt.sendFeedbackButton}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
