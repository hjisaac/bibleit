export interface BookManifestEntry {
  readonly id: string;
  readonly size: number;
  readonly crc32: string;
}

export interface BibleManifest {
  readonly translation: string;
  readonly name: string;
  readonly totalBytes: number;
  readonly bookCount: number;
  readonly books: Readonly<Record<string, BookManifestEntry>>;
}

// Precomputed table for fast non-cryptographic CRC32 integrity verification.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

/** Computes the standard CRC32 checksum of a string or byte array in hex. */
export function computeCrc32(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/** Verifies that downloaded book content matches its precomputed CRC32 checksum. */
export function verifyBookIntegrity(
  bookId: string,
  content: string | Uint8Array,
  manifest: BibleManifest = WEB_BIBLE_MANIFEST,
): boolean {
  const entry = manifest.books[bookId];
  if (!entry) return false;
  return computeCrc32(content) === entry.crc32;
}

const manifestHashCache = new WeakMap<BibleManifest, string>();

/** Deterministic 8-char CRC32 over book checksums (content hash, not a git commit hash). */
export function getManifestContentHash(manifest: BibleManifest): string {
  const cached = manifestHashCache.get(manifest);
  if (cached) return cached;
  const fingerprint = Object.keys(manifest.books)
    .sort()
    .map((id) => `${id}:${manifest.books[id]!.crc32}`)
    .join('|');
  const hash = computeCrc32(fingerprint);
  manifestHashCache.set(manifest, hash);
  return hash;
}

import { DEFAULT_TRANSLATION, type TranslationId } from './types';
import { WEB_BIBLE_MANIFEST } from './web-manifest';
import { LSG_BIBLE_MANIFEST } from './lsg-manifest';
export { WEB_BIBLE_MANIFEST, LSG_BIBLE_MANIFEST };

export function getBibleManifest(translationId: string = DEFAULT_TRANSLATION): BibleManifest {
  const key = translationId.toLowerCase() as TranslationId;
  return BIBLE_MANIFESTS[key] ?? WEB_BIBLE_MANIFEST;
}

export const BIBLE_MANIFESTS: Readonly<Record<TranslationId, BibleManifest>> = Object.freeze({
  web: WEB_BIBLE_MANIFEST,
  lsg: LSG_BIBLE_MANIFEST,
});
