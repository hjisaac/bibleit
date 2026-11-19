import starterData from '../locales/starter-topics.json';
import { DEFAULT_LOCALE } from './types';

interface LocaleTopics {
  readonly popularTopics: readonly string[];
  readonly searchSuggestions: readonly string[];
}

const topicsByLocale: Record<string, LocaleTopics> = starterData;
const defaultTopics: LocaleTopics = starterData[DEFAULT_LOCALE];

export function getPopularTopics(locale: string = DEFAULT_LOCALE): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.popularTopics;
}

export function getSearchSuggestions(locale: string = DEFAULT_LOCALE): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.searchSuggestions;
}
