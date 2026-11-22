import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { PackageStatusEnum, ThemeEnum, SearchModeEnum, type Manifest } from '../core/types';
import {
  i18n,
  $locale,
  $localeSetting,
  $isMultilingualEnabled,
  isOnDeviceSupported,
  LOCALES,
  type Locale,
} from '../stores/i18n';
import { $telemetryEnabled } from '../stores/preferences';
import { setTelemetryEnabled } from '../stores/telemetry';
import { params } from '@nanostores/i18n';
import en from '../locales/en.json';

export const messages = i18n('settings/view', {
  ...en['settings/view'],
  downloadButton: params<{ size: string }>(en['settings/view'].downloadButton),
  downloadingSlmProgress: params<{ percent: number }>(en['settings/view'].downloadingSlmProgress),
});

interface SettingsViewProps {
  manifest?: Manifest | null;
  currentTheme: ThemeEnum;
  onThemeChange: (theme: ThemeEnum) => void;
  isAiEnabled: boolean;
  onToggleAi: (enabled: boolean) => void;
  isInspectorMode: boolean;
  onToggleInspector: (enabled: boolean) => void;
  showHeadings: boolean;
  onToggleHeadings: (enabled: boolean) => void;
  textPackageStatus: PackageStatusEnum;
  aiPackageStatus: PackageStatusEnum;
  modelPackageStatus: PackageStatusEnum;
  slmPackageStatus?: PackageStatusEnum;
  textProgress: number;
  aiProgress: number;
  modelProgress: number;
  slmProgress?: number;
  searchMode?: SearchModeEnum;
  onToggleSearchMode?: (mode: SearchModeEnum) => void;
  highlightStorage?: boolean;
  onClearHighlight?: () => void;
  isStorageAvailable?: boolean;
  onDownloadText: () => void;
  onCancelDownloadText?: () => void;
  onDownloadAi: () => void;
  onCancelDownloadAi?: () => void;
  onDownloadModel: () => void;
  onCancelDownloadModel?: () => void;
  onDownloadSlm?: () => void;
  onCancelDownloadSlm?: () => void;
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
  slmPackageStatus = PackageStatusEnum.NOT_DOWNLOADED,
  textProgress,
  aiProgress,
  modelProgress,
  slmProgress = 0,
  searchMode = SearchModeEnum.AUTO,
  onToggleSearchMode,
  highlightStorage,
  onClearHighlight,
  isStorageAvailable = true,
  onDownloadText,
  onCancelDownloadText,
  onDownloadAi,
  onCancelDownloadAi,
  onDownloadModel,
  onCancelDownloadModel,
  onDownloadSlm,
  onCancelDownloadSlm,
  onClearStorage,
}: SettingsViewProps): JSX.Element {
  const tt = useStore(messages);
  const currentLocale = useStore($locale);
  const isMultilingual = useStore($isMultilingualEnabled);
  const isTelemetryEnabled = useStore($telemetryEnabled);

  const storageSectionRef = useRef<HTMLDivElement>(null);
  const [isPulsing, setIsPulsing] = useState<boolean>(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
  const [confirmCountdown, setConfirmCountdown] = useState<number>(6);
  const hasDownloadedArtifacts =
    textPackageStatus === PackageStatusEnum.DOWNLOADED ||
    aiPackageStatus === PackageStatusEnum.DOWNLOADED ||
    modelPackageStatus === PackageStatusEnum.DOWNLOADED ||
    slmPackageStatus === PackageStatusEnum.DOWNLOADED;

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
  }, [highlightStorage, onClearHighlight]);

  return (
    <section class="flex-1 flex flex-col p-4 sm:p-8 pb-24 sm:pb-24 overflow-y-auto overscroll-y-contain space-y-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 class="text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
          {tt.pageTitle}
        </h1>
        <p class="text-xs" style={{ color: 'var(--text-muted)' }}>
          {tt.pageSubtitle}
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
          {tt.atmosphereTitle}
        </span>
        <div class="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => onThemeChange(ThemeEnum.PAPER)}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === ThemeEnum.PAPER ? 'ring-2 ring-amber-500/60 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E8E8E2',
              color: '#1C1917',
            }}
          >
            <div class="text-xs font-semibold">{tt.themeDay}</div>
            <div class="text-[10px] text-stone-500 mt-0.5">{tt.themeDayDesc}</div>
          </button>

          <button
            type="button"
            onClick={() => onThemeChange(ThemeEnum.SEPIA)}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === ThemeEnum.SEPIA ? 'ring-2 ring-amber-700/60 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#FAF6ED',
              borderColor: '#E2D7C0',
              color: '#2D241E',
            }}
          >
            <div class="text-xs font-semibold">{tt.themeWarm}</div>
            <div class="text-[10px] text-stone-600 mt-0.5">{tt.themeWarmDesc}</div>
          </button>

          <button
            type="button"
            onClick={() => onThemeChange(ThemeEnum.OBSIDIAN)}
            class={`p-3 rounded-xl border text-left transition-all ${
              currentTheme === ThemeEnum.OBSIDIAN ? 'ring-2 ring-stone-400 font-semibold' : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: '#171412',
              borderColor: '#292524',
              color: '#F5F5F4',
            }}
          >
            <div class="text-xs font-semibold">{tt.themeDark}</div>
            <div class="text-[10px] text-stone-400 mt-0.5">{tt.themeDarkDesc}</div>
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
              <span>{tt.aiOverviewTitle}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                {tt.aiOverviewBadge}
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tt.aiOverviewDesc}
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              aria-label="AI Scripture Overview"
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
              <span>{tt.inspectorTitle}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono font-medium">
                {tt.inspectorBadge}
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tt.inspectorDesc}
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              aria-label="Retrieval Inspector Mode"
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
            <div>• Generator: HuggingFaceTB/SmolLM2-360M-Instruct (360M, q4)</div>
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
              <span>{tt.headingsTitle}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-mono font-medium">
                {tt.headingsBadge}
              </span>
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tt.headingsDesc}
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              aria-label="Pericope Headings"
              checked={showHeadings}
              onChange={(e) => onToggleHeadings((e.target as HTMLInputElement).checked)}
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>
      </div>

      {/* Interface Language (Available when multilingual feature is enabled) */}
      {isMultilingual && (
        <div
          class="p-4 rounded-2xl border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div>
            <div class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              {tt.languageTitle}
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tt.languageDesc}
            </p>
          </div>
          <select
            value={currentLocale}
            onChange={(e) => {
              const next = (e.target as HTMLSelectElement).value as Locale;
              $localeSetting.set(next);
            }}
            class="w-full p-2.5 rounded-xl border text-xs outline-none"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          >
            {LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {({ en: tt.languageEnglish, fr: tt.languageFrench } satisfies Record<Locale, string>)[loc]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* On-Device Only Search Toggle */}
      {(() => {
        const onDeviceSupported = isOnDeviceSupported(currentLocale);
        const canUseOnDevice = onDeviceSupported && textPackageStatus === PackageStatusEnum.DOWNLOADED;
        return (
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
                  <span>{tt.onDeviceTitle}</span>
                  <span
                    class={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      onDeviceSupported
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-stone-500/15 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {onDeviceSupported ? tt.onDeviceBadge : tt.onDeviceBadgeSoon}
                  </span>
                </div>
                <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {!onDeviceSupported
                    ? tt.onDeviceDescUnsupportedLocale
                    : textPackageStatus === PackageStatusEnum.DOWNLOADED
                    ? tt.onDeviceDescReady
                    : tt.onDeviceDescDownload}
                </p>
              </div>

              <label
                class={`relative inline-flex items-center shrink-0 ${
                  canUseOnDevice ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={tt.onDeviceTitle}
                  disabled={!canUseOnDevice}
                  checked={canUseOnDevice && searchMode === SearchModeEnum.DEVICE}
                  onChange={(e) =>
                    onToggleSearchMode?.(
                      (e.target as HTMLInputElement).checked ? SearchModeEnum.DEVICE : SearchModeEnum.AUTO,
                    )
                  }
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
              </label>
            </div>
          </div>
        );
      })()}

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
        <div class="border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              {tt.storageTitle}
            </span>
            <span class="text-[11px] font-mono font-medium text-emerald-600 shrink-0 whitespace-nowrap">
              {(() => {
                let mb = 0;
                if (textPackageStatus === PackageStatusEnum.DOWNLOADED) mb += 1.2;
                if (aiPackageStatus === PackageStatusEnum.DOWNLOADED) mb += 2.1;
                if (modelPackageStatus === PackageStatusEnum.DOWNLOADED) mb += 137;
                if (slmPackageStatus === PackageStatusEnum.DOWNLOADED) mb += 370;
                if (mb === 0) return '0 MB in OPFS';
                return `${mb.toFixed(1)} MB in OPFS`;
              })()}
            </span>
          </div>
          <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {tt.storageDesc}
          </p>
        </div>

        <div
          class={
            !isStorageAvailable
              ? 'p-3 rounded-2xl border space-y-3 bg-red-500/[0.06] border-red-500/25'
              : 'space-y-4'
          }
        >
          {!isStorageAvailable && (
            <div class="flex items-start gap-2.5 px-1 pt-0.5 pb-0.5">
              <svg class="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div class="text-xs">
                <p class="font-semibold text-red-600 dark:text-red-400">{tt.storageRestrictedTitle}</p>
                <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tt.storageRestrictedDesc}
                </p>
              </div>
            </div>
          )}

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
                    {tt.pkgTextTitle}
                  </span>
                  <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                    1.2 MB
                  </span>
                </div>
                <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tt.pkgTextDesc}
                </p>
              </div>

              {textPackageStatus === PackageStatusEnum.DOWNLOADED ? (
                <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  {tt.installedBadge}
                </span>
              ) : textPackageStatus === PackageStatusEnum.DOWNLOADING ? (
                <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                  {textProgress}%
                </span>
              ) : null}
            </div>

            {textPackageStatus === PackageStatusEnum.DOWNLOADING && (
              <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                <div
                  class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${textProgress}%` }}
                />
              </div>
            )}

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {textPackageStatus === PackageStatusEnum.DOWNLOADED
                  ? tt.readyToRead
                  : textPackageStatus === PackageStatusEnum.DOWNLOADING
                  ? tt.downloadingVerses
                  : tt.notStoredLocally}
              </span>
              {textPackageStatus === PackageStatusEnum.DOWNLOADING ? (
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
                  {tt.cancelButton}
                </button>
              ) : textPackageStatus !== PackageStatusEnum.DOWNLOADED ? (
                <button
                  type="button"
                  onClick={onDownloadText}
                  disabled={!isStorageAvailable}
                  title={!isStorageAvailable ? 'Device storage disabled in Private Browsing' : undefined}
                  class={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isStorageAvailable ? 'hover:opacity-85' : 'opacity-50 cursor-not-allowed'
                  }`}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                  }}
                >
                  {tt.downloadButton({ size: '1.2 MB' })}
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
                    {tt.pkgAiTitle}
                  </span>
                  <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                    2.1 MB
                  </span>
                </div>
                <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tt.pkgAiDesc}
                </p>
              </div>

              {aiPackageStatus === PackageStatusEnum.DOWNLOADED ? (
                <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  {tt.installedBadge}
                </span>
              ) : aiPackageStatus === PackageStatusEnum.DOWNLOADING ? (
                <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                  {aiProgress}%
                </span>
              ) : null}
            </div>

            {aiPackageStatus === PackageStatusEnum.DOWNLOADING && (
              <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                <div
                  class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${aiProgress}%` }}
                />
              </div>
            )}

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {aiPackageStatus === PackageStatusEnum.DOWNLOADED
                  ? tt.readyForVectors
                  : aiPackageStatus === PackageStatusEnum.DOWNLOADING
                  ? tt.downloadingVectors
                  : tt.notStoredLocally}
              </span>
              {aiPackageStatus === PackageStatusEnum.DOWNLOADING ? (
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
                  {tt.cancelButton}
                </button>
              ) : aiPackageStatus !== PackageStatusEnum.DOWNLOADED ? (
                <button
                  type="button"
                  onClick={onDownloadAi}
                  disabled={!isStorageAvailable}
                  title={!isStorageAvailable ? 'Device storage disabled in Private Browsing' : undefined}
                  class={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isStorageAvailable ? 'hover:opacity-85' : 'opacity-50 cursor-not-allowed'
                  }`}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                  }}
                >
                  {tt.downloadButton({ size: '2.1 MB' })}
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
                    {tt.pkgModelTitle}
                  </span>
                  <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                    137 MB
                  </span>
                </div>
                <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tt.pkgModelDesc}
                </p>
              </div>

              {modelPackageStatus === PackageStatusEnum.DOWNLOADED ? (
                <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  {tt.installedBadge}
                </span>
              ) : modelPackageStatus === PackageStatusEnum.DOWNLOADING ? (
                <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                  {modelProgress}%
                </span>
              ) : null}
            </div>

            {modelPackageStatus === PackageStatusEnum.DOWNLOADING && (
              <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                <div
                  class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${modelProgress}%` }}
                />
              </div>
            )}

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {modelPackageStatus === PackageStatusEnum.DOWNLOADED
                  ? tt.readyForEmbed
                  : modelPackageStatus === PackageStatusEnum.DOWNLOADING
                  ? tt.downloadingModel
                  : tt.notStoredLocally}
              </span>
              {modelPackageStatus === PackageStatusEnum.DOWNLOADING ? (
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
                  {tt.cancelButton}
                </button>
              ) : modelPackageStatus !== PackageStatusEnum.DOWNLOADED ? (
                <button
                  type="button"
                  onClick={onDownloadModel}
                  disabled={!isStorageAvailable}
                  title={!isStorageAvailable ? 'Device storage disabled in Private Browsing' : undefined}
                  class={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isStorageAvailable ? 'hover:opacity-85' : 'opacity-50 cursor-not-allowed'
                  }`}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                  }}
                >
                  {tt.downloadButton({ size: '137 MB' })}
                </button>
              ) : null}
            </div>
          </div>

          {/* Package 4: On-Device AI Summarizer */}
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
                    {tt.pkgSlmTitle}
                  </span>
                  <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-stone-500/10" style={{ color: 'var(--text-subtle)' }}>
                    370 MB
                  </span>
                </div>
                <p class="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {tt.pkgSlmDesc}
                </p>
              </div>

              {slmPackageStatus === PackageStatusEnum.DOWNLOADED ? (
                <span class="text-[10px] font-semibold text-emerald-600 shrink-0 px-2 py-0.5 rounded-full bg-emerald-500/10">
                  {tt.installedBadge}
                </span>
              ) : slmPackageStatus === PackageStatusEnum.DOWNLOADING ? (
                <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                  {slmProgress}%
                </span>
              ) : null}
            </div>

            {slmPackageStatus === PackageStatusEnum.DOWNLOADING && (
              <div class="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                <div
                  class="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${slmProgress}%` }}
                />
              </div>
            )}

            <div class="flex items-center justify-between text-xs pt-1">
              <span class="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {slmPackageStatus === PackageStatusEnum.DOWNLOADED
                  ? tt.readyForSlm
                  : slmPackageStatus === PackageStatusEnum.DOWNLOADING
                  ? slmProgress >= 98
                    ? tt.compilingSlm
                    : tt.downloadingSlmProgress({ percent: slmProgress })
                  : tt.notStoredLocally}
              </span>
              {slmPackageStatus === PackageStatusEnum.DOWNLOADING ? (
                <button
                  type="button"
                  onClick={onCancelDownloadSlm}
                  class="px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                    backgroundColor: 'var(--bg-surface-elevated)',
                  }}
                >
                  {tt.cancelButton}
                </button>
              ) : slmPackageStatus !== PackageStatusEnum.DOWNLOADED ? (
                <button
                  type="button"
                  onClick={onDownloadSlm}
                  disabled={!isStorageAvailable}
                  title={!isStorageAvailable ? 'Device storage disabled in Private Browsing' : undefined}
                  class={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    isStorageAvailable ? 'hover:opacity-85' : 'opacity-50 cursor-not-allowed'
                  }`}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#FFFFFF',
                  }}
                >
                  {tt.downloadButton({ size: '370 MB' })}
                </button>
              ) : null}
            </div>
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
              <span>{tt.deleteConfirmTitle}</span>
            </div>

            <p class="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {tt.deleteConfirmDesc}
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
                {tt.cancelButton}
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                class="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm"
              >
                {tt.deleteConfirmYes}
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
            {tt.freeSpaceButton}
          </button>
        )}
      </div>

      {/* Help Improve Search (Anonymous Analytics Toggle) */}
      <div
        class="p-4 rounded-2xl border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div class="flex items-center justify-between">
          <div class="pr-3">
            <div class="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              {tt.telemetryTitle}
            </div>
            <p class="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {tt.telemetryDesc}
            </p>
          </div>

          <label class="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              aria-label={tt.telemetryTitle}
              checked={isTelemetryEnabled}
              onChange={(e) => setTelemetryEnabled((e.target as HTMLInputElement).checked)}
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600" />
          </label>
        </div>
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
