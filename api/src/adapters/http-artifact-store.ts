import { gunzipSync } from 'node:zlib';
import type { ArtifactStore, Manifest, RawChunk, VerseCorpusData } from '@bibleit/engine';

export class HttpArtifactStore implements ArtifactStore {
  private baseUrl: string;
  private cachedManifest: Manifest | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async manifest(): Promise<Manifest> {
    if (this.cachedManifest) return this.cachedManifest;
    const res = await fetch(`${this.baseUrl}/manifest.json`);
    if (!res.ok) throw new Error(`[HttpArtifactStore] Failed to fetch manifest: ${res.status}`);
    this.cachedManifest = (await res.json()) as Manifest;
    return this.cachedManifest;
  }

  async verses(): Promise<VerseCorpusData> {
    const m = await this.manifest();
    const res = await fetch(`${this.baseUrl}/${m.corpus.verses}`);
    if (!res.ok) throw new Error(`[HttpArtifactStore] Failed to fetch verses: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const decompressed = m.corpus.verses.endsWith('.gz') ? gunzipSync(buf) : buf;
    return JSON.parse(decompressed.toString('utf-8')) as VerseCorpusData;
  }

  async chunks(): Promise<RawChunk[]> {
    const m = await this.manifest();
    const res = await fetch(`${this.baseUrl}/${m.chunks.file}`);
    if (!res.ok) throw new Error(`[HttpArtifactStore] Failed to fetch chunks: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const decompressed = m.chunks.file.endsWith('.gz') ? gunzipSync(buf) : buf;
    return JSON.parse(decompressed.toString('utf-8')) as RawChunk[];
  }

  async embeddings(): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
    const m = await this.manifest();
    const res = await fetch(`${this.baseUrl}/${m.embeddings.file}`);
    if (!res.ok) throw new Error(`[HttpArtifactStore] Failed to fetch embeddings: ${res.status}`);
    const data = await res.arrayBuffer();

    let scales: ArrayBuffer | undefined = undefined;
    if (m.embeddings.quantization.type === 'int8') {
      const scalesRes = await fetch(`${this.baseUrl}/${m.embeddings.quantization.scales}`);
      if (!scalesRes.ok) throw new Error(`[HttpArtifactStore] Failed to fetch scales: ${scalesRes.status}`);
      scales = await scalesRes.arrayBuffer();
    }
    return { data, scales };
  }

  async clear(): Promise<void> {
    this.cachedManifest = null;
  }
}
