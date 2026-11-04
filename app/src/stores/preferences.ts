import { persistentAtom } from '@nanostores/persistent';
import { ThemeEnum, ViewTabEnum, SearchModeEnum } from '../core/types';

export const $theme = persistentAtom<ThemeEnum>('bibleit_theme', ThemeEnum.SEPIA);

export const $activeTab = persistentAtom<ViewTabEnum>('bibleit_active_tab', ViewTabEnum.SEARCH);

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
