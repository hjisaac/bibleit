import { browser, createI18n, formatter, localeFrom } from '@nanostores/i18n';
import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import { env } from '../env';
import {
  DEFAULT_LOCALE,
  DEFAULT_TRANSLATION,
  LOCALES,
  type Locale,
  type TranslationId,
} from '../core/types';
import { $activeTranslation } from './preferences';

export { DEFAULT_LOCALE, LOCALES, type Locale };

// Multilingual feature gate: in-memory state driven by Vite configuration (enabled in dev, disabled in prod).
export const $isMultilingualEnabled = atom<boolean>(env.isMultilingualEnabled);

// Manual user override from settings (persisted). Undefined initially so device language takes effect.
export const $localeSetting = persistentAtom<Locale | undefined>('bibleit_locale', undefined);

// Device language detector
export const $detectedLocale = localeFrom($localeSetting, browser({ available: LOCALES, fallback: DEFAULT_LOCALE }));

// Effective locale: if multilingual is disabled, strictly enforce DEFAULT_LOCALE.
// If multilingual is enabled, pick up user setting or device locale.
export const $locale = computed(
  [$isMultilingualEnabled, $detectedLocale],
  (enabled, detected) => (enabled ? detected : DEFAULT_LOCALE),
);

export const $format = formatter($locale);

const LOCALE_LOADERS: Readonly<Partial<Record<Locale, () => Promise<{ default: Record<string, Record<string, string>> }>>>> = {
  fr: () => import('../locales/fr.json'),
};

const LOCALE_DEFAULT_TRANSLATION: Readonly<Record<Locale, TranslationId>> = {
  en: 'web',
  fr: 'lsg',
};

// Base translations (en) live in components. Other locales are loaded on demand.
export const i18n = createI18n($locale, {
  async get(code) {
    const loader = LOCALE_LOADERS[code as Locale];
    return loader ? (await loader()).default : {};
  },
});

// Sync html lang attribute and default active translation with locale
$locale.subscribe((code) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
  }
  $activeTranslation.set(LOCALE_DEFAULT_TRANSLATION[code as Locale] ?? DEFAULT_TRANSLATION);
});
