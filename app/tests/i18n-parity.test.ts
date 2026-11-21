import { describe, expect, it } from 'vitest';
import { messagesToJSON } from '@nanostores/i18n';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

import { messages as app } from '@/App';
import { messages as navbar } from '@/components/Navbar';
import { messages as header } from '@/components/Header';
import { messages as savedView } from '@/components/SavedView';
import { messages as audioPlayerBar } from '@/components/AudioPlayerBar';
import { messages as feedbackModal } from '@/components/FeedbackModal';
import { messages as bookSelectorModal } from '@/components/BookSelectorModal';
import { messages as helpModal } from '@/components/HelpModal';
import { messages as scriptureOverviewCard } from '@/components/ScriptureOverviewCard';
import { messages as readerView } from '@/components/ReaderView';
import { messages as settingsView } from '@/components/SettingsView';
import { messages as searchView } from '@/components/SearchView';

describe('i18n Parity & Dead Code Tracking', () => {
  it('keeps en.json and fr.json symmetric with zero missing, dead, or empty entries', () => {
    const enTree = en as Record<string, Record<string, unknown>>;
    const frTree = fr as Record<string, Record<string, unknown>>;

    const deadKeys: string[] = [];
    const absentKeys: string[] = [];
    const untranslatedKeys: string[] = [];

    for (const [ns, keys] of Object.entries(frTree)) {
      if (!enTree[ns]) {
        deadKeys.push(`${ns} (namespace absent from en.json)`);
        continue;
      }
      for (const key of Object.keys(keys)) {
        if (!(key in enTree[ns]!)) {
          deadKeys.push(`${ns}.${key}`);
        }
      }
    }

    for (const [ns, keys] of Object.entries(enTree)) {
      if (!frTree[ns]) {
        absentKeys.push(`${ns} (entire namespace missing from fr.json)`);
        continue;
      }
      for (const [key, enVal] of Object.entries(keys)) {
        const frVal = frTree[ns]![key];
        if (frVal === undefined) {
          absentKeys.push(`${ns}.${key}`);
        } else if (typeof frVal === 'string' && frVal.trim().length === 0) {
          untranslatedKeys.push(`${ns}.${key}`);
        } else if (Array.isArray(enVal)) {
          expect(Array.isArray(frVal), `${ns}.${key} must be an array in fr.json`).toBe(true);
          expect((frVal as unknown[]).length, `${ns}.${key} length mismatch`).toBe(enVal.length);
        }
      }
    }

    expect(deadKeys, 'Keys present in fr.json but absent in en.json:').toEqual([]);
    expect(absentKeys, 'Keys present in en.json but absent in fr.json:').toEqual([]);
    expect(untranslatedKeys, 'Keys present in fr.json with empty translations:').toEqual([]);
  });

  it('registers every component namespace from en.json in live component stores', () => {
    const liveTree = messagesToJSON(
      app,
      navbar,
      header,
      savedView,
      audioPlayerBar,
      feedbackModal,
      bookSelectorModal,
      helpModal,
      scriptureOverviewCard,
      readerView,
      settingsView,
      searchView,
    ) as Record<string, Record<string, unknown>>;

    const { starterTopics: _, ...enComponentNamespaces } = en as Record<string, Record<string, unknown>>;

    expect(Object.keys(liveTree).sort()).toEqual(Object.keys(enComponentNamespaces).sort());
    for (const [ns, keys] of Object.entries(enComponentNamespaces)) {
      expect(Object.keys(liveTree[ns]!).sort(), `Namespace ${ns} key mismatch`).toEqual(Object.keys(keys).sort());
    }
  });
});
