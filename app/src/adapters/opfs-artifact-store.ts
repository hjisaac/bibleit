import type { ArtifactStore } from '../core/ports';
import type { Manifest, RawChunk, VerseCorpusData } from '../core/types';
import { clearBookCache } from './book-store';

const SUPPORTED_SCHEMA_VERSION = 3;

export class CorruptArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptArtifactError';
  }
}

function getDataUrl(file: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}data/${file}`;
}

function toExactArrayBuffer(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
    try {
      return await navigator.storage.getDirectory();
    } catch {
      return null;
    }
  }
  return null;
}

async function readOpfsFile(
  root: FileSystemDirectoryHandle,
  filename: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const handle = await root.getFileHandle(filename);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeOpfsFile(
  root: FileSystemDirectoryHandle,
  filename: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const handle = await root.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function verifySha256(bytes: Uint8Array<ArrayBuffer>, expectedHex?: string): Promise<void> {
  if (!expectedHex || typeof crypto === 'undefined' || !crypto.subtle) return;
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const actualHex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (actualHex !== expectedHex.toLowerCase()) {
    throw new CorruptArtifactError(`Integrity check failed: expected ${expectedHex}, got ${actualHex}`);
  }
}

async function fetchWithProgress(
  url: string,
  onProgress?: (progressPercent: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);

  const contentLength = res.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!res.body || total === 0 || !onProgress) {
    const buf = await res.arrayBuffer();
    onProgress?.(100);
    return new Uint8Array(buf);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress(Math.min(99, Math.round((loaded / total) * 100)));
    }
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress(100);
  return merged;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function decompressGzipBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (isGzip(bytes) && typeof DecompressionStream !== 'undefined') {
    const stream = new Response(toExactArrayBuffer(bytes)).body?.pipeThrough(new DecompressionStream('gzip'));
    if (stream) return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

async function compressGzipBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Response(toExactArrayBuffer(bytes)).body?.pipeThrough(new CompressionStream('gzip'));
    if (stream) return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

export class OpfsArtifactStore implements ArtifactStore {
  private manifestPromise: Promise<Manifest> | null = null;

  manifest(): Promise<Manifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.resolveManifest().catch((err) => {
        this.manifestPromise = null;
        throw err;
      });
    }
    return this.manifestPromise;
  }

  private async resolveManifest(): Promise<Manifest> {
    const root = await getOpfsRoot();

    // Network-first (like PWA service worker update check) so new artifact hashes are discovered when online.
    let networkError: unknown = null;
    try {
      const res = await fetch(getDataUrl('manifest.json'));
      if (!res.ok) throw new Error(`Failed to fetch manifest: HTTP ${res.status}`);
      const m = (await res.json()) as Manifest;
      if (m.schema_version !== SUPPORTED_SCHEMA_VERSION) {
        throw new Error(
          `Unsupported manifest schema_version: ${m.schema_version} (expected ${SUPPORTED_SCHEMA_VERSION}).`,
        );
      }
      if (root) {
        const encoded = new TextEncoder().encode(JSON.stringify(m));
        await writeOpfsFile(root, 'manifest.json', new Uint8Array(encoded));
      }
      return m;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Unsupported manifest schema_version:')) {
        throw err;
      }
      networkError = err;
    }

    // Offline fallback: read previously cached manifest from OPFS.
    if (root) {
      const cached = await readOpfsFile(root, 'manifest.json');
      if (cached) {
        try {
          const m = JSON.parse(new TextDecoder().decode(cached)) as Manifest;
          if (m.schema_version === SUPPORTED_SCHEMA_VERSION) return m;
        } catch {
          await root.removeEntry('manifest.json').catch(() => {});
        }
      }
    }

    throw networkError instanceof Error ? networkError : new Error('Failed to load manifest');
  }

  private async loadVerifiedArtifact<T>(
    root: FileSystemDirectoryHandle | null,
    filename: string,
    remoteFile: string,
    expectedSha256: string | undefined,
    parse: (bytes: Uint8Array<ArrayBuffer>) => Promise<T> | T,
    onProgress?: (progressPercent: number) => void,
    onCachedToOpfs?: () => void,
  ): Promise<T> {
    const isGz = remoteFile.endsWith('.gz');
    const cached = root ? await readOpfsFile(root, filename) : null;
    if (cached) {
      try {
        const uncompressed = isGz ? await decompressGzipBytes(cached) : cached;
        await verifySha256(uncompressed, expectedSha256);
        return await parse(uncompressed);
      } catch (err) {
        await root?.removeEntry(filename).catch(() => {});
        throw new CorruptArtifactError(
          `Cached ${filename} corrupted and cleared from OPFS: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const downloaded = await fetchWithProgress(getDataUrl(remoteFile), onProgress);
    let uncompressed: Uint8Array<ArrayBuffer>;
    let toStore: Uint8Array<ArrayBuffer>;

    if (isGz) {
      if (isGzip(downloaded)) {
        uncompressed = await decompressGzipBytes(downloaded);
        toStore = downloaded;
      } else {
        // Transparently inflated by browser fetch (Content-Encoding: gzip).
        uncompressed = downloaded;
        toStore = await compressGzipBytes(downloaded);
      }
    } else {
      uncompressed = downloaded;
      toStore = downloaded;
    }

    await verifySha256(uncompressed, expectedSha256);
    const parsed = await parse(uncompressed);
    if (root) {
      await writeOpfsFile(root, filename, toStore);
      onCachedToOpfs?.();
    }
    return parsed;
  }

  async verses(onProgress?: (progressPercent: number) => void): Promise<VerseCorpusData> {
    const m = await this.manifest();
    const root = await getOpfsRoot();
    return this.loadVerifiedArtifact(
      root,
      `verses-v${m.schema_version}.json.gz`,
      m.corpus.verses,
      m.corpus.sha256,
      (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as VerseCorpusData,
      onProgress,
      () => void clearBookCache(),
    );
  }

  async chunks(onProgress?: (progressPercent: number) => void): Promise<RawChunk[]> {
    const m = await this.manifest();
    const root = await getOpfsRoot();
    return this.loadVerifiedArtifact(
      root,
      `chunks-${m.chunks.hash}.json.gz`,
      m.chunks.file,
      m.chunks.sha256,
      (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as RawChunk[],
      onProgress,
    );
  }

  async embeddings(
    onProgress?: (progressPercent: number) => void,
  ): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
    const m = await this.manifest();
    const root = await getOpfsRoot();
    const isInt8 = m.embeddings.quantization.type === 'int8';
    const ext = isInt8 ? 'i8.bin' : 'f32.bin';
    const data = await this.loadVerifiedArtifact(
      root,
      `embeddings-${m.chunks.hash}.${ext}`,
      m.embeddings.file,
      m.embeddings.sha256,
      (bytes) => toExactArrayBuffer(bytes),
      onProgress,
    );

    if (isInt8) {
      const scalesMeta = m.embeddings.quantization as { scales: string; scales_sha256?: string };
      const scales = await this.loadVerifiedArtifact(
        root,
        `scales-${m.chunks.hash}.f32.bin`,
        scalesMeta.scales,
        scalesMeta.scales_sha256,
        (bytes) => toExactArrayBuffer(bytes),
      );
      return { data, scales };
    }

    return { data };
  }

  async hasVerses(): Promise<boolean> {
    const root = await getOpfsRoot();
    if (!root) return false;
    try {
      const cached = await readOpfsFile(root, `verses-v${SUPPORTED_SCHEMA_VERSION}.json.gz`);
      return cached !== null && cached.length > 0;
    } catch {
      return false;
    }
  }

  async hasEmbeddings(): Promise<boolean> {
    const root = await getOpfsRoot();
    if (!root) return false;
    try {
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys?.() ?? []) {
        if (name.startsWith('embeddings-') && (name.endsWith('.i8.bin') || name.endsWith('.f32.bin'))) {
          const cached = await readOpfsFile(root, name);
          return cached !== null && cached.length > 0;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    this.manifestPromise = null;
    const root = await getOpfsRoot();
    if (root) {
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys?.() ?? []) {
        try {
          await root.removeEntry(name);
        } catch {
          // Ignore removal error
        }
      }
    }
  }
}
