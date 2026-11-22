import { describe, expect, it, beforeEach } from 'vitest';
import { $locale, $localeSetting, $isMultilingualEnabled, $detectedLocale } from '../src/stores/i18n';

describe('i18n Locale Resolution & Multilingual Feature Gating', () => {
  beforeEach(() => {
    $localeSetting.set(undefined);
    $isMultilingualEnabled.set(false);
  });

  it('defaults strictly to English when multilingual feature is disabled', () => {
    $isMultilingualEnabled.set(false);
    $localeSetting.set('fr');
    // Even if user or device indicates fr, the computed locale remains 'en'
    expect($locale.get()).toBe('en');
  });

  it('allows switching to French when multilingual feature is enabled', () => {
    $isMultilingualEnabled.set(true);
    $localeSetting.set('fr');
    expect($locale.get()).toBe('fr');
  });

  it('picks up device language when no manual override is set and multilingual is enabled', () => {
    $isMultilingualEnabled.set(true);
    $localeSetting.set(undefined);

    // In a test environment or fallback, detected locale will be one of the available locales
    const detected = $detectedLocale.get();
    expect(['en', 'fr']).toContain(detected);
    expect($locale.get()).toBe(detected);
  });

  it('forces English regardless of detected device language when multilingual is disabled', () => {
    $isMultilingualEnabled.set(false);
    $localeSetting.set(undefined);

    // Even if device language is fr, disabling multilingual forces en
    expect($locale.get()).toBe('en');
  });

  it('updates document.documentElement.lang when locale changes', () => {
    $isMultilingualEnabled.set(true);
    $localeSetting.set('fr');
    expect(document.documentElement.lang).toBe('fr');

    $localeSetting.set('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('automatically synchronizes active translation with locale', async () => {
    $isMultilingualEnabled.set(true);
    $localeSetting.set('fr');
    expect($locale.get()).toBe('fr');

    // Dynamically imported preferences store reflects translation change
    const { $activeTranslation } = await import('../src/stores/preferences');
    expect($activeTranslation.get()).toBe('lsg');

    $localeSetting.set('en');
    expect($locale.get()).toBe('en');
    expect($activeTranslation.get()).toBe('web');
  });

  it('disables on-device search mode when switching to French', async () => {
    const { $searchMode } = await import('../src/stores/preferences');
    const { SearchModeEnum } = await import('../src/core/types');
    const { isOnDeviceSupported } = await import('../src/stores/i18n');

    $isMultilingualEnabled.set(true);
    $localeSetting.set('en');
    $searchMode.set(SearchModeEnum.DEVICE);
    expect(isOnDeviceSupported('en')).toBe(true);
    expect(isOnDeviceSupported('fr')).toBe(false);

    $localeSetting.set('fr');
    expect($searchMode.get()).toBe(SearchModeEnum.AUTO);
  });
});
