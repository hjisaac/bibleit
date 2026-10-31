import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { FsArtifactStore } from '../../api/src/adapters/fs-artifact-store';

describe('FsArtifactStore', () => {
  const dataDir = path.resolve(__dirname, '../public/data');
  const store = new FsArtifactStore(dataDir);

  it('reads and parses manifest.json', async () => {
    const manifest = await store.manifest();
    expect(manifest.schema_version).toBe(3);
    expect(manifest.translation.id.toLowerCase()).toBe('web');
    expect(manifest.embeddings.quantization.type).toBe('int8');
  });

  it('reads and decompresses verses.json.gz', async () => {
    const verses = await store.verses();
    expect(typeof verses).toBe('object');
    expect(verses).toHaveProperty('GEN');
    expect(Array.isArray(verses['GEN'])).toBe(true);
  });

  it('reads and decompresses chunks.json.gz', async () => {
    const chunks = await store.chunks();
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty('id');
    expect(chunks[0]).toHaveProperty('book');
    expect(chunks[0]).toHaveProperty('start');
    expect(chunks[0]).toHaveProperty('end');
  });

  it('reads embeddings and scales binary buffers', async () => {
    const { data, scales } = await store.embeddings();
    expect(data.byteLength).toBeGreaterThan(0);
    expect(scales).toBeDefined();
    expect(scales!.byteLength).toBeGreaterThan(0);
  });
});
