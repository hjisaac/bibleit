import type { JSX } from 'preact';
import { SearchModeEnum } from '../core/types';

interface HeaderProps {
  isOnline: boolean;
  isAiEnabled: boolean;
  searchMode?: SearchModeEnum;
  onOpenHelp: () => void;
}

export function Header({
  searchMode = SearchModeEnum.AUTO,
  onOpenHelp,
}: HeaderProps): JSX.Element {
  const isOnDevice = searchMode === SearchModeEnum.DEVICE;

  return (
    <header
      class="px-4 sm:px-8 py-3.5 flex items-center justify-between border-b shrink-0 transition-colors"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      <div class="flex items-center space-x-2.5">
        <span class="font-serif font-semibold text-xl tracking-tight" style={{ color: 'var(--text-main)' }}>
          bible<span class="text-amber-600 font-sans text-sm font-bold ml-0.5">it</span>
        </span>
        {isOnDevice && (
          <span
            class="text-[10px] font-medium px-1.5 py-0.5 rounded transition-opacity"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              color: 'var(--text-subtle)',
            }}
            title="On-device mode active: Searching locally on this device."
          >
            On-Device
          </span>
        )}
      </div>

      {/* Right utility buttons: Help */}
      <div class="flex items-center space-x-1">
        <button
          type="button"
          onClick={onOpenHelp}
          title="Help & Shortcuts"
          class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all hover:opacity-70"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
          }}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
