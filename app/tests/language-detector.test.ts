import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { detectQueryLanguage, resetLanguageDetectorCacheForTesting } from '../src/core/language-detector';

describe('detectQueryLanguage', () => {
  beforeEach(() => {
    resetLanguageDetectorCacheForTesting();
  });

  afterEach(() => {
    delete (globalThis as any).LanguageDetector;
    resetLanguageDetectorCacheForTesting();
  });

  it('detects French via accents and diacritics', async () => {
    expect(await detectQueryLanguage("l'anxiété")).toBe('fr');
    expect(await detectQueryLanguage('espérance et foi')).toBe('fr');
    expect(await detectQueryLanguage('grâce divine')).toBe('fr');
    expect(await detectQueryLanguage('péché et rédemption')).toBe('fr');
  });

  it('detects French via clitic elisions', async () => {
    expect(await detectQueryLanguage("l'amour de Dieu")).toBe('fr');
    expect(await detectQueryLanguage("d'un seul coeur")).toBe('fr');
    expect(await detectQueryLanguage("qu'il soit beni")).toBe('fr');
    expect(await detectQueryLanguage("c'est la voie")).toBe('fr');
  });

  it('detects French via unambiguous French vocabulary', async () => {
    expect(await detectQueryLanguage('paix dans le Seigneur')).toBe('fr');
    expect(await detectQueryLanguage('qui sont ces hommes')).toBe('fr');
    expect(await detectQueryLanguage('pourquoi avoir peur')).toBe('fr');
  });

  it('detects English via vocabulary and contractions', async () => {
    expect(await detectQueryLanguage('peace in anxiety')).toBe('en');
    expect(await detectQueryLanguage('God is love')).toBe('en');
    expect(await detectQueryLanguage('how to pray')).toBe('en');
    expect(await detectQueryLanguage("don't be afraid")).toBe('en');
    expect(await detectQueryLanguage('light and truth')).toBe('en');
  });

  it('uses browser LanguageDetector when available', async () => {
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

    expect(await detectQueryLanguage('comfort')).toBe('en');
  });

  it('returns null for ambiguous queries or empty strings', async () => {
    expect(await detectQueryLanguage('')).toBe(null);
    expect(await detectQueryLanguage('   ')).toBe(null);
    expect(await detectQueryLanguage('David')).toBe(null);
    expect(await detectQueryLanguage('Jerusalem')).toBe(null);
  });

  it('detects French for unaccented phrases like "grace de Dieu"', async () => {
    expect(await detectQueryLanguage('grace de Dieu')).toBe('fr');
    expect(await detectQueryLanguage('amour de Dieu')).toBe('fr');
  });

  it('skips browser detector when availability returns "no"', async () => {
    const createMock = vi.fn();
    (globalThis as any).LanguageDetector = {
      availability: async () => 'no',
      create: createMock,
    };

    expect(await detectQueryLanguage('paix dans le Seigneur')).toBe('fr');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('caches detector failure and does not repeatedly call create', async () => {
    const createMock = vi.fn().mockRejectedValue(new Error('Model unsupported'));
    (globalThis as any).LanguageDetector = {
      create: createMock,
    };

    await detectQueryLanguage('peace in anxiety');
    await detectQueryLanguage('peace in anxiety');

    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
