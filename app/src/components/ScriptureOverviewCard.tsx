import type { JSX } from 'preact';
import type { AudioNarrator } from '../core/ports';
import type { NarrationState, ScoredPassage } from '../core/types';
import { renderHighlightedText } from './SearchView';

export interface ScriptureOverviewCardProps {
  /** User preference toggle controlling whether AI generation is active. */
  isAiEnabled: boolean;
  /** Accumulated text streamed from the LLM. */
  answerText: string;
  /** True while the model request is in-flight or actively streaming tokens. */
  isSynthesizing: boolean;
  /** Error message if generation failed or scripture was unavailable. */
  synthesisError: string | null;
  /** Name of model/provider that generated the summary for telemetry badge. */
  synthesisModel: string | null;
  /** Controls card expansion state when viewing long summaries. */
  isSynthesisCollapsed: boolean;
  onToggleCollapse: () => void;
  onDismissError: () => void;
  onCopyAnswer: (text: string) => void;
  narrator?: AudioNarrator;
  narrationState?: NarrationState;
  firstPassage?: ScoredPassage;
  isInspectorMode?: boolean;
  synthesisTtftMs?: number | null;
  synthesisTokensPerSec?: number | null;
}

export function ScriptureOverviewCard({
  isAiEnabled,
  answerText,
  isSynthesizing,
  synthesisError,
  synthesisModel,
  isSynthesisCollapsed,
  onToggleCollapse,
  onDismissError,
  onCopyAnswer,
  narrator,
  narrationState,
  firstPassage,
  isInspectorMode,
  synthesisTtftMs,
  synthesisTokensPerSec,
}: ScriptureOverviewCardProps): JSX.Element | null {
  // 1. isAiEnabled: User opted into AI summaries in preferences.
  // 2. hasContent: Model streamed at least one token or finished answer.
  const hasContent = answerText.length > 0;
  // 3. isSynthesizing: Request started; shows loading pulse before first token arrives.
  // 4. hasError: Model failed or device offline; shows error state.
  const hasError = Boolean(synthesisError);

  // Mount only when feature is enabled AND there is active state to display.
  const shouldRender = isAiEnabled && (hasContent || isSynthesizing || hasError);

  if (!shouldRender) {
    return null;
  }

  const isSynthesisActive =
    narrationState?.status !== 'idle' &&
    narrationState?.activeSegment?.id === 'synthesis:overview';
  const isSynthesisPlaying = isSynthesisActive && narrationState?.status === 'playing';

  const handleToggleNarration = () => {
    if (!narrator || !narrator.supported || !answerText) return;
    if (isSynthesisActive) {
      if (isSynthesisPlaying) {
        narrator.pause();
      } else {
        narrator.resume();
      }
      return;
    }
    narrator.play([
      {
        id: 'synthesis:overview',
        citation: 'Grounded Summary',
        text: answerText,
        book: firstPassage?.chunk.book ?? 'GEN',
        chapter: firstPassage?.chunk.start[0] ?? 1,
        verse: firstPassage?.chunk.start[1] ?? 1,
      },
    ]);
  };

  return (
    <div
      id={isSynthesisActive ? 'search-active-narrating-card' : undefined}
      data-segment-id="synthesis:overview"
      class={`mb-4 p-4 rounded-2xl border transition-all animate-fadeIn ${
        isSynthesisActive ? 'ring-2 ring-amber-500/50' : ''
      } ${isSynthesizing ? 'border-gradient-animated' : ''}`}
      style={
        isSynthesizing
          ? undefined
          : {
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }
      }
    >
      <div
        class={`flex items-center justify-between ${
          isSynthesisCollapsed ? 'mb-0 cursor-pointer' : 'mb-2.5'
        }`}
        onClick={isSynthesisCollapsed ? onToggleCollapse : undefined}
      >
        <div class="flex items-center gap-2">
          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
            style={{
              backgroundColor: 'var(--badge-ai-bg)',
              color: 'var(--badge-ai-text)',
            }}
          >
            <svg class="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9.75 2c0 4.28-3.47 7.75-7.75 7.75 4.28 0 7.75 3.47 7.75 7.75 0-4.28 3.47-7.75 7.75-7.75-4.28 0-7.75-3.47-7.75-7.75z" />
              <path d="M19 13c0 2.21-1.79 4-4 4 2.21 0 4 1.79 4 4 0-2.21 1.79-4 4-4-2.21 0-4-1.79-4-4z" />
            </svg>
            <span>Grounded Summary</span>
          </span>
          {isInspectorMode && (
            <span class="font-mono text-[10px]" style={{ color: 'var(--text-subtle)' }}>
              {isSynthesizing && synthesisTtftMs === null
                ? 'Generating...'
                : synthesisTtftMs !== null
                  ? `TTFT: ${synthesisTtftMs}ms${synthesisTokensPerSec !== null ? ` (${synthesisTokensPerSec} tok/s)` : isSynthesizing ? ' (streaming...)' : ''}`
                  : 'TTFT: NA'}
            </span>
          )}
        </div>

        <div class="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {synthesisError && (
            <button
              type="button"
              onClick={onDismissError}
              class="p-1 rounded hover:opacity-75 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              title="Dismiss note"
              aria-label="Dismiss note"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {narrator?.supported && hasContent && !isSynthesizing && (
            <button
              type="button"
              onClick={handleToggleNarration}
              title={isSynthesisPlaying ? 'Pause narration' : 'Listen to synthesis'}
              aria-label={
                isSynthesisPlaying ? 'Pause Grounded Summary' : 'Listen to Grounded Summary'
              }
              class="p-1 rounded hover:opacity-75 transition-opacity"
              style={{ color: isSynthesisActive ? 'var(--text-main)' : 'var(--text-muted)' }}
            >
              {isSynthesisPlaying ? (
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
              )}
            </button>
          )}

          {hasContent && !isSynthesizing && (
            <button
              type="button"
              onClick={() => onCopyAnswer(answerText)}
              class="p-1 rounded hover:opacity-75 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
              title="Copy answer"
              aria-label="Copy Grounded Summary"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {!isSynthesisCollapsed && (
        synthesisError ? (
          <div class="text-xs leading-relaxed font-sans" style={{ color: 'var(--text-muted)' }}>
            {synthesisError}
          </div>
        ) : !hasContent && isSynthesizing ? (
          <div class="space-y-2 py-1 animate-fadeIn" aria-label="Synthesizing summary">
            <div class="skeleton-box h-3.5 w-full" />
            <div class="skeleton-box h-3.5 w-[92%]" />
            <div class="skeleton-box h-3.5 w-[65%]" />
          </div>
        ) : (
          <div
            class="text-sm leading-relaxed whitespace-pre-wrap font-serif max-h-72 overflow-y-auto pr-1"
            style={{ color: 'var(--text-main)' }}
          >
            {isSynthesisActive
              ? renderHighlightedText(answerText, narrationState?.wordBoundary)
              : answerText}
            {isSynthesizing && (
              <span class="inline-block w-1.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
            )}
          </div>
        )
      )}

      {/* Card Footer Actions aligned with passage cards */}
      <div class="mt-2.5 flex items-center justify-between text-xs">
        {hasContent && !isSynthesizing ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            class="font-medium flex items-center gap-1 hover:underline"
            style={{ color: 'var(--text-muted)' }}
            title={isSynthesisCollapsed ? 'Expand overview' : 'Collapse overview'}
            aria-label={
              isSynthesisCollapsed
                ? 'Expand Scripture Synthesis'
                : 'Collapse Scripture Synthesis'
            }
          >
            <span>{isSynthesisCollapsed ? '+ Expand overview' : '- Collapse overview'}</span>
          </button>
        ) : (
          <span />
        )}

        <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {synthesisError
            ? 'Matching scripture passages below'
            : synthesisModel
              ? `Generated by ${synthesisModel}`
              : 'Generating...'}
        </span>
      </div>
    </div>
  );
}
