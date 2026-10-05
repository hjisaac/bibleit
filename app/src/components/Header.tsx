import type { JSX } from 'preact';

export type Theme = 'paper' | 'sepia' | 'obsidian';

interface HeaderProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isOfflineReady: boolean;
}

const NEXT_THEME: Record<Theme, Theme> = {
  paper: 'sepia',
  sepia: 'obsidian',
  obsidian: 'paper',
};

const THEME_LABELS: Record<Theme, string> = {
  paper: 'Day',
  sepia: 'Warm',
  obsidian: 'Dark',
};

export function Header({
  currentTheme,
  onThemeChange,
  isOfflineReady,
}: HeaderProps): JSX.Element {
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
          class="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-muted)',
          }}
        >
          <span
            class={`w-1.5 h-1.5 rounded-full ${
              isOfflineReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}
          />
          <span>{isOfflineReady ? 'Offline Ready' : 'Syncing...'}</span>
        </span>
      </div>

      {/* Single minimal theme cycle button */}
      <button
        type="button"
        onClick={() => onThemeChange(NEXT_THEME[currentTheme])}
        title={`Theme: ${THEME_LABELS[currentTheme]} (click to cycle)`}
        class="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all hover:opacity-80"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-main)',
        }}
      >
        {currentTheme === 'paper' && (
          <svg class="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
        {currentTheme === 'sepia' && (
          <svg class="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )}
        {currentTheme === 'obsidian' && (
          <svg class="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
        <span>{THEME_LABELS[currentTheme]}</span>
      </button>
    </header>
  );
}
