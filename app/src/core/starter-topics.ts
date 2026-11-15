
export const POPULAR_TOPICS = Object.freeze({
  en: Object.freeze([
    'Peace in anxiety',
    'Strength and courage',
    'Wisdom and guidance',
    'Forgiveness and grace',
    'Comfort in grief',
    'Faith and trust',
    'Love your neighbor',
    'Hope for the future',
  ]),
  fr: Object.freeze([
    "Paix dans l'anxiété",
    'Force et courage',
    'Sagesse et discernement',
    'Pardon et grâce',
    'Consolation dans le deuil',
    'Foi et confiance',
    'Aime ton prochain',
    "Espérance pour l'avenir",
  ]),
});

export const SEARCH_SUGGESTIONS = Object.freeze({
  en: Object.freeze([
    'Philippians 4:7',
    'peace that surpasses',
    'What did Jesus teach about worry?',
    'Romans 8:28',
  ]),
  fr: Object.freeze([
    'Philippiens 4:7',
    'paix qui surpasse',
    "Qu'a enseigné Jésus sur l'inquiétude ?",
    'Romains 8:28',
  ]),
});

export function getPopularTopics(locale: string = 'en'): readonly string[] {
  const dict = POPULAR_TOPICS as Record<string, readonly string[]>;
  return dict[locale] ?? POPULAR_TOPICS.en;
}

export function getSearchSuggestions(locale: string = 'en'): readonly string[] {
  const dict = SEARCH_SUGGESTIONS as Record<string, readonly string[]>;
  return dict[locale] ?? SEARCH_SUGGESTIONS.en;
}
