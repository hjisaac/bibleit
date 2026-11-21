import en from '../locales/en.json';
import fr from '../locales/fr.json';
import { DEFAULT_LOCALE, type Locale } from './types';

interface LocaleTopics {
  readonly popularTopics: readonly string[];
  readonly searchSuggestions: readonly string[];
}

const topicsByLocale: Readonly<Record<Locale, LocaleTopics>> = {
  en: en.starterTopics,
  fr: fr.starterTopics,
};

export function getPopularTopics(locale: string = DEFAULT_LOCALE): readonly string[] {
  return (topicsByLocale[locale as Locale] ?? topicsByLocale[DEFAULT_LOCALE]).popularTopics;
}

export function getSearchSuggestions(locale: string = DEFAULT_LOCALE): readonly string[] {
  return (topicsByLocale[locale as Locale] ?? topicsByLocale[DEFAULT_LOCALE]).searchSuggestions;
}
