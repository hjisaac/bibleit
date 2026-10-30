import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Theme } from './Header';
import type { Manifest } from '../core/types';

export type PackageStatus = 'not_downloaded' | 'downloading' | 'ready';

interface SettingsViewProps {
  manifest?: Manifest | null;
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
  isAiEnabled: boolean;
  onToggleAi: (enabled: boolean) => void;
  isInspectorMode: boolean;
  onToggleInspector: (enabled: boolean) => void;
  showHeadings: boolean;
  onToggleHeadings: (enabled: boolean) => void;
  textPackageStatus: PackageStatus;
  aiPackageStatus: PackageStatus;
  modelPackageStatus: PackageStatus;
  textProgress: number;
  aiProgress: number;
  modelProgress: number;
  searchMode?: 'auto' | 'device';
  onToggleSearchMode?: (mode: 'auto' | 'device') => void;
  highlightStorage?: boolean;
  onDownloadText: () => void;
  onCancelDownloadText?: () => void;
  onDownloadAi: () => void;
  onCancelDownloadAi?: () => void;
  onDownloadModel: () => void;
  onCancelDownloadModel?: () => void;
  onClearStorage: () => void;
}

export function SettingsView({
  manifest,
  currentTheme,
  onThemeChange,
  isAiEnabled,
  onToggleAi,
  isInspectorMode,
  onToggleInspector,
  showHeadings,
  onToggleHeadings,
  textPackageStatus,
  aiPackageStatus,
  modelPackageStatus,
  textProgress,
  aiProgress,
  modelProgress,
  searchMode = 'auto',
  onToggleSearchMode,
  highlightStorage,
  onClearHighlight,
  onDownloadText,
  onCancelDownloadText,
  onDownloadAi,
  onCancelDownloadAi,
  onDownloadModel,
  onCancelDownloadModel,
  onClearStorage,
}: SettingsViewProps): JSX.Element {
  const storageSectionRef = useRef<HTMLDivElement>(null);
  const [isPulsing, setIsPulsing] = useState<boolean>(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
  const [confirmCountdown, setConfirmCountdown] = useState<number>(6);
  const hasDownloadedArtifacts =
    textPackageStatus === 'ready' || aiPackageStatus === 'ready' || modelPackageStatus === 'ready';

  // Active countdown ticker for auto-disarming clear confirmation
  useEffect(() => {
    if (!isConfirmingClear) return undefined;
    const interval = window.setInterval(() => {
      setConfirmCountdown((prev) => {
        if (prev <= 1) {
          setIsConfirmingClear(false);
          return 6;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isConfirmingClear]);

  const handleInitiateClear = () => {
    setConfirmCountdown(6);
    setIsConfirmingClear(true);
  };

  const handleCancelClear = () => {
    setIsConfirmingClear(false);
  };

  const handleConfirmClear = () => {
    setIsConfirmingClear(false);
    onClearStorage();
  };

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
    return undefined;
  }, [highlightStorage]);
  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain space-y-6 max-w-2xl mx-auto w-full">
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
            <div>
              • Embedder: {manifest?.embeddings.model ?? 'nomic-ai/nomic-embed-text-v1.5'} (dim: {manifest?.embeddings.dim ?? 768}, {manifest?.embeddings.quantization.type ?? 'int8'})
            </div>
            <div>
              • Chunks: {manifest ? `${manifest.embeddings.count.toLocaleString()} chunks (${manifest.chunks.strategy})` : '2,655 chunks (token_window)'}
            </div>
            <div>• Rank fusion: Reciprocal Rank Fusion (k=60)</div>
          </div>
        )}
      </div>

      {/* Pericope Headings Toggle */}
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
              <span>Pericope Headings</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-mono font-medium">
                Context
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Display topical section headings above retrieved passages.
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={showHeadings}
              onChange={(e) => onToggleHeadings((e.target as HTMLInputElement).checked)}
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>
      </div>

      {/* Force Device-Only Search Toggle */}
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
              <span>Force Device-Only Search</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono font-medium">
                Offline
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {textPackageStatus === 'ready'
                ? 'Search scripture strictly on-device without contacting backend servers.'
                : 'Download the scripture package below to unlock device-only search.'}
            </p>
          </div>

          <label
            class={`relative inline-flex items-center shrink-0 ${
              textPackageStatus === 'ready' ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
          >
            <input
              type="checkbox"
              disabled={textPackageStatus !== 'ready'}
              checked={searchMode === 'device'}
              onChange={(e) =>
                onToggleSearchMode?.((e.target as HTMLInputElement).checked ? 'device' : 'auto')
              }
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>
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
            {(() => {
              let mb = 0;
              if (textPackageStatus === 'ready') mb += 1.2;
              if (aiPackageStatus === 'ready') mb += 2.1;
              if (modelPackageStatus === 'ready') mb += 137;
              if (mb === 0) return '0 MB cached';
              if (modelPackageStatus === 'ready') return `${mb.toFixed(1)} MB cached`;
              return `${mb.toFixed(1)} MB in OPFS`;
            })()}
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
                  1.2 MB
                </span>
              </div>
              <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                All 66 Protestant books, 31,095 verses (WEB translation). Unlocks offline reading & keyword search.
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
            {textPackageStatus === 'downloading' ? (
              <button
                type="button"
                onClick={onCancelDownloadText}
                class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                Cancel
              </button>
            ) : textPackageStatus !== 'ready' ? (
              <button
                type="button"
                onClick={onDownloadText}
                class="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-85"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                }}
              >
                Download (1.2 MB)
              </button>
            ) : null}
          </div>
        </div>

        {/* Package 2: Precomputed Verse Vectors */}
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
                  Precomputed Verse Vectors
                </span>
                <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                  2.1 MB
                </span>
              </div>
              <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Nomic v1.5 int8 quantized vectors for 2,655 passages. Enables offline vector similarity comparison.
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
                ? 'Ready for vector search'
                : aiPackageStatus === 'downloading'
                ? 'Downloading vectors...'
                : 'Optional add-on'}
            </span>
            {aiPackageStatus === 'downloading' ? (
              <button
                type="button"
                onClick={onCancelDownloadAi}
                class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                Cancel
              </button>
            ) : aiPackageStatus !== 'ready' ? (
              <button
                type="button"
                onClick={onDownloadAi}
                class="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-85"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                }}
              >
                Download (2.1 MB)
              </button>
            ) : null}
          </div>
        </div>

        {/* Package 3: Neural Query Embedder */}
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
                  Neural Query Embedder
                </span>
                <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                  137 MB
                </span>
              </div>
              <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Nomic v1.5 on-device neural model (Q8 ONNX). Converts search queries into 768-dim embeddings.
              </p>
            </div>

            {modelPackageStatus === 'ready' ? (
              <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                ✓ Installed
              </span>
            ) : modelPackageStatus === 'downloading' ? (
              <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                {modelProgress}%
              </span>
            ) : null}
          </div>

          {modelPackageStatus === 'downloading' && (
            <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
              <div
                class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${modelProgress}%` }}
              />
            </div>
          )}

          <div class="flex items-center justify-between text-xs pt-1">
            <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {modelPackageStatus === 'ready'
                ? 'Ready for on-device inference'
                : modelPackageStatus === 'downloading'
                ? 'Downloading model weights...'
                : 'Downloads on first semantic search'}
            </span>
            {modelPackageStatus === 'downloading' ? (
              <button
                type="button"
                onClick={onCancelDownloadModel}
                class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                }}
              >
                Cancel
              </button>
            ) : modelPackageStatus !== 'ready' ? (
              <button
                type="button"
                onClick={onDownloadModel}
                class="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-85"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#FFFFFF',
                }}
              >
                Download (137 MB)
              </button>
            ) : null}
          </div>
        </div>

        {/* Clear Storage Action with Inline Confirmation & Visual Countdown */}
        {isConfirmingClear ? (
          <div
            class="p-3 rounded-xl border space-y-2.5 animate-fadeIn"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.4)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div class="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>Delete all local offline data?</span>
            </div>

            <p class="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Removes downloaded scripture text and AI models from OPFS. You can re-download anytime.
            </p>

            {/* Countdown progress bar */}
            <div class="w-full bg-red-500/10 dark:bg-red-950/40 rounded-full h-1 overflow-hidden">
              <div
                class="bg-red-500 h-full rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(confirmCountdown / 6) * 100}%` }}
              />
            </div>

            <div class="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCancelClear}
                class="flex-1 py-1.5 rounded-lg border text-xs font-medium hover:opacity-80 transition-all"
                style={{
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-main)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                class="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInitiateClear}
            disabled={!hasDownloadedArtifacts}
            class="w-full py-2 rounded-xl border text-xs font-semibold transition-all text-red-600 dark:text-red-400 hover:opacity-75 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
            style={{
              borderColor: 'var(--border-subtle)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            Free Up Local Space (Clear Artifacts)
          </button>
        )}
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

      {/* App Version & Commit Details */}
      <div class="pt-4 pb-2 text-center text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <p class="font-medium tracking-wide">
          bibleit v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'}
          <span class="opacity-60 ml-1.5 font-mono text-[11px]">
            ({typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'})
          </span>
        </p>
      </div>
    </section>
  );
}
