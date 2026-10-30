import { persistentAtom } from '@nanostores/persistent';
import type { Theme } from '../components/Header';
import type { ViewTab } from '../components/Navbar';

export const $theme = persistentAtom<Theme>('bibleit_theme', 'sepia');

export const $activeTab = persistentAtom<ViewTab>('bibleit_active_tab', 'search');

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

export type SearchMode = 'auto' | 'device';
export const $searchMode = persistentAtom<SearchMode>('bibleit_search_mode', 'auto');
