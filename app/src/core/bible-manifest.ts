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
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/** Verifies that downloaded book content matches its precomputed CRC32 checksum. */
export function verifyBookIntegrity(bookId: string, content: string | Uint8Array): boolean {
  const entry = WEB_BIBLE_MANIFEST.books[bookId];
  if (!entry) return false;
  return computeCrc32(content) === entry.crc32;
}

export const WEB_BIBLE_MANIFEST: BibleManifest = {
  translation: 'WEB',
  name: 'World English Bible',
  totalBytes: 4758479,
  bookCount: 66,
  books: {
    '1CH': { id: '1CH', size: 129137, crc32: '6b5c7c0d' },
    '1CO': { id: '1CO', size: 58951, crc32: '072ffe34' },
    '1JN': { id: '1JN', size: 14995, crc32: '6884de80' },
    '1KI': { id: '1KI', size: 142743, crc32: 'fb51bb00' },
    '1PE': { id: '1PE', size: 15674, crc32: 'a7ec5ae7' },
    '1SA': { id: '1SA', size: 146560, crc32: 'ab5a0ce3' },
    '1TH': { id: '1TH', size: 11663, crc32: 'e52beec2' },
    '1TI': { id: '1TI', size: 15255, crc32: 'a87b3fd5' },
    '2CH': { id: '2CH', size: 154731, crc32: '908eb657' },
    '2CO': { id: '2CO', size: 37691, crc32: '4050f0da' },
    '2JN': { id: '2JN', size: 1918, crc32: 'f44b863a' },
    '2KI': { id: '2KI', size: 136345, crc32: '7910e165' },
    '2PE': { id: '2PE', size: 9834, crc32: '26c3be4f' },
    '2SA': { id: '2SA', size: 121253, crc32: '4c427ec3' },
    '2TH': { id: '2TH', size: 6544, crc32: '3e1b298f' },
    '2TI': { id: '2TI', size: 10765, crc32: '6a855be3' },
    '3JN': { id: '3JN', size: 1896, crc32: '619d3ce7' },
    ACT: { id: 'ACT', size: 149605, crc32: 'f817a7a2' },
    AMO: { id: 'AMO', size: 25244, crc32: 'eb0c2acf' },
    COL: { id: 'COL', size: 12889, crc32: '2cb316e5' },
    DAN: { id: 'DAN', size: 68260, crc32: 'ce813d4a' },
    DEU: { id: 'DEU', size: 162336, crc32: '55ea7804' },
    ECC: { id: 'ECC', size: 32904, crc32: '6babe5f9' },
    EPH: { id: 'EPH', size: 19811, crc32: '16b05978' },
    EST: { id: 'EST', size: 33632, crc32: '749108ac' },
    EXO: { id: 'EXO', size: 190967, crc32: '7b75d253' },
    EZK: { id: 'EZK', size: 226113, crc32: 'ce41f472' },
    EZR: { id: 'EZR', size: 45401, crc32: 'c9918f99' },
    GAL: { id: 'GAL', size: 19818, crc32: '9b6dd571' },
    GEN: { id: 'GEN', size: 227753, crc32: '6811baeb' },
    HAB: { id: 'HAB', size: 8721, crc32: '70043d19' },
    HAG: { id: 'HAG', size: 6678, crc32: '62fed8ed' },
    HEB: { id: 'HEB', size: 44478, crc32: 'fefb956c' },
    HOS: { id: 'HOS', size: 31592, crc32: '9dd85957' },
    ISA: { id: 'ISA', size: 219125, crc32: '0018499c' },
    JAS: { id: 'JAS', size: 14568, crc32: '9acef2ac' },
    JDG: { id: 'JDG', size: 111497, crc32: '356a1e70' },
    JER: { id: 'JER', size: 248746, crc32: '918217ac' },
    JHN: { id: 'JHN', size: 121598, crc32: '0770e6cb' },
    JOB: { id: 'JOB', size: 116660, crc32: 'd2246ad6' },
    JOL: { id: 'JOL', size: 12068, crc32: 'ff3d4273' },
    JON: { id: 'JON', size: 7784, crc32: '5ee8bb19' },
    JOS: { id: 'JOS', size: 110554, crc32: 'dc61691e' },
    JUD: { id: 'JUD', size: 4105, crc32: '0c920f17' },
    LAM: { id: 'LAM', size: 21184, crc32: '674aeb1a' },
    LEV: { id: 'LEV', size: 142805, crc32: 'b83ce69d' },
    LUK: { id: 'LUK', size: 159578, crc32: 'fb7707a2' },
    MAL: { id: 'MAL', size: 10681, crc32: '9763cac2' },
    MAT: { id: 'MAT', size: 150242, crc32: '5cd1db92' },
    MIC: { id: 'MIC', size: 18220, crc32: '7e0e7f57' },
    MRK: { id: 'MRK', size: 94225, crc32: '500fb7da' },
    NAM: { id: 'NAM', size: 7587, crc32: '8d52cce7' },
    NEH: { id: 'NEH', size: 64717, crc32: 'c31455e6' },
    NUM: { id: 'NUM', size: 197978, crc32: '2b54af65' },
    OBA: { id: 'OBA', size: 3869, crc32: '0df39566' },
    PHM: { id: 'PHM', size: 2853, crc32: '66656d54' },
    PHP: { id: 'PHP', size: 13843, crc32: '12e51e20' },
    PRO: { id: 'PRO', size: 97612, crc32: '95a67953' },
    PSA: { id: 'PSA', size: 270298, crc32: '41537221' },
    REV: { id: 'REV', size: 69182, crc32: '924dd58e' },
    ROM: { id: 'ROM', size: 60378, crc32: '7b7fb3c6' },
    RUT: { id: 'RUT', size: 15122, crc32: 'c4a7307e' },
    SNG: { id: 'SNG', size: 16186, crc32: '83392e73' },
    TIT: { id: 'TIT', size: 6200, crc32: '864422ec' },
    ZEC: { id: 'ZEC', size: 37336, crc32: '9607bc6b' },
    ZEP: { id: 'ZEP', size: 9521, crc32: 'd96ccebe' },
  },
};
