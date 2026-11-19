import starterData from '../locales/starter-topics.json';

interface LocaleTopics {
  readonly popularTopics: readonly string[];
  readonly searchSuggestions: readonly string[];
}

const topicsByLocale: Record<string, LocaleTopics> = starterData;
const defaultTopics: LocaleTopics = starterData.en;

export const POPULAR_TOPICS: Record<string, readonly string[]> & { en: readonly string[]; fr: readonly string[] } = {
  en: starterData.en.popularTopics,
  fr: starterData.fr.popularTopics,
};

export const SEARCH_SUGGESTIONS: Record<string, readonly string[]> & { en: readonly string[]; fr: readonly string[] } = {
  en: starterData.en.searchSuggestions,
  fr: starterData.fr.searchSuggestions,
};

export function getPopularTopics(locale = 'en'): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.popularTopics;
}

export function getSearchSuggestions(locale = 'en'): readonly string[] {
  const data = topicsByLocale[locale] ?? defaultTopics;
  return data.searchSuggestions;
}
