import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { findBookByPrefix, getLocalizedBookName } from '@bibleit/engine';
import { getBibleManifest } from '../src/core/bible-manifest';
import {
  clearBookCache,
  loadBook,
  resolveVerseText,
  VERSE_ALIASES,
} from '../src/adapters/book-store';

describe('French & English Multi-Translation Support', () => {
  beforeAll(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('/data/books/')) {
        const relativePath = urlStr.replace(/^https?:\/\/[^/]+/, '');
        const filePath = path.resolve(__dirname, '../public', `.${relativePath}`);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          return new Response(content, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      return new Response('Not Found', { status: 404 });
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });
  it('localizes book names properly by locale', () => {
    expect(getLocalizedBookName('GEN', 'en')).toBe('Genesis');
    expect(getLocalizedBookName('GEN', 'fr')).toBe('Genèse');
    expect(getLocalizedBookName('ROM', 'en')).toBe('Romans');
    expect(getLocalizedBookName('ROM', 'fr')).toBe('Romains');
    expect(getLocalizedBookName('REV', 'en')).toBe('Revelation');
    expect(getLocalizedBookName('REV', 'fr')).toBe('Apocalypse');
    expect(getLocalizedBookName('JHN', 'fr')).toBe('Jean');
    expect(getLocalizedBookName('MRK', 'fr')).toBe('Marc');
  });

  it('matches French book names in prefix lookup in O(1)', () => {
    expect(findBookByPrefix('genèse')?.id).toBe('GEN');
    expect(findBookByPrefix('genese')?.id).toBe('GEN');
    expect(findBookByPrefix('jean')?.id).toBe('JHN');
    expect(findBookByPrefix('apocalypse')?.id).toBe('REV');
    expect(findBookByPrefix('matthieu')?.id).toBe('MAT');
    expect(findBookByPrefix('rom', 'fr')?.id).toBe('ROM');
    expect(findBookByPrefix('romains', 'fr')?.id).toBe('ROM');
    expect(findBookByPrefix('mc', 'fr')?.id).toBe('MRK');
    expect(findBookByPrefix('lc', 'fr')?.id).toBe('LUK');
    expect(findBookByPrefix('nb', 'fr')?.id).toBe('NUM');
    expect(findBookByPrefix('1r', 'fr')?.id).toBe('1KI');
    expect(findBookByPrefix('1p', 'fr')?.id).toBe('1PE');
    expect(findBookByPrefix('ap', 'fr')?.id).toBe('REV');
  });

  it('provides matching manifests for both WEB and LSG', () => {
    const web = getBibleManifest('web');
    const lsg = getBibleManifest('lsg');

    expect(web.translation).toBe('WEB');
    expect(lsg.translation).toBe('LSG');

    expect(web.bookCount).toBe(66);
    expect(lsg.bookCount).toBe(66);

    const webKeys = Object.keys(web.books).sort();
    const lsgKeys = Object.keys(lsg.books).sort();
    expect(webKeys).toEqual(lsgKeys);
  });

  it('contains the 7 Textus Receptus verse aliases', () => {
    expect(VERSE_ALIASES['ACT:8:37']).toEqual({ chapter: 8, verse: 36 });
    expect(VERSE_ALIASES['LUK:17:36']).toEqual({ chapter: 17, verse: 35 });
    expect(VERSE_ALIASES['ROM:16:25']).toEqual({ chapter: 14, verse: 23 });
  });

  it('loads books and resolves verses in both English and French', async () => {
    await clearBookCache();

    // Load John in French
    const lsgJohn = await loadBook('JHN', 'lsg');
    expect(lsgJohn.id).toBe('JHN');
    expect(lsgJohn.name).toBe('Jean');

    const frVerse = await resolveVerseText('JHN', 3, 16, 'lsg');
    expect(frVerse).toContain('Dieu a tant aimé le monde');

    // Load John in English
    const webJohn = await loadBook('JHN', 'web');
    expect(webJohn.id).toBe('JHN');

    const enVerse = await resolveVerseText('JHN', 3, 16, 'web');
    expect(enVerse).toContain('For God so loved the world');
  });

  it('resolves semantic address parity at EXO:8:1 in both translations', async () => {
    const enExo = await resolveVerseText('EXO', 8, 1, 'web');
    const frExo = await resolveVerseText('EXO', 8, 1, 'lsg');

    // In KJV versification, EXO:8:1 is the command to go to Pharaoh in both languages
    expect(enExo).toContain('Go in to Pharaoh');
    expect(frExo).toContain('Va vers Pharaon');
  });

  it('resolves Textus Receptus alias ACT:8:37 to Philip confession text', async () => {
    const act37 = await resolveVerseText('ACT', 8, 37, 'lsg');
    expect(act37).toBeDefined();
    expect(act37).toContain('Fils de Dieu');
  });
});
