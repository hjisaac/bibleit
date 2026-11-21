import type { JSX } from 'preact';

export type VoteDirection = 'up' | 'down';

interface VoteButtonsProps {
  vote?: VoteDirection | null;
  onVote: (direction: VoteDirection) => void;
  helpfulTitle: string;
  notHelpfulTitle: string;
}

export function VoteButtons({
  vote,
  onVote,
  helpfulTitle,
  notHelpfulTitle,
}: VoteButtonsProps): JSX.Element {
  return (
    <div
      class="inline-flex items-center gap-0.5 pl-1.5 ml-0.5 border-l"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <button
        type="button"
        onClick={() => onVote('up')}
        title={helpfulTitle}
        aria-label={helpfulTitle}
        aria-pressed={vote === 'up'}
        class={`p-1 rounded transition-colors ${
          vote === 'up' ? 'text-emerald-600' : 'hover:text-emerald-600'
        }`}
        style={vote === 'up' ? undefined : { color: 'var(--text-muted)' }}
      >
        <svg class="w-3.5 h-3.5" fill={vote === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
            d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onVote('down')}
        title={notHelpfulTitle}
        aria-label={notHelpfulTitle}
        aria-pressed={vote === 'down'}
        class={`p-1 rounded transition-colors ${
          vote === 'down' ? 'text-rose-500' : 'hover:text-rose-500'
        }`}
        style={vote === 'down' ? undefined : { color: 'var(--text-muted)' }}
      >
        <svg class="w-3.5 h-3.5" fill={vote === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
            d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10zM17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"
          />
        </svg>
      </button>
    </div>
  );
}
