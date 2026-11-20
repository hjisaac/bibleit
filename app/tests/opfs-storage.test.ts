import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CorruptArtifactError,
  OpfsStorage,
  StorageUnavailableError,
  createArtifactStore,
  createCacheProxy,
  urlToOpfsFilename,
} from '../src/adapters/opfs-storage';
import type { Manifest } from '../src/core/types';

const mockManifest: Manifest = {
  schema_version: 3,
  translation: { id: 'WEB', lang: 'en', name: 'World English Bible', license: 'Public Domain' },
  corpus: { verses: 'verses.json.gz', count: 1 },
  chunks: { file: 'chunks.json.gz', hash: 'cbd6645a3d9a', strategy: 'token_window' },
  embeddings: {
    file: 'embeddings.f32.bin',
    model: 'nomic-ai/nomic-embed-text-v1.5',
    dim: 2,
    query_prefix: 'search_query: ',
    quantization: { type: 'float32' },
    count: 1,
  },
};

function createMockOpfs() {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const dirs = new Map<string, any>();

  function createDirHandle(prefix = ''): any {
    return {
      async getFileHandle(name: string, options?: { create?: boolean }) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        if (!files.has(fullPath)) {
          if (!options?.create) throw new Error(`File not found: ${fullPath}`);
          files.set(fullPath, new Uint8Array(0));
        }
        return {
          async getFile() {
            const data = files.get(fullPath)!;
            return {
              size: data.byteLength,
              lastModified: Date.now(),
              async arrayBuffer() {
                return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
              },
              async text() {
                return new TextDecoder().decode(data);
              },
            };
          },
          async createWritable() {
            let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
            return {
              async write(chunk: any) {
                if (chunk instanceof Uint8Array) {
                  pending = new Uint8Array(chunk);
                } else if (chunk instanceof ArrayBuffer) {
                  pending = new Uint8Array(chunk);
                } else {
                  pending = new Uint8Array(await new Response(chunk).arrayBuffer());
                }
              },
              async close() {
                files.set(fullPath, pending);
              },
              async abort() {},
            };
          },
        };
      },
      async getDirectoryHandle(name: string, options?: { create?: boolean }) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        if (!dirs.has(fullPath)) {
          if (!options?.create) throw new Error(`Dir not found: ${fullPath}`);
          dirs.set(fullPath, createDirHandle(fullPath));
        }
        return dirs.get(fullPath);
      },
      async removeEntry(name: string, options?: { recursive?: boolean }) {
        const fullPath = prefix ? `${prefix}/${name}` : name;
        if (options?.recursive) {
          dirs.delete(fullPath);
          for (const key of Array.from(files.keys())) {
            if (key === fullPath || key.startsWith(`${fullPath}/`)) {
              files.delete(key);
            }
          }
        } else {
          files.delete(fullPath);
          dirs.delete(fullPath);
        }
      },
      async *keys() {
        for (const k of files.keys()) {
          if (prefix) {
            if (k.startsWith(`${prefix}/`)) {
              yield k.slice(prefix.length + 1);
            }
          } else {
            if (!k.includes('/')) {
              yield k;
            }
          }
        }
      },
    };
  }

  const root = createDirHandle();
  return { files, root };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('opfs-storage', () => {
  let opfs: ReturnType<typeof createMockOpfs>;

  beforeEach(() => {
    opfs = createMockOpfs();
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(async () => opfs.root),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('urlToOpfsFilename', () => {
    it('sanitizes URL into safe OPFS filename while preserving extension', () => {
      const url = 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/onnx/model_q4.onnx';
      const filename = urlToOpfsFilename(url);
      expect(filename).toBe('HuggingFaceTB_SmolLM2-360M-Instruct_resolve_main_onnx_model_q4.onnx');
      expect(filename).not.toContain('/');
      expect(filename).not.toContain(':');
    });

    it('handles JSON configs and tokenizers cleanly', () => {
      const url = 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/tokenizer.json';
      expect(urlToOpfsFilename(url)).toBe('HuggingFaceTB_SmolLM2-360M-Instruct_resolve_main_tokenizer.json');
    });
  });

  describe('OpfsStorage CRUD', () => {
    it('reports availability when OPFS is supported', async () => {
      const storage = new OpfsStorage();
      expect(await storage.isAvailable()).toBe(true);

      vi.stubGlobal('navigator', {});
      expect(await storage.isAvailable()).toBe(false);
    });

    it('writes and reads binary data, strings, and JSON', async () => {
      const storage = new OpfsStorage();
      await storage.write('test.txt', 'hello opfs');
      const textBlob = await storage.read('test.txt');
      expect(textBlob).not.toBeNull();
      expect(await textBlob!.text()).toBe('hello opfs');

      const bytes = await storage.read('test.txt');
      expect(bytes).not.toBeNull();
      expect(new TextDecoder().decode(await bytes!.arrayBuffer())).toBe('hello opfs');

      await storage.write('data.json', JSON.stringify({ key: 'val' }));
      const jsonBlob = await storage.read('data.json');
      const parsed = JSON.parse(await jsonBlob!.text());
      expect(parsed?.key).toBe('val');
    });

    it('writes and reads nested directory files', async () => {
      const storage = new OpfsStorage();
      await storage.write('models/smollm.onnx', 'model-bytes');
      const blob = await storage.read('models/smollm.onnx');
      expect(blob).not.toBeNull();
      expect(await blob!.text()).toBe('model-bytes');

      const files = await storage.list('models');
      expect(files).toContain('smollm.onnx');
    });

    it('checks existence and size via read()', async () => {
      const storage = new OpfsStorage();
      expect(await storage.read('missing.bin')).toBeNull();

      await storage.write('payload.bin', new Uint8Array([1, 2, 3, 4, 5]));
      const blob = await storage.read('payload.bin');
      expect(blob).not.toBeNull();
      expect(blob?.size).toBe(5);
    });

    it('deletes files and directories recursively', async () => {
      const storage = new OpfsStorage();
      await storage.write('nested/file1.txt', '1');
      await storage.write('nested/file2.txt', '2');
      expect(await storage.read('nested/file1.txt')).not.toBeNull();

      expect(await storage.delete('nested/file1.txt')).toBe(true);
      expect(await storage.read('nested/file1.txt')).toBeNull();

      expect(await storage.delete('nested')).toBe(true);
      expect(await storage.read('nested/file2.txt')).toBeNull();
    });

    it('throws StorageUnavailableError when writing without storage support', async () => {
      vi.stubGlobal('navigator', {});
      const storage = new OpfsStorage();
      await expect(storage.write('file.txt', 'data')).rejects.toThrow(StorageUnavailableError);
    });
  });

  describe('createCacheProxy', () => {
    it('matches stored files and returns Response with headers', async () => {
      const storage = new OpfsStorage();
      const cache = createCacheProxy(storage, 'models');

      expect(await cache.match('https://huggingface.co/model.onnx')).toBeUndefined();

      await storage.write(
        'models/' + urlToOpfsFilename('https://huggingface.co/model.onnx'),
        new Uint8Array([1, 2, 3]),
      );
      const res = await cache.match('https://huggingface.co/model.onnx');
      expect(res).toBeDefined();
      expect(res?.headers.get('content-length')).toBe('3');
      expect(res?.headers.get('content-type')).toBe('application/octet-stream');
    });

    it('puts streamed response into OPFS with progress', async () => {
      const storage = new OpfsStorage();
      const cache = createCacheProxy(storage, 'models');
      const progressSpy = vi.fn();

      const response = new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'content-length': '4' },
      });
      await cache.put('https://huggingface.co/model.onnx', response, progressSpy);

      const blob = await storage.read('models/' + urlToOpfsFilename('https://huggingface.co/model.onnx'));
      expect(blob).not.toBeNull();
      expect(blob?.size).toBe(4);
      expect(progressSpy).toHaveBeenCalled();
    });

    it('deletes model from cache', async () => {
      const storage = new OpfsStorage();
      const cache = createCacheProxy(storage, 'models');

      await storage.write('models/' + urlToOpfsFilename('https://huggingface.co/model.onnx'), 'data');
      expect(await cache.delete!('https://huggingface.co/model.onnx')).toBe(true);
      expect(await cache.match('https://huggingface.co/model.onnx')).toBeUndefined();
    });
  });

  describe('createArtifactStore / OpfsArtifactStore', () => {
    it('resolves manifest via network-first and caches to storage', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockManifest))));
      const store = createArtifactStore();
      const m = await store.manifest();
      expect(m.translation.id).toBe('WEB');

      const cached = opfs.files.get('manifest.json');
      expect(cached).toBeDefined();
      expect(JSON.parse(new TextDecoder().decode(cached!)).translation.id).toBe('WEB');
    });

    it('falls back to cached manifest when offline', async () => {
      opfs.files.set('manifest.json', new TextEncoder().encode(JSON.stringify(mockManifest)));
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('Offline');
      }));

      const store = createArtifactStore();
      const m = await store.manifest();
      expect(m.translation.id).toBe('WEB');
    });

    it('loads verses and triggers book cache eviction', async () => {
      const versesData = { 'GEN 1:1': 'In the beginning' };
      const versesJson = JSON.stringify(versesData);
      const hash = await sha256Hex(versesJson);
      const manifestWithHash = {
        ...mockManifest,
        corpus: { verses: 'verses.json', count: 1, sha256: hash },
      };

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('manifest.json')) {
          return new Response(JSON.stringify(manifestWithHash));
        }
        return new Response(versesJson);
      }));

      const store = createArtifactStore();
      const result = await store.verses();
      expect(result).toEqual(versesData);
      expect(await store.hasVerses!()).toBe(true);
    });

    it('detects corrupted cached artifact, removes it, and throws CorruptArtifactError', async () => {
      const validJson = JSON.stringify({ 'GEN 1:1': 'Good data' });
      const validHash = await sha256Hex(validJson);
      const manifestWithHash = {
        ...mockManifest,
        corpus: { verses: 'verses.json', count: 1, sha256: validHash },
      };

      opfs.files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifestWithHash)));
      opfs.files.set('verses-v3.json.gz', new TextEncoder().encode('corrupted content'));

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('manifest.json')) {
          return new Response(JSON.stringify(manifestWithHash));
        }
        return new Response('{}');
      }));

      const store = createArtifactStore();
      await expect(store.verses()).rejects.toThrow(CorruptArtifactError);
      expect(opfs.files.has('verses-v3.json.gz')).toBe(false);
    });

    it('clears all artifacts from storage on clear()', async () => {
      const storage = new OpfsStorage();
      await storage.write('manifest.json', 'm');
      await storage.write('verses-v3.json.gz', 'v');
      await storage.write('chunks-123.json.gz', 'c');
      await storage.write('embeddings-123.i8.bin', 'e');
      await storage.write('models/model.onnx', 'keep-model');

      const store = createArtifactStore(storage);
      await store.clear();

      expect(await storage.read('manifest.json')).toBeNull();
      expect(await storage.read('verses-v3.json.gz')).toBeNull();
      expect(await storage.read('chunks-123.json.gz')).toBeNull();
      expect(await storage.read('embeddings-123.i8.bin')).toBeNull();
      // Models are preserved during artifact clearing
      expect(await storage.read('models/model.onnx')).not.toBeNull();
    });
  });
});
