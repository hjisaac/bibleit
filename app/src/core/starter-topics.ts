import starterData from '../locales/starter-topics.json';

interface LocaleTopics {
  readonly popularTopics: readonly string[];
  readonly searchSuggestions: readonly string[];
}

const topicsByLocale: Record<string, LocaleTopics> = starterData;
const defaultTopics: LocaleTopics = starterData.en;

export function getPopularTopics(locale = 'en'): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.popularTopics;
}

export function getSearchSuggestions(locale = 'en'): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.searchSuggestions;
}
