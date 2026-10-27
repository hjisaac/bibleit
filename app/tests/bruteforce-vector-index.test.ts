import { describe, it, expect } from 'vitest';
import { BruteForceVectorIndex } from '../src/adapters/bruteforce-vector-index';
import type { Chunk, Manifest } from '../src/core/types';

const mockManifest: Manifest = {
  schema_version: 3,
  translation: { id: 'WEB', lang: 'en', name: 'World English Bible', license: 'Public Domain' },
  corpus: { verses: 'verses.json.gz', count: 2 },
  chunks: { file: 'chunks.json.gz', hash: 'h1', strategy: 'token_window' },
  embeddings: {
    file: 'embeddings.f32.bin',
    model: 'nomic-ai/nomic-embed-text-v1.5',
    dim: 3,
    quantization: { type: 'float32' },
    query_prefix: 'search_query: ',
    count: 2,
  },
};

const chunks: Chunk[] = [
  { book: 'JHN', start: [3, 16], end: [3, 16], text: 'For God so loved the world...' },
  { book: 'GEN', start: [1, 1], end: [1, 1], text: 'In the beginning...' },
];

describe('BruteForceVectorIndex', () => {
  it('ranks passages by float32 cosine similarity descending even on unnormalized vectors', async () => {
    const index = new BruteForceVectorIndex();
    const matrix = new Float32Array([
      10, 0, 0,
      0, 20, 0,
    ]);
    await index.build(mockManifest, chunks, matrix.buffer);

    const hits = index.search(new Float32Array([3, 4, 0]), 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.chunk.book).toBe('GEN');
    expect(hits[0]!.score).toBeCloseTo(0.8);
    expect(hits[0]!.source).toBe('semantic');
    expect(hits[1]!.chunk.book).toBe('JHN');
    expect(hits[1]!.score).toBeCloseTo(0.6);
  });

  it('ranks passages by int8 asymmetric cosine similarity with scales', async () => {
    const int8Manifest: Manifest = {
      ...mockManifest,
      embeddings: {
        ...mockManifest.embeddings,
        file: 'embeddings.i8.bin',
        quantization: { type: 'int8', scales: 'scales.f32.bin' },
      },
    };
    const index = new BruteForceVectorIndex();
    // 2 chunks, 3 dimensions
    // chunk 0: [100, 0, 0] with scale 0.01 -> dequantized [1, 0, 0]
    // chunk 1: [0, 100, 0] with scale 0.01 -> dequantized [0, 1, 0]
    const int8Data = new Int8Array([
      100, 0, 0,
      0, 100, 0,
    ]);
    const scales = new Float32Array([0.01, 0.01]);
    await index.build(int8Manifest, chunks, int8Data.buffer, scales.buffer);

    const hits = index.search(new Float32Array([3, 4, 0]), 2);
    expect(hits).toHaveLength(2);
    // query is [3/5, 4/5, 0] normalized = [0.6, 0.8, 0]
    // chunk 1 [0, 1, 0] dot [0.6, 0.8, 0] = 0.8 -> GEN ranks first
    expect(hits[0]!.chunk.book).toBe('GEN');
    expect(hits[0]!.score).toBeCloseTo(0.8);
    expect(hits[1]!.chunk.book).toBe('JHN');
    expect(hits[1]!.score).toBeCloseTo(0.6);
  });

  it('throws on buffer length mismatch', async () => {
    const index = new BruteForceVectorIndex();
    const badMatrix = new Float32Array([1, 0, 0]);
    await expect(index.build(mockManifest, chunks, badMatrix.buffer)).rejects.toThrow(
      /shape mismatch/,
    );
  });
});
