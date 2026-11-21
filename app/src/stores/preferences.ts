import { persistentAtom } from '@nanostores/persistent';
import {
  ThemeEnum,
  ViewTabEnum,
  SearchModeEnum,
  DEFAULT_TRANSLATION,
  type TranslationId,
} from '../core/types';

export type { TranslationId };

export const $theme = persistentAtom<ThemeEnum>('bibleit_theme', ThemeEnum.SEPIA);

export const $activeTab = persistentAtom<ViewTabEnum>('bibleit_active_tab', ViewTabEnum.SEARCH);

export const $activeTranslation = persistentAtom<TranslationId>(
  'bibleit_active_translation',
  DEFAULT_TRANSLATION,
);

export const $isAiEnabled = persistentAtom<boolean>('bibleit_ai_enabled', true, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $showHeadings = persistentAtom<boolean>('bibleit_show_headings', true, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $hasSeenStorageBanner = persistentAtom<boolean>('bibleit_storage_banner_seen', false, {
  encode: String,
  decode: (v) => v === 'true',
});

export const $searchMode = persistentAtom<SearchModeEnum>('bibleit_search_mode', SearchModeEnum.AUTO);
