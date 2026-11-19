import { browser, createI18n, formatter, localeFrom } from '@nanostores/i18n';
import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import { env } from '../env';

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];

// Multilingual feature gate: in-memory state driven by Vite configuration (enabled in dev, disabled in prod).
export const $isMultilingualEnabled = atom<boolean>(env.isMultilingualEnabled);

// Manual user override from settings (persisted). Undefined initially so device language takes effect.
export const $localeSetting = persistentAtom<Locale | undefined>('bibleit_locale', undefined);

// Device language detector
export const $detectedLocale = localeFrom($localeSetting, browser({ available: LOCALES, fallback: 'en' }));

// Effective locale: if multilingual is disabled, strictly enforce 'en'.
// If multilingual is enabled, pick up user setting or device locale.
export const $locale = computed(
  [$isMultilingualEnabled, $detectedLocale],
  (enabled, detected) => (enabled ? detected : 'en'),
);

export const $format = formatter($locale);

// Base translations (en) live in components. Other locales are loaded on demand.
export const i18n = createI18n($locale, {
  async get(code) {
    if (code === 'fr') {
      const module = await import('../locales/fr.json');
      return module.default;
    }
    return {};
  },
});

import { $activeTranslation } from './preferences';

// Sync html lang attribute and default active translation with locale
$locale.subscribe((code) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
  }
  $activeTranslation.set(code === 'fr' ? 'lsg' : 'web');
});
