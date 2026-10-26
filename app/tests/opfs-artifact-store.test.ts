import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpfsArtifactStore } from '../src/adapters/opfs-artifact-store';
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

describe('OpfsArtifactStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads manifest, verses, chunks, and float32 embeddings into OPFS', async () => {
    const embFloats = new Float32Array([0.6, 0.8]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
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
      }),
    );

    const store = new OpfsArtifactStore();
    const m = await store.manifest();
    expect(m.chunks.hash).toBe('cbd6645a3d9a');

    const verses = await store.verses();
    expect(verses.JHN?.[2]?.[0]).toBe('For God so loved...');

    const chunks = await store.chunks();
    expect(chunks).toHaveLength(1);

    const emb = await store.embeddings();
    expect(new Float32Array(emb.data)).toEqual(embFloats);
    expect(emb.scales).toBeUndefined();
  });

  it('rejects unsupported manifest schema_version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...mockManifest, schema_version: 99 }))),
    );
    const store = new OpfsArtifactStore();
    await expect(store.manifest()).rejects.toThrow(/Unsupported manifest schema_version: 99/);
  });
});
