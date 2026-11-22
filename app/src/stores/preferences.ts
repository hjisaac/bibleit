import { persistentAtom } from '@nanostores/persistent';
import {
  ThemeEnum,
  ViewTabEnum,
  SearchModeEnum,
  DEFAULT_TRANSLATION,
  type TranslationId,
} from '../core/types';

export type { TranslationId };

export const $theme = persistentAtom<ThemeEnum>('bibleit:pref:theme', ThemeEnum.SEPIA);

export const $activeTab = persistentAtom<ViewTabEnum>('bibleit:ui:active_tab', ViewTabEnum.SEARCH);

export const $activeTranslation = persistentAtom<TranslationId>(
  'bibleit:pref:active_translation',
  DEFAULT_TRANSLATION,
);

export const $isAiEnabled = persistentAtom<boolean>('bibleit:pref:ai_enabled', true, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $showHeadings = persistentAtom<boolean>('bibleit:pref:show_headings', true, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $hasSeenStorageBanner = persistentAtom<boolean>('bibleit:ui:storage_banner_seen', false, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $searchMode = persistentAtom<SearchModeEnum>('bibleit:pref:search_mode', SearchModeEnum.AUTO);

export const $telemetryEnabled = persistentAtom<boolean>('bibleit:pref:telemetry_enabled', true, {
  encode: String,
  decode: (v) => v === 'true',
});
