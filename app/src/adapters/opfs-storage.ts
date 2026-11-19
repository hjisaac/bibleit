import type {
  ArtifactStore,
  FileStorage,
  StorageStat,
  StorageWriteOptions,
} from '../core/ports';
import type { Manifest, RawChunk, VerseCorpusData } from '../core/types';
import { clearBookCache } from './book-store';

const SUPPORTED_SCHEMA_VERSION = 3;

export class CorruptArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptArtifactError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'Offline storage is unavailable in this environment (e.g. Private Browsing).') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export function urlToOpfsFilename(urlOrKey: string): string {
  const stripped = urlOrKey.replace(/^https?:\/\/[^/]+\//, '');
  return stripped.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function toExactArrayBuffer(bytes: ArrayBufferView): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return copy.buffer;
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

async function resolvePath(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<{ dir: FileSystemDirectoryHandle; filename: string } | null> {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const filename = parts.pop()!;
  let current = root;
  for (const segment of parts) {
    try {
      current = await current.getDirectoryHandle(segment, { create });
    } catch {
      return null;
    }
  }
  return { dir: current, filename };
}

export class OpfsStorage implements FileStorage {
  async isAvailable(): Promise<boolean> {
    const root = await getOpfsRoot();
    return root !== null;
  }

  async stat(path: string): Promise<StorageStat | null> {
    const root = await getOpfsRoot();
    if (!root) return null;
    const resolved = await resolvePath(root, path, false);
    if (!resolved) return null;
    try {
      const handle = await resolved.dir.getFileHandle(resolved.filename);
      const file = await handle.getFile();
      return { size: file.size, lastModified: file.lastModified };
    } catch {
      return null;
    }
  }

  async has(path: string, minBytes = 1): Promise<boolean> {
    const fileStat = await this.stat(path);
    return fileStat !== null && fileStat.size >= minBytes;
  }

  async readFile(path: string): Promise<File | null> {
    const root = await getOpfsRoot();
    if (!root) return null;
    const resolved = await resolvePath(root, path, false);
    if (!resolved) return null;
    try {
      const handle = await resolved.dir.getFileHandle(resolved.filename);
      return await handle.getFile();
    } catch {
      return null;
    }
  }

  async read(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const file = await this.readFile(path);
    if (!file) return null;
    return new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  }

  async readText(path: string): Promise<string | null> {
    const file = await this.readFile(path);
    if (!file) return null;
    return await file.text();
  }

  async readJson<T = unknown>(path: string): Promise<T | null> {
    const text = await this.readText(path);
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async write(
    path: string,
    data: Uint8Array<ArrayBuffer> | ArrayBuffer | Blob | Response | ReadableStream<Uint8Array> | string,
    options?: StorageWriteOptions,
  ): Promise<void> {
    const root = await getOpfsRoot();
    if (!root) throw new StorageUnavailableError();
    const resolved = await resolvePath(root, path, true);
    if (!resolved) throw new Error(`Cannot resolve path: ${path}`);

    const handle = await resolved.dir.getFileHandle(resolved.filename, { create: true });

    if ('createWritable' in handle) {
      const writable = await handle.createWritable();
      try {
        if (typeof data === 'string') {
          await writable.write(new TextEncoder().encode(data));
        } else if (data instanceof Response) {
          if (data.body) {
            await this.streamToWritable(data.body, writable, data.headers.get('content-length'), options);
          } else {
            await writable.write(await data.arrayBuffer());
          }
        } else if (data instanceof ReadableStream) {
          await this.streamToWritable(data, writable, null, options);
        } else if (data instanceof Blob) {
          await writable.write(data);
        } else if (data instanceof ArrayBuffer) {
          await writable.write(data);
        } else {
          await writable.write(toExactArrayBuffer(data));
        }
      } catch (err) {
        await writable.abort().catch(() => {});
        throw err;
      }
      await writable.close();
    } else if ('createSyncAccessHandle' in handle) {
      const accessHandle = await (handle as any).createSyncAccessHandle();
      try {
        if (typeof data === 'string') {
          accessHandle.write(new TextEncoder().encode(data));
        } else if (data instanceof Response) {
          if (data.body) {
            const reader = data.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              accessHandle.write(value);
            }
          } else {
            accessHandle.write(new Uint8Array(await data.arrayBuffer()));
          }
        } else if (data instanceof ReadableStream) {
          const reader = data.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accessHandle.write(value);
          }
        } else if (data instanceof Blob) {
          accessHandle.write(new Uint8Array(await data.arrayBuffer()));
        } else if (data instanceof ArrayBuffer) {
          accessHandle.write(new Uint8Array(data));
        } else {
          accessHandle.write(data);
        }
        accessHandle.flush();
      } finally {
        accessHandle.close();
      }
    }

    if (options?.expectedSha256) {
      const matches = await this.verifySha256(path, options.expectedSha256);
      if (!matches) {
        await this.delete(path);
        throw new CorruptArtifactError(`Integrity check failed for ${path}`);
      }
    }
  }

  private async streamToWritable(
    stream: ReadableStream<Uint8Array>,
    writable: FileSystemWritableFileStream,
    contentLength: string | null,
    options?: StorageWriteOptions,
  ): Promise<void> {
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = stream.getReader();
    let loaded = 0;
    while (true) {
      if (options?.signal?.aborted) {
        await reader.cancel();
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await writable.write(toExactArrayBuffer(value));
        loaded += value.byteLength;
        if (options?.onProgress && total > 0) {
          options.onProgress(Math.min(99, Math.round((loaded / total) * 100)));
        }
      }
    }
    options?.onProgress?.(100);
  }

  async verifySha256(path: string, expectedSha256: string): Promise<boolean> {
    if (!expectedSha256 || typeof crypto === 'undefined' || !crypto.subtle) return true;
    const bytes = await this.read(path);
    if (!bytes) return false;
    const hashBuf = await crypto.subtle.digest('SHA-256', toExactArrayBuffer(bytes));
    const hashArr = Array.from(new Uint8Array(hashBuf));
    const actualHex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
    return actualHex === expectedSha256.toLowerCase();
  }

  async delete(path: string): Promise<boolean> {
    const root = await getOpfsRoot();
    if (!root) return false;
    const resolved = await resolvePath(root, path, false);
    if (!resolved) return false;
    try {
      await resolved.dir.removeEntry(resolved.filename);
      return true;
    } catch {
      return false;
    }
  }

  async deleteDir(dirPath: string): Promise<boolean> {
    const root = await getOpfsRoot();
    if (!root) return false;
    const parts = dirPath.split('/').filter(Boolean);
    if (parts.length === 0) return false;
    const dirName = parts.pop()!;
    let current = root;
    for (const segment of parts) {
      try {
        current = await current.getDirectoryHandle(segment, { create: false });
      } catch {
        return false;
      }
    }
    try {
      await current.removeEntry(dirName, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath?: string): Promise<string[]> {
    const root = await getOpfsRoot();
    if (!root) return [];
    let dir = root;
    if (dirPath) {
      const parts = dirPath.split('/').filter(Boolean);
      for (const segment of parts) {
        try {
          dir = await dir.getDirectoryHandle(segment, { create: false });
        } catch {
          return [];
        }
      }
    }
    const names: string[] = [];
    if (typeof (dir as any).keys === 'function') {
      for await (const name of (dir as any).keys()) {
        names.push(name);
      }
    }
    return names;
  }

}

export interface StorageCacheProxy {
  match(request: string | Request): Promise<Response | undefined>;
  put(
    request: string | Request,
    response: Response,
    progressCallback?: (data: { loaded: number; total: number; progress: number }) => void,
  ): Promise<void>;
  delete?(request: string | Request): Promise<boolean>;
}

export function createCacheProxy(storage: FileStorage, subDir = 'models'): StorageCacheProxy {
  return new Proxy(storage as any, {
    get(target: FileStorage, prop: string | symbol, receiver: unknown) {
      if (prop === 'match') {
        return async (request: string | Request): Promise<Response | undefined> => {
          const key = typeof request === 'string' ? request : request.url;
          const filename = urlToOpfsFilename(key);
          const path = `${subDir}/${filename}`;
          const file = await target.readFile(path);
          if (!file || file.size === 0) return undefined;

          const headers = new Headers();
          headers.set('content-length', String(file.size));
          headers.set('content-type', filename.endsWith('.json') ? 'application/json' : 'application/octet-stream');
          return new Response(file, { headers });
        };
      }

      if (prop === 'put') {
        return async (
          request: string | Request,
          response: Response,
          progressCallback?: (data: { loaded: number; total: number; progress: number }) => void,
        ): Promise<void> => {
          const key = typeof request === 'string' ? request : request.url;
          const filename = urlToOpfsFilename(key);
          const path = `${subDir}/${filename}`;
          const contentLength = response.headers.get('content-length');
          const total = contentLength ? parseInt(contentLength, 10) : 0;

          await target.write(path, response, {
            onProgress: (pct) => {
              if (progressCallback && total > 0) {
                const loaded = Math.round((pct / 100) * total);
                progressCallback({ loaded, total, progress: pct });
              }
            },
          });
        };
      }

      if (prop === 'delete') {
        return async (request: string | Request): Promise<boolean> => {
          const key = typeof request === 'string' ? request : request.url;
          const filename = urlToOpfsFilename(key);
          return await target.delete(`${subDir}/${filename}`);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

function getDataUrl(file: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}data/${file}`;
}

async function verifySha256Bytes(bytes: Uint8Array<ArrayBuffer>, expectedHex?: string): Promise<void> {
  if (!expectedHex || typeof crypto === 'undefined' || !crypto.subtle) return;
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const actualHex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (actualHex !== expectedHex.toLowerCase()) {
    throw new CorruptArtifactError(`Integrity check failed: expected ${expectedHex}, got ${actualHex}`);
  }
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

async function fetchWithProgress(
  url: string,
  onProgress?: (progressPercent: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);

      const contentLength = res.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!res.body || total === 0 || !onProgress) {
        const buf = await res.arrayBuffer();
        onProgress?.(100);
        return new Uint8Array(buf) as Uint8Array<ArrayBuffer>;
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;

      try {
        while (true) {
          if (signal?.aborted) {
            await reader.cancel();
            throw new DOMException('The user aborted a request.', 'AbortError');
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            onProgress(Math.min(99, Math.round((loaded / total) * 100)));
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          throw new DOMException('The user aborted a request.', 'AbortError');
        }
        throw err;
      }

      const merged = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      onProgress(100);
      return merged as Uint8Array<ArrayBuffer>;
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      if (attempt === MAX_RETRIES) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`Failed to fetch ${url} after retries`);
}

export function createArtifactStore(storage: FileStorage = new OpfsStorage()): ArtifactStore {
  let manifestPromise: Promise<Manifest> | null = null;

  async function resolveManifest(): Promise<Manifest> {
    const isAvail = await storage.isAvailable();

    // Network-first to discover updated artifact hashes when online
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
      if (isAvail) {
        await storage.write('manifest.json', JSON.stringify(m));
      }
      return m;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Unsupported manifest schema_version:')) {
        throw err;
      }
      networkError = err;
    }

    // Offline fallback from local storage
    if (isAvail) {
      const cached = await storage.readJson<Manifest>('manifest.json');
      if (cached && cached.schema_version === SUPPORTED_SCHEMA_VERSION) {
        return cached;
      }
    }

    throw networkError instanceof Error ? networkError : new Error('Failed to load manifest');
  }

  async function loadVerifiedArtifact<T>(
    filename: string,
    remoteFile: string,
    expectedSha256: string | undefined,
    parse: (bytes: Uint8Array<ArrayBuffer>) => Promise<T> | T,
    onProgress?: (progressPercent: number) => void,
    onCachedToOpfs?: () => void,
    signal?: AbortSignal,
  ): Promise<T> {
    const isGz = remoteFile.endsWith('.gz');
    const cached = await storage.read(filename);
    if (cached) {
      try {
        const uncompressed = isGz ? await decompressGzipBytes(cached) : cached;
        await verifySha256Bytes(uncompressed, expectedSha256);
        return await parse(uncompressed);
      } catch (err) {
        await storage.delete(filename);
        throw new CorruptArtifactError(
          `Cached ${filename} corrupted and cleared from storage: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const isAvail = await storage.isAvailable();
    if (!isAvail) {
      throw new StorageUnavailableError();
    }

    const downloaded = await fetchWithProgress(getDataUrl(remoteFile), onProgress, signal);
    let uncompressed: Uint8Array<ArrayBuffer>;
    let toStore: Uint8Array<ArrayBuffer>;

    if (isGz) {
      if (isGzip(downloaded)) {
        uncompressed = await decompressGzipBytes(downloaded);
        toStore = downloaded;
      } else {
        uncompressed = downloaded;
        toStore = await compressGzipBytes(downloaded);
      }
    } else {
      uncompressed = downloaded;
      toStore = downloaded;
    }

    await verifySha256Bytes(uncompressed, expectedSha256);
    const parsed = await parse(uncompressed);
    await storage.write(filename, toStore);
    onCachedToOpfs?.();
    return parsed;
  }

  return {
    manifest(): Promise<Manifest> {
      if (!manifestPromise) {
        manifestPromise = resolveManifest().catch((err) => {
          manifestPromise = null;
          throw err;
        });
      }
      return manifestPromise;
    },

    async verses(onProgress?: (progressPercent: number) => void, signal?: AbortSignal): Promise<VerseCorpusData> {
      const m = await this.manifest();
      return loadVerifiedArtifact(
        `verses-v${m.schema_version}.json.gz`,
        m.corpus.verses,
        m.corpus.sha256,
        (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as VerseCorpusData,
        onProgress,
        () => void clearBookCache(),
        signal,
      );
    },

    async chunks(onProgress?: (progressPercent: number) => void, signal?: AbortSignal): Promise<RawChunk[]> {
      const m = await this.manifest();
      return loadVerifiedArtifact(
        `chunks-${m.chunks.hash}.json.gz`,
        m.chunks.file,
        m.chunks.sha256,
        (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as RawChunk[],
        onProgress,
        undefined,
        signal,
      );
    },

    async embeddings(
      onProgress?: (progressPercent: number) => void,
      signal?: AbortSignal,
    ): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
      const m = await this.manifest();
      const isInt8 = m.embeddings.quantization.type === 'int8';
      const ext = isInt8 ? 'i8.bin' : 'f32.bin';
      const data = await loadVerifiedArtifact(
        `embeddings-${m.chunks.hash}.${ext}`,
        m.embeddings.file,
        m.embeddings.sha256,
        (bytes) => toExactArrayBuffer(bytes),
        onProgress,
        undefined,
        signal,
      );

      if (isInt8) {
        const scalesMeta = m.embeddings.quantization as { scales: string; scales_sha256?: string };
        const scales = await loadVerifiedArtifact(
          `scales-${m.chunks.hash}.f32.bin`,
          scalesMeta.scales,
          scalesMeta.scales_sha256,
          (bytes) => toExactArrayBuffer(bytes),
          undefined,
          undefined,
          signal,
        );
        return { data, scales };
      }

      return { data };
    },

    async hasVerses(): Promise<boolean> {
      return await storage.has(`verses-v${SUPPORTED_SCHEMA_VERSION}.json.gz`);
    },

    async hasEmbeddings(): Promise<boolean> {
      const names = await storage.list();
      return names.some(
        (name) => name.startsWith('embeddings-') && (name.endsWith('.i8.bin') || name.endsWith('.f32.bin')),
      );
    },

    async isStorageAvailable(): Promise<boolean> {
      return await storage.isAvailable();
    },

    async clear(): Promise<void> {
      manifestPromise = null;
      const names = await storage.list();
      for (const name of names) {
        if (
          name.startsWith('verses-') ||
          name.startsWith('chunks-') ||
          name.startsWith('embeddings-') ||
          name.startsWith('scales-') ||
          name === 'manifest.json'
        ) {
          await storage.delete(name);
        }
      }
    },
  };
}

export class OpfsArtifactStore implements ArtifactStore {
  private store: ArtifactStore;

  constructor(storage: FileStorage = new OpfsStorage()) {
    this.store = createArtifactStore(storage);
  }

  manifest(): Promise<Manifest> {
    return this.store.manifest();
  }

  verses(onProgress?: (progressPercent: number) => void, signal?: AbortSignal): Promise<VerseCorpusData> {
    return this.store.verses(onProgress, signal);
  }

  chunks(onProgress?: (progressPercent: number) => void, signal?: AbortSignal): Promise<RawChunk[]> {
    return this.store.chunks(onProgress, signal);
  }

  embeddings(
    onProgress?: (progressPercent: number) => void,
    signal?: AbortSignal,
  ): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
    return this.store.embeddings(onProgress, signal);
  }

  hasVerses(): Promise<boolean> {
    return this.store.hasVerses ? this.store.hasVerses() : Promise.resolve(false);
  }

  hasEmbeddings(): Promise<boolean> {
    return this.store.hasEmbeddings ? this.store.hasEmbeddings() : Promise.resolve(false);
  }

  isStorageAvailable(): Promise<boolean> {
    return this.store.isStorageAvailable ? this.store.isStorageAvailable() : Promise.resolve(false);
  }

  clear(): Promise<void> {
    return this.store.clear();
  }
}
