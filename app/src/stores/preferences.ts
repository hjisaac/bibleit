import { persistentAtom } from '@nanostores/persistent';
import { Theme, ViewTab, SearchMode } from '../core/types';

export { Theme, ViewTab, SearchMode };

export const $theme = persistentAtom<Theme>('bibleit_theme', Theme.SEPIA);

export const $activeTab = persistentAtom<ViewTab>('bibleit_active_tab', ViewTab.SEARCH);

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

export const $searchMode = persistentAtom<SearchMode>('bibleit_search_mode', SearchMode.AUTO);
