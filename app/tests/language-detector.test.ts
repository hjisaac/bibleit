import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { BrowserLanguageDetector } from '../src/core/language-detector';

describe('BrowserLanguageDetector', () => {
  let detector: BrowserLanguageDetector;

  beforeEach(() => {
    detector = new BrowserLanguageDetector();
  });

  afterEach(() => {
    delete (globalThis as any).LanguageDetector;
  });

  it('detects French via accents and diacritics', async () => {
    expect(await detector.detect("l'anxiété")).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('espérance et foi')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('grâce divine')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('péché et rédemption')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
  });

  it('detects French via clitic elisions', async () => {
    expect(await detector.detect("l'amour de Dieu")).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect("d'un seul coeur")).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect("qu'il soit beni")).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect("c'est la voie")).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
  });

  it('detects French via unambiguous French vocabulary', async () => {
    expect(await detector.detect('paix dans le Seigneur')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('qui sont ces hommes')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('pourquoi avoir peur')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
  });

  it('detects English via vocabulary and contractions', async () => {
    expect(await detector.detect('peace in anxiety')).toEqual({ language: 'en', detectionMethod: 'heuristic' });
    expect(await detector.detect('God is love')).toEqual({ language: 'en', detectionMethod: 'heuristic' });
    expect(await detector.detect('how to pray')).toEqual({ language: 'en', detectionMethod: 'heuristic' });
    expect(await detector.detect("don't be afraid")).toEqual({ language: 'en', detectionMethod: 'heuristic' });
    expect(await detector.detect('light and truth')).toEqual({ language: 'en', detectionMethod: 'heuristic' });
  });

  it('uses browser LanguageDetector and returns browser_ai when available', async () => {
    (globalThis as any).LanguageDetector = {
      create: async () => ({
        detect: async (text: string) => {
          if (text.includes('comfort')) {
            return [{ detectedLanguage: 'en', confidence: 0.95 }];
          }
          return [{ detectedLanguage: 'fr', confidence: 0.95 }];
        },
      }),
    };

    expect(await detector.detect('comfort')).toEqual({ language: 'en', detectionMethod: 'browser_ai' });
    expect(await detector.detect('consolation')).toEqual({ language: 'fr', detectionMethod: 'browser_ai' });
  });

  it('returns none for ambiguous queries or empty strings', async () => {
    expect(await detector.detect('')).toEqual({ language: null, detectionMethod: 'none' });
    expect(await detector.detect('   ')).toEqual({ language: null, detectionMethod: 'none' });
    expect(await detector.detect('David')).toEqual({ language: null, detectionMethod: 'none' });
    expect(await detector.detect('Jerusalem')).toEqual({ language: null, detectionMethod: 'none' });
  });

  it('detects French for unaccented phrases like "grace de Dieu"', async () => {
    expect(await detector.detect('grace de Dieu')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(await detector.detect('amour de Dieu')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
  });

  it('skips browser detector when availability returns "no"', async () => {
    const createMock = vi.fn();
    (globalThis as any).LanguageDetector = {
      availability: async () => 'no',
      create: createMock,
    };

    expect(await detector.detect('paix dans le Seigneur')).toEqual({ language: 'fr', detectionMethod: 'heuristic' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('caches detector failure and does not repeatedly call create', async () => {
    const createMock = vi.fn().mockRejectedValue(new Error('Model unsupported'));
    (globalThis as any).LanguageDetector = {
      create: createMock,
    };

    await detector.detect('peace in anxiety');
    await detector.detect('peace in anxiety');

    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
