import { h, type JSX } from 'preact';

export type Theme = 'paper' | 'sepia' | 'obsidian';

interface HeaderProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isOfflineReady: boolean;
}

export function Header({
  currentTheme,
  onThemeChange,
  isOfflineReady,
}: HeaderProps): JSX.Element {
  return (
    <header
      class="px-5 pt-4 pb-3 flex items-center justify-between border-b shrink-0 transition-colors"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      <div class="flex items-center space-x-2">
        <span class="font-serif font-semibold text-xl tracking-tight" style={{ color: 'var(--text-main)' }}>
          bible<span class="text-amber-600 font-sans text-sm font-bold ml-0.5">it</span>
        </span>
        <span
          class="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5"
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

      <div
        class="flex items-center p-0.5 rounded-full text-xs"
        style={{ backgroundColor: 'var(--bg-surface-elevated)' }}
      >
        <button
          type="button"
          onClick={() => onThemeChange('paper')}
          class={`px-2 py-0.5 rounded-full font-medium transition-all ${
            currentTheme === 'paper' ? 'shadow-sm' : ''
          }`}
          style={{
            backgroundColor: currentTheme === 'paper' ? 'var(--bg-surface)' : 'transparent',
            color: currentTheme === 'paper' ? 'var(--text-main)' : 'var(--text-muted)',
          }}
        >
          Day
        </button>
        <button
          type="button"
          onClick={() => onThemeChange('sepia')}
          class={`px-2 py-0.5 rounded-full font-medium transition-all ${
            currentTheme === 'sepia' ? 'shadow-sm' : ''
          }`}
          style={{
            backgroundColor: currentTheme === 'sepia' ? 'var(--bg-surface)' : 'transparent',
            color: currentTheme === 'sepia' ? 'var(--text-main)' : 'var(--text-muted)',
          }}
        >
          Warm
        </button>
        <button
          type="button"
          onClick={() => onThemeChange('obsidian')}
          class={`px-2 py-0.5 rounded-full font-medium transition-all ${
            currentTheme === 'obsidian' ? 'shadow-sm' : ''
          }`}
          style={{
            backgroundColor: currentTheme === 'obsidian' ? 'var(--bg-surface)' : 'transparent',
            color: currentTheme === 'obsidian' ? 'var(--text-main)' : 'var(--text-muted)',
          }}
        >
          Dark
        </button>
      </div>
    </header>
  );
}
