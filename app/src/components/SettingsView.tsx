import type { JSX } from 'preact';
import type { Theme } from './Header';

interface SettingsViewProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isInspectorMode: boolean;
  onToggleInspector: (enabled: boolean) => void;
  onClearStorage: () => void;
}

export function SettingsView({
  currentTheme,
  onThemeChange,
  isInspectorMode,
  onToggleInspector,
  onClearStorage,
}: SettingsViewProps): JSX.Element {
  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto space-y-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 class="text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
          Settings
        </h1>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          Preferences, reading atmosphere, retrieval inspector, and offline storage.
        </p>
      </div>

      {/* Reading Theme Section */}
      <div
        class="p-4 rounded-2xl border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <span class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
          Reading Atmosphere
        </span>
        <div class="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => onThemeChange('paper')}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === 'paper' ? 'ring-2 ring-amber-500/60 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E8E8E2',
              color: '#1C1917',
            }}
          >
            <div class="text-xs font-semibold">Day</div>
            <div class="text-[10px] text-stone-500 mt-0.5">Crisp linen</div>
          </button>

          <button
            type="button"
            onClick={() => onThemeChange('sepia')}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === 'sepia' ? 'ring-2 ring-amber-700/60 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#FAF6ED',
              borderColor: '#E2D7C0',
              color: '#2D241E',
            }}
          >
            <div class="text-xs font-semibold">Warm</div>
            <div class="text-[10px] text-stone-600 mt-0.5">Parchment</div>
          </button>

          <button
            type="button"
            onClick={() => onThemeChange('obsidian')}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === 'obsidian' ? 'ring-2 ring-stone-400 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#171412',
              borderColor: '#292524',
              color: '#F5F5F4',
            }}
          >
            <div class="text-xs font-semibold">Dark</div>
            <div class="text-[10px] text-stone-400 mt-0.5">OLED black</div>
          </button>
        </div>
      </div>

      {/* Retrieval Inspector Mode Toggle */}
      <div
        class="p-4 rounded-2xl border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div class="flex items-center justify-between">
          <div class="pr-3">
            <div class="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-main)' }}>
              <span>Retrieval Inspector Mode</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono font-medium">
                Scholar
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Show search signal badges, cosine scores, BM25 metrics, and latencies.
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isInspectorMode}
              onChange={(e) => onToggleInspector((e.target as HTMLInputElement).checked)}
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>

        {isInspectorMode && (
          <div
            class="text-[11px] p-2.5 rounded-lg border font-mono space-y-1"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <div>• Embedder: Xenova/all-MiniLM-L6-v2 (dim: 384, int8)</div>
            <div>• Chunk window: 5–30 verses per pericope</div>
            <div>• Rank fusion: Reciprocal Rank Fusion (k=60)</div>
          </div>
        )}
      </div>

      {/* Offline Storage Control */}
      <div
        class="p-4 rounded-2xl border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
            Offline Data & Cache
          </span>
          <span class="text-xs font-mono font-medium text-emerald-600">38.4 MB cached</span>
        </div>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          Corpus text, search indices, and neural embedding weights stored locally via Origin Private File System (OPFS).
        </p>
        <button
          type="button"
          onClick={onClearStorage}
          class="w-full py-2 rounded-xl border text-xs font-semibold hover:opacity-75 transition-all text-red-600 dark:text-red-400"
          style={{
            borderColor: 'var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          Free Up Local Space (Clear Artifacts)
        </button>
      </div>

      {/* Active Translation */}
      <div
        class="p-4 rounded-2xl border space-y-2"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <span class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
          Active Translation
        </span>
        <select
          class="w-full p-2.5 rounded-xl border text-xs outline-none"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-main)',
          }}
        >
          <option selected>World English Bible (WEB) — Public Domain</option>
          <option>Louis Segond 1910 (LSG) — Domaine Public (Français)</option>
        </select>
      </div>
    </section>
  );
}
