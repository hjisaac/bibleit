import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ArtifactStore, Manifest, RawChunk, VerseCorpusData } from '@bibleit/engine';
import { DEFAULT_ENCODING } from '../constants';

export class FsArtifactStore implements ArtifactStore {
  private baseDir: string;
  private cachedManifest: Manifest | null = null;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async manifest(): Promise<Manifest> {
    if (this.cachedManifest) return this.cachedManifest;
    const file = path.join(this.baseDir, 'manifest.json');
    const content = fs.readFileSync(file, DEFAULT_ENCODING);
    this.cachedManifest = JSON.parse(content) as Manifest;
    return this.cachedManifest;
  }

  async verses(): Promise<VerseCorpusData> {
    const m = await this.manifest();
    const buf = fs.readFileSync(path.join(this.baseDir, m.corpus.verses));
    const decompressed = m.corpus.verses.endsWith('.gz') ? gunzipSync(buf) : buf;
    return JSON.parse(decompressed.toString(DEFAULT_ENCODING)) as VerseCorpusData;
  }

  async chunks(): Promise<RawChunk[]> {
    const m = await this.manifest();
    const buf = fs.readFileSync(path.join(this.baseDir, m.chunks.file));
    const decompressed = m.chunks.file.endsWith('.gz') ? gunzipSync(buf) : buf;
    return JSON.parse(decompressed.toString(DEFAULT_ENCODING)) as RawChunk[];
  }

  async embeddings(): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
    const m = await this.manifest();
    const dataBuf = fs.readFileSync(path.join(this.baseDir, m.embeddings.file));
    const data = dataBuf.buffer.slice(dataBuf.byteOffset, dataBuf.byteOffset + dataBuf.byteLength);

    let scales: ArrayBuffer | undefined = undefined;
    if (m.embeddings.quantization.type === 'int8') {
      const scalesBuf = fs.readFileSync(path.join(this.baseDir, m.embeddings.quantization.scales));
      scales = scalesBuf.buffer.slice(scalesBuf.byteOffset, scalesBuf.byteOffset + scalesBuf.byteLength);
    }
    return { data, scales };
  }

  async clear(): Promise<void> {
    this.cachedManifest = null;
  }
}
