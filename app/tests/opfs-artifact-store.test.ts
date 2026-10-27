import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CorruptArtifactError, OpfsArtifactStore } from '../src/adapters/opfs-artifact-store';
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

  const root = {
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!options?.create) throw new Error(`File not found: ${name}`);
        files.set(name, new Uint8Array(0));
      }
      return {
        async getFile() {
          const data = files.get(name)!;
          return {
            async arrayBuffer() {
              return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            },
          };
        },
        async createWritable() {
          let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
          return {
            async write(chunk: Uint8Array<ArrayBuffer>) {
              pending = new Uint8Array(chunk);
            },
            async close() {
              files.set(name, pending);
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      files.delete(name);
    },
    async *keys() {
      for (const k of files.keys()) yield k;
    },
  } as unknown as FileSystemDirectoryHandle;

  return { files, root };
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('OpfsArtifactStore', () => {
  let opfs: ReturnType<typeof createMockOpfs>;

  beforeEach(() => {
    opfs = createMockOpfs();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn(async () => opfs.root) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads manifest, verses, chunks, and float32 embeddings into OPFS and serves subsequent reads from OPFS', async () => {
    const embFloats = new Float32Array([0.6, 0.8]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) {
        return new Response(JSON.stringify(mockManifest), { status: 200 });
      }
      if (url.endsWith('verses.json.gz')) {
        return new Response(JSON.stringify({ JHN: [[], [], ['For God so loved...']] }), {
          status: 200,
        });
      }
      if (url.endsWith('chunks.json.gz')) {
        return new Response(
          JSON.stringify([{ book: 'JHN', start: [3, 1], end: [3, 1] }]),
          { status: 200 },
        );
      }
      if (url.endsWith('embeddings.f32.bin')) {
        return new Response(embFloats.buffer, { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = new OpfsArtifactStore();
    const m = await store.manifest();
    expect(m.chunks.hash).toBe('cbd6645a3d9a');
    expect(opfs.files.has('manifest.json')).toBe(true);

    const verses = await store.verses();
    expect(verses.JHN?.[2]?.[0]).toBe('For God so loved...');
    expect(opfs.files.has('verses-v3.json.gz')).toBe(true);
    expect(opfs.files.get('verses-v3.json.gz')?.[0]).toBe(0x1f);
    expect(opfs.files.get('verses-v3.json.gz')?.[1]).toBe(0x8b);

    const chunks = await store.chunks();
    expect(chunks).toHaveLength(1);
    expect(opfs.files.has('chunks-cbd6645a3d9a.json.gz')).toBe(true);
    expect(opfs.files.get('chunks-cbd6645a3d9a.json.gz')?.[0]).toBe(0x1f);
    expect(opfs.files.get('chunks-cbd6645a3d9a.json.gz')?.[1]).toBe(0x8b);

    const emb = await store.embeddings();
    expect(new Float32Array(emb.data)).toEqual(embFloats);
    expect(emb.scales).toBeUndefined();
    expect(opfs.files.has('embeddings-cbd6645a3d9a.f32.bin')).toBe(true);

    // Second call reads from OPFS without hitting fetch again.
    const callsBefore = fetchMock.mock.calls.length;
    const cachedVerses = await store.verses();
    expect(cachedVerses.JHN?.[2]?.[0]).toBe('For God so loved...');
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('uses network-first manifest and falls back to cached OPFS manifest when offline', async () => {
    let isOnline = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!isOnline) throw new Error('Network offline');
        return new Response(JSON.stringify(mockManifest), { status: 200 });
      }),
    );

    const onlineStore = new OpfsArtifactStore();
    await onlineStore.manifest();
    expect(opfs.files.has('manifest.json')).toBe(true);

    // Simulate going offline in a new store instance.
    isOnline = false;
    const offlineStore = new OpfsArtifactStore();
    const fallbackManifest = await offlineStore.manifest();
    expect(fallbackManifest.chunks.hash).toBe('cbd6645a3d9a');
  });

  it('rejects unsupported manifest schema_version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...mockManifest, schema_version: 99 }))),
    );
    const store = new OpfsArtifactStore();
    await expect(store.manifest()).rejects.toThrow(/Unsupported manifest schema_version: 99/);
  });

  it('rejects download when SHA-256 checksum does not match and never writes corrupt bytes to OPFS', async () => {
    const corruptManifest: Manifest = {
      ...mockManifest,
      corpus: { verses: 'verses.json.gz', count: 1, sha256: 'deadbeef'.repeat(8) },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) {
          return new Response(JSON.stringify(corruptManifest), { status: 200 });
        }
        if (url.endsWith('verses.json.gz')) {
          return new Response(JSON.stringify({ JHN: [[], [], ['Valid text']] }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
    const store = new OpfsArtifactStore();
    await expect(store.verses()).rejects.toThrow(/Integrity check failed: expected/);
    expect(opfs.files.has('verses-v3.json.gz')).toBe(false);
  });

  it('quarantines corrupted OPFS files on read and throws CorruptArtifactError without silent re-download', async () => {
    const validPayload = JSON.stringify({ JHN: [[], [], ['For God so loved...']] });
    const validSha = await sha256Hex(validPayload);
    const manifestWithSha: Manifest = {
      ...mockManifest,
      corpus: { verses: 'verses.json.gz', count: 1, sha256: validSha },
    };

    // Seed OPFS with a corrupted verses file.
    opfs.files.set(
      'verses-v3.json.gz',
      new Uint8Array(new TextEncoder().encode('corrupted-on-disk')),
    );

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) {
        return new Response(JSON.stringify(manifestWithSha), { status: 200 });
      }
      throw new Error('Should not silently re-download verses over network');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = new OpfsArtifactStore();
    await expect(store.verses()).rejects.toThrow(CorruptArtifactError);

    // Corrupted file was purged from OPFS, and verses.json.gz was never fetched.
    expect(opfs.files.has('verses-v3.json.gz')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports progress when downloading with onProgress callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) {
          return new Response(JSON.stringify(mockManifest), { status: 200 });
        }
        if (url.endsWith('verses.json.gz')) {
          return new Response(JSON.stringify({ JHN: [[], [], ['Progress verse']] }), {
            status: 200,
            headers: { 'content-length': '50' },
          });
        }
        return new Response(null, { status: 404 });
      }),
    );
    const store = new OpfsArtifactStore();
    const progressCalls: number[] = [];
    await store.verses((pct) => progressCalls.push(pct));
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
  });

  it('handles raw .gz responses from network by verifying uncompressed SHA-256 and caching', async () => {
    const rawJson = JSON.stringify({ GEN: [[], ['In the beginning...']] });
    const uncompressedBytes = new TextEncoder().encode(rawJson);
    const hash = await sha256Hex(rawJson);
    const stream = new Response(uncompressedBytes).body!.pipeThrough(new CompressionStream('gzip'));
    const compressedGzip = new Uint8Array(await new Response(stream).arrayBuffer());

    const manifest: Manifest = {
      ...mockManifest,
      corpus: { verses: 'verses.json.gz', count: 1, sha256: hash },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
        if (url.endsWith('verses.json.gz')) return new Response(compressedGzip, { status: 200 });
        return new Response(null, { status: 404 });
      }),
    );

    const store = new OpfsArtifactStore();
    const verses = await store.verses();
    expect(verses.GEN?.[1]?.[0]).toBe('In the beginning...');
    expect(opfs.files.get('verses-v3.json.gz')).toEqual(compressedGzip);
  });
});
