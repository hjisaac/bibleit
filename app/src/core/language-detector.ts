import type { LanguageDetectorPort } from './ports';
import type { LanguageDetectionResult } from './types';

const FRENCH_DIACRITICS_REGEX = /[éèêëàâîïôùûçœæ]/i;
const FRENCH_ELISIONS_REGEX = /\b(c|d|j|l|m|n|s|t|qu)['’][a-zà-ÿ]/i;
const FRENCH_WORDS_REGEX =
  /\b(de|du|des|le|la|les|un|une|dans|avec|pour|sur|sous|vers|sans|chez|par|est|sont|ont|qui|que|quoi|dont|ce|cet|cette|ces|notre|votre|leur|leurs|pourquoi|comment|quand|aussi|mais|tous|toute|toutes|dieu|seigneur|paix|coeur|foi)\b/i;

const ENGLISH_CONTRACTIONS_REGEX = /\b[a-z]+['’](s|t|re|ve|ll|d)\b/i;
const ENGLISH_WORDS_REGEX =
  /\b(the|and|of|to|in|is|are|that|for|with|was|at|by|from|this|which|they|have|has|had|what|when|where|who|whom|whose|how|why|not|be|been|shall|will|should|would|could|unto|thee|thou|thy|thine|peace|lord|god|faith|love|hope|fear|heart|prayer|sin|truth|light|anxiety)\b/i;

interface NativeLanguageDetector {
  detect: (text: string) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
}

export class BrowserLanguageDetector implements LanguageDetectorPort {
  private cachedDetector: NativeLanguageDetector | null = null;
  private detectorSupported: boolean | null = null;

  private async getBrowserDetector(): Promise<NativeLanguageDetector | null> {
    if (this.detectorSupported === false) {
      return null;
    }
    if (this.cachedDetector) {
      return this.cachedDetector;
    }

    if (typeof self !== 'undefined' && 'LanguageDetector' in self) {
      try {
        const DetectorClass = (self as unknown as {
          LanguageDetector: {
            availability?: () => Promise<string>;
            create: () => Promise<NativeLanguageDetector>;
          };
        }).LanguageDetector;

        if (typeof DetectorClass.availability === 'function') {
          const status = await DetectorClass.availability();
          if (status === 'no' || status === 'unavailable') {
            this.detectorSupported = false;
            return null;
          }
        }

        this.cachedDetector = await DetectorClass.create();
        this.detectorSupported = true;
        return this.cachedDetector;
      } catch {
        this.detectorSupported = false;
      }
    }
    this.detectorSupported = false;
    return null;
  }

  async detect(text: string): Promise<LanguageDetectionResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { language: null, detectionMethod: 'none' };
    }

    const detector = await this.getBrowserDetector();
    if (detector) {
      try {
        const results = await detector.detect(trimmed);
        const top = results[0];
        if (top && top.confidence > 0.6) {
          if (top.detectedLanguage === 'en') return { language: 'en', detectionMethod: 'browser_ai' };
          if (top.detectedLanguage === 'fr') return { language: 'fr', detectionMethod: 'browser_ai' };
        }
      } catch {
        // Degrade to heuristics on detector error
      }
    }

    const hasFrenchDiacritics = FRENCH_DIACRITICS_REGEX.test(trimmed);
    const hasFrenchElisions = FRENCH_ELISIONS_REGEX.test(trimmed);
    if (hasFrenchDiacritics || hasFrenchElisions) {
      return { language: 'fr', detectionMethod: 'heuristic' };
    }

    const hasFrenchWords = FRENCH_WORDS_REGEX.test(trimmed);
    const hasEnglishWords = ENGLISH_WORDS_REGEX.test(trimmed) || ENGLISH_CONTRACTIONS_REGEX.test(trimmed);

    if (hasFrenchWords && !hasEnglishWords) return { language: 'fr', detectionMethod: 'heuristic' };
    if (hasEnglishWords && !hasFrenchWords) return { language: 'en', detectionMethod: 'heuristic' };

    return { language: null, detectionMethod: 'none' };
  }
}
