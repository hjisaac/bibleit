const FRENCH_DIACRITICS_REGEX = /[éèêëàâîïôùûçœæ]/i;
const FRENCH_ELISIONS_REGEX = /\b(c|d|j|l|m|n|s|t|qu)['’][a-zà-ÿ]/i;
const FRENCH_WORDS_REGEX =
  /\b(dans|avec|sous|vers|sans|chez|les|des|du|une|est|sont|ont|qui|que|quoi|dont|cette|ces|cet|notre|votre|leur|leurs|pourquoi|quand|aussi|mais|tous|toute|toutes|seigneur|paix)\b/i;

const ENGLISH_CONTRACTIONS_REGEX = /\b[a-z]+['’](s|t|re|ve|ll|d)\b/i;
const ENGLISH_WORDS_REGEX =
  /\b(the|and|of|to|in|is|are|that|for|with|was|at|by|from|this|which|they|have|has|had|what|when|where|who|whom|whose|how|why|not|be|been|shall|will|should|would|could|unto|thee|thou|thy|thine|peace|lord|god|faith|grace|love|hope|fear|heart|prayer|sin|truth|light|anxiety)\b/i;

let cachedDetector: { detect: (text: string) => Promise<Array<{ detectedLanguage: string; confidence: number }>> } | null = null;
let detectorSupported: boolean | null = null;

export function resetLanguageDetectorCacheForTesting(): void {
  cachedDetector = null;
  detectorSupported = null;
}

async function getBrowserDetector() {
  if (detectorSupported === false && typeof self !== 'undefined' && !('LanguageDetector' in self)) {
    return null;
  }
  if (cachedDetector && typeof self !== 'undefined' && 'LanguageDetector' in self) {
    return cachedDetector;
  }

  if (typeof self !== 'undefined' && 'LanguageDetector' in self) {
    try {
      const create = (self as unknown as { LanguageDetector: { create: () => Promise<typeof cachedDetector> } }).LanguageDetector.create;
      cachedDetector = await create();
      detectorSupported = true;
      return cachedDetector;
    } catch {
      detectorSupported = false;
    }
  }
  detectorSupported = false;
  return null;
}

/**
 * Detects whether the query text is already in English or French.
 * Checks native browser AI LanguageDetector first, then applies strict heuristics.
 */
export async function detectQueryLanguage(text: string): Promise<'en' | 'fr' | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. On-device browser LanguageDetector API (Chromium Built-in AI)
  const detector = await getBrowserDetector();
  if (detector) {
    try {
      const results = await detector.detect(trimmed);
      const top = results[0];
      if (top && top.confidence > 0.6) {
        if (top.detectedLanguage === 'en') return 'en';
        if (top.detectedLanguage === 'fr') return 'fr';
      }
    } catch {
      // Degrade to heuristics
    }
  }

  // 2. Strict French marker heuristics (diacritics and clitic elisions are unambiguous)
  const hasFrenchDiacritics = FRENCH_DIACRITICS_REGEX.test(trimmed);
  const hasFrenchElisions = FRENCH_ELISIONS_REGEX.test(trimmed);
  if (hasFrenchDiacritics || hasFrenchElisions) {
    return 'fr';
  }

  const hasFrenchWords = FRENCH_WORDS_REGEX.test(trimmed);
  const hasEnglishWords = ENGLISH_WORDS_REGEX.test(trimmed) || ENGLISH_CONTRACTIONS_REGEX.test(trimmed);

  if (hasFrenchWords && !hasEnglishWords) return 'fr';
  if (hasEnglishWords && !hasFrenchWords) return 'en';

  return null;
}
