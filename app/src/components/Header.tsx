import type { JSX } from 'preact';

export type Theme = 'paper' | 'sepia' | 'obsidian';

export interface UserProfile {
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface HeaderProps {
  isOnline: boolean;
  isOfflineReady?: boolean;
  isAiEnabled: boolean;
  user?: UserProfile | null;
  onOpenHelp: () => void;
  onOpenAccount?: () => void;
}

export function Header({
  isOnline,
  isOfflineReady = true,
  isAiEnabled,
  user,
  onOpenHelp,
  onOpenAccount,
}: HeaderProps): JSX.Element {
  const aiBadge = !isAiEnabled
    ? {
        label: 'AI Off',
        colorClass: 'bg-stone-400',
        textColor: 'var(--text-muted)',
        tooltip: 'AI synthesis deactivated in Settings.',
      }
    : isOnline
      ? {
          label: !isOfflineReady ? 'Syncing...' : 'AI Ready',
          colorClass: !isOfflineReady ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500',
          textColor: 'var(--text-muted)',
          tooltip: !isOfflineReady
            ? 'Syncing offline cache...'
            : 'Connected. Press Enter on question searches to synthesize answers.',
        }
      : {
          label: 'AI Offline',
          colorClass: 'bg-amber-500 animate-pulse',
          textColor: 'var(--accent)',
          tooltip: 'Offline mode: Searching & reading locally on-device. Connect to internet for AI answers.',
        };

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
        <span
          class="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            color: aiBadge.textColor,
          }}
          title={aiBadge.tooltip}
        >
          <span class={`w-1.5 h-1.5 rounded-full transition-colors ${aiBadge.colorClass}`} />
          <span>{aiBadge.label}</span>
        </span>
      </div>

      {/* Right utility buttons: Help and User Account */}
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

        <button
          type="button"
          onClick={onOpenAccount}
          title={user ? `Signed in as ${user.name}` : 'Account (Guest mode)'}
          class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all hover:opacity-70"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--text-muted)',
          }}
        >
          <div
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
            style={{ backgroundColor: user ? 'var(--accent)' : 'var(--text-subtle)' }}
          >
            {user ? (
              user.name.charAt(0).toUpperCase()
            ) : (
              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            )}
          </div>
          <span class="text-[11px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
            {user ? user.name : 'Guest'}
          </span>
        </button>
      </div>
    </header>
  );
}
