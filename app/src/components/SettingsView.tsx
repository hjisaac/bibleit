import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Theme } from './Header';

export type PackageStatus = 'not_downloaded' | 'downloading' | 'ready';

interface SettingsViewProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isAiEnabled: boolean;
  onToggleAi: (enabled: boolean) => void;
  isInspectorMode: boolean;
  onToggleInspector: (enabled: boolean) => void;
  textPackageStatus: PackageStatus;
  aiPackageStatus: PackageStatus;
  textProgress: number;
  aiProgress: number;
  highlightStorage?: boolean;
  onClearHighlight?: () => void;
  onDownloadText: () => void;
  onDownloadAi: () => void;
  onClearStorage: () => void;
}

export function SettingsView({
  currentTheme,
  onThemeChange,
  isAiEnabled,
  onToggleAi,
  isInspectorMode,
  onToggleInspector,
  textPackageStatus,
  aiPackageStatus,
  textProgress,
  aiProgress,
  highlightStorage,
  onClearHighlight,
  onDownloadText,
  onDownloadAi,
  onClearStorage,
}: SettingsViewProps): JSX.Element {
  const storageSectionRef = useRef<HTMLDivElement>(null);
  const [isPulsing, setIsPulsing] = useState<boolean>(false);

  useEffect(() => {
    if (highlightStorage && storageSectionRef.current) {
      storageSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setIsPulsing(true);
      const timer = setTimeout(() => {
        setIsPulsing(false);
        onClearHighlight?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightStorage]);
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

      {/* AI Scripture Overview Toggle */}
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
              <span>AI Scripture Overview</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                LLM
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Generate grounded AI overviews when pressing Enter on question queries (requires internet).
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={isAiEnabled}
              onChange={(e) => onToggleAi((e.target as HTMLInputElement).checked)}
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
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

      {/* Offline Packages & Storage Control */}
      <div
        ref={storageSectionRef}
        class={`p-4 rounded-2xl border space-y-4 transition-all duration-500 ${
          isPulsing ? 'ring-2 ring-amber-500 shadow-lg shadow-amber-500/10' : ''
        }`}
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: isPulsing ? 'rgba(245, 158, 11, 0.6)' : 'var(--border-subtle)',
        }}
      >
        <div class="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <span class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Offline Packages & Storage
            </span>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Manage local data stored in Origin Private File System (OPFS).
            </p>
          </div>
          <span class="text-xs font-mono font-medium text-emerald-600">
            {textPackageStatus === 'ready' && aiPackageStatus === 'ready'
              ? '25.0 MB in OPFS'
              : textPackageStatus === 'ready'
              ? '2.0 MB in OPFS'
              : '0 MB cached'}
          </span>
        </div>

        {/* Package 1: Essential Scripture Text */}
        <div
          class="p-3 rounded-xl border flex flex-col gap-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                  Essential Scripture Text
                </span>
                <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                  2.0 MB
                </span>
              </div>
              <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                All 66 Protestant books, 31,102 verses (WEB translation). Unlocks offline reading & keyword search.
              </p>
            </div>

            {textPackageStatus === 'ready' ? (
              <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                ✓ Installed
              </span>
            ) : textPackageStatus === 'downloading' ? (
              <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                {textProgress}%
              </span>
            ) : null}
          </div>

          {textPackageStatus === 'downloading' && (
            <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
              <div
                class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${textProgress}%` }}
              />
            </div>
          )}

          <div class="flex items-center justify-between text-xs pt-1">
            <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {textPackageStatus === 'ready'
                ? 'Ready for offline reading'
                : textPackageStatus === 'downloading'
                ? 'Downloading verses...'
                : 'Not stored locally'}
            </span>
            <button
              type="button"
              onClick={onDownloadText}
              disabled={textPackageStatus === 'downloading'}
              class="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-85 disabled:opacity-50"
              style={{
                backgroundColor: textPackageStatus === 'ready' ? 'var(--bg-surface-elevated)' : 'var(--accent)',
                color: textPackageStatus === 'ready' ? 'var(--text-main)' : '#FFFFFF',
              }}
            >
              {textPackageStatus === 'ready' ? 'Re-download' : textPackageStatus === 'downloading' ? 'Downloading...' : 'Download (2 MB)'}
            </button>
          </div>
        </div>

        {/* Package 2: Neural AI Semantic Model */}
        <div
          class="p-3 rounded-xl border flex flex-col gap-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                  Neural AI Semantic Model
                </span>
                <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                  23.0 MB
                </span>
              </div>
              <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                MiniLM-L6 vector embeddings for on-device conceptual similarity search and RAG synthesis without network.
              </p>
            </div>

            {aiPackageStatus === 'ready' ? (
              <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                ✓ Installed
              </span>
            ) : aiPackageStatus === 'downloading' ? (
              <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                {aiProgress}%
              </span>
            ) : null}
          </div>

          {aiPackageStatus === 'downloading' && (
            <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
              <div
                class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${aiProgress}%` }}
              />
            </div>
          )}

          <div class="flex items-center justify-between text-xs pt-1">
            <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {aiPackageStatus === 'ready'
                ? 'Ready for offline semantic search'
                : aiPackageStatus === 'downloading'
                ? 'Downloading model...'
                : 'Optional add-on'}
            </span>
            <button
              type="button"
              onClick={onDownloadAi}
              disabled={aiPackageStatus === 'downloading'}
              class="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-85 disabled:opacity-50"
              style={{
                backgroundColor: aiPackageStatus === 'ready' ? 'var(--bg-surface-elevated)' : 'var(--accent)',
                color: aiPackageStatus === 'ready' ? 'var(--text-main)' : '#FFFFFF',
              }}
            >
              {aiPackageStatus === 'ready' ? 'Installed' : aiPackageStatus === 'downloading' ? 'Downloading...' : 'Download (23 MB)'}
            </button>
          </div>
        </div>

        {/* Clear Storage Action */}
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
