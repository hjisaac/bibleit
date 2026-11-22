import { createI18n, formatter, localeFrom } from '@nanostores/i18n';
import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import { env } from '../env';
import {
  DEFAULT_LOCALE,
  DEFAULT_TRANSLATION,
  LOCALES,
  SearchModeEnum,
  type Locale,
  type TranslationId,
} from '../core/types';
import { $activeTranslation, $searchMode } from './preferences';

export { DEFAULT_LOCALE, LOCALES, type Locale };

export function isOnDeviceSupported(locale: Locale): boolean {
  return locale === 'en';
}

// Multilingual feature gate: in-memory state driven by Vite configuration (enabled in dev, disabled in prod).
export const $isMultilingualEnabled = atom<boolean>(env.isMultilingualEnabled);

export const $localeSetting = persistentAtom<Locale | undefined>('bibleit:pref:locale', undefined);

// Match regional tags like 'fr-FR' or 'fr-CA' against supported base locales.
function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of languages) {
    const base = lang?.toLowerCase().split('-')[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export const $detectedLocale = localeFrom($localeSetting, atom<Locale>(detectBrowserLocale()));

// Effective locale: if multilingual is disabled, strictly enforce DEFAULT_LOCALE.
// If multilingual is enabled, pick up user setting or device locale.
export const $locale = computed(
  [$isMultilingualEnabled, $detectedLocale],
  (enabled, detected) => (enabled ? detected : DEFAULT_LOCALE),
);

export const $format = formatter($locale);

const LOCALE_LOADERS: Readonly<Partial<Record<Locale, () => Promise<{ default: Record<string, unknown> }>>>> = {
  fr: () => import('../locales/fr.json'),
};

const LOCALE_DEFAULT_TRANSLATION: Readonly<Record<Locale, TranslationId>> = {
  en: 'web',
  fr: 'lsg',
};

// Base translations come from locales/en.json. Other locales are loaded on demand.
export const i18n = createI18n($locale, {
  async get(code) {
    const loader = LOCALE_LOADERS[code as Locale];
    if (!loader) return {};
    const { starterTopics: _, ...namespaces } = (await loader()).default;
    return namespaces as Record<string, Record<string, string>>;
  },
});

// Sync html lang attribute, active translation, and on-device eligibility with locale
$locale.subscribe((code) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
  }
  $activeTranslation.set(LOCALE_DEFAULT_TRANSLATION[code as Locale] ?? DEFAULT_TRANSLATION);
  if (!isOnDeviceSupported(code as Locale) && $searchMode.get() === SearchModeEnum.DEVICE) {
    $searchMode.set(SearchModeEnum.AUTO);
  }
});
