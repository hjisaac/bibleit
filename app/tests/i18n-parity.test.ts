import { describe, expect, it } from 'vitest';
import { messagesToJSON } from '@nanostores/i18n';
import fr from '../src/locales/fr.json';

// Import message namespaces from all translated components
import { messages as navbar } from '../src/components/Navbar';
import { messages as header } from '../src/components/Header';
import { messages as savedView } from '../src/components/SavedView';
import { messages as audioPlayerBar } from '../src/components/AudioPlayerBar';
import { messages as feedbackModal } from '../src/components/FeedbackModal';
import { messages as bookSelectorModal } from '../src/components/BookSelectorModal';
import { messages as helpModal } from '../src/components/HelpModal';
import { messages as scriptureOverviewCard } from '../src/components/ScriptureOverviewCard';
import { messages as readerView } from '../src/components/ReaderView';
import { messages as settingsView } from '../src/components/SettingsView';
import { messages as searchView } from '../src/components/SearchView';

describe('i18n Parity & Dead Code Tracking', () => {
  it('has zero dead and zero missing translations in fr.json', () => {
    // Source of truth: extracted directly from live TypeScript component definitions (no en.json)
    const sourceOfTruthTree = messagesToJSON(
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

    const frTree = fr as Record<string, Record<string, unknown>>;

    const deadKeys: string[] = [];
    const absentKeys: string[] = [];
    const untranslatedKeys: string[] = [];

    // Direction 1: Keys in fr.json that do NOT exist in the extracted TypeScript code
    for (const [component, keys] of Object.entries(frTree)) {
      if (!sourceOfTruthTree[component]) {
        deadKeys.push(`${component} (namespace absent from TypeScript code)`);
        continue;
      }
      for (const key of Object.keys(keys)) {
        if (!(key in sourceOfTruthTree[component]!)) {
          deadKeys.push(`${component}.${key}`);
        }
      }
    }

    // Direction 2: Keys in extracted TypeScript code that are absent or empty in fr.json
    for (const [component, keys] of Object.entries(sourceOfTruthTree)) {
      if (!frTree[component]) {
        absentKeys.push(`${component} (entire namespace missing from fr.json)`);
        continue;
      }
      for (const key of Object.keys(keys)) {
        const val = frTree[component]![key];
        if (val === undefined) {
          absentKeys.push(`${component}.${key}`);
        } else if (typeof val === 'string' && val.trim().length === 0) {
          untranslatedKeys.push(`${component}.${key}`);
        }
      }
    }

    expect(deadKeys, 'Keys present in fr.json but absent in TypeScript code:').toEqual([]);
    expect(absentKeys, 'Keys present in TypeScript code but absent in fr.json:').toEqual([]);
    expect(untranslatedKeys, 'Keys present in fr.json with empty translations:').toEqual([]);
  });
});
