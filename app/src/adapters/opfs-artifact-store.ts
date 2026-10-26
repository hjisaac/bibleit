import type { ArtifactStore } from '../core/ports';
import type { Manifest, RawChunk, VerseCorpusData } from '../core/types';
import { clearBookCache } from './book-store';

const SUPPORTED_SCHEMA_VERSION = 3;
const FALLBACK_CACHE = 'bibleit-artifacts-v1';

function getDataUrl(file: string): string {
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}data/${file}`;
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

async function readOpfsFile(root: FileSystemDirectoryHandle, filename: string): Promise<Uint8Array | null> {
  try {
    const handle = await root.getFileHandle(filename);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeOpfsFile(root: FileSystemDirectoryHandle, filename: string, data: Uint8Array): Promise<void> {
  const handle = await root.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data.buffer as ArrayBuffer);
  await writable.close();
}

async function decompressGzip(bytes: Uint8Array): Promise<string> {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

export class OpfsArtifactStore implements ArtifactStore {
  private manifestPromise: Promise<Manifest> | null = null;

  manifest(): Promise<Manifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = (async () => {
        const root = await getOpfsRoot();
        if (root) {
          const cached = await readOpfsFile(root, 'manifest.json');
          if (cached) {
            const m = JSON.parse(new TextDecoder().decode(cached)) as Manifest;
            if (m.schema_version === SUPPORTED_SCHEMA_VERSION) return m;
          }
        }

        const res = await fetch(getDataUrl('manifest.json'));
        if (!res.ok) throw new Error(`Failed to fetch manifest: HTTP ${res.status}`);
        const m = (await res.json()) as Manifest;
        if (m.schema_version !== SUPPORTED_SCHEMA_VERSION) {
          throw new Error(
            `Unsupported manifest schema_version: ${m.schema_version} (expected ${SUPPORTED_SCHEMA_VERSION}).`,
          );
        }

        if (root) {
          await writeOpfsFile(root, 'manifest.json', new TextEncoder().encode(JSON.stringify(m)));
        }
        return m;
      })();
    }
    return this.manifestPromise;
  }

  async verses(): Promise<VerseCorpusData> {
    const m = await this.manifest();
    const filename = `verses-v${m.schema_version}.json.gz`;
    const root = await getOpfsRoot();

    let bytes: Uint8Array | null = root ? await readOpfsFile(root, filename) : null;
    if (!bytes) {
      const res = await fetch(getDataUrl(m.corpus.verses));
      if (!res.ok) throw new Error(`Failed to fetch verses: HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      if (root) {
        await writeOpfsFile(root, filename, bytes);
        // Clear redundant temporary single-book cache now that full archive is in OPFS.
        void clearBookCache();
      }
    }

    const text = await decompressGzip(bytes);
    return JSON.parse(text) as VerseCorpusData;
  }

  async chunks(): Promise<RawChunk[]> {
    const m = await this.manifest();
    const filename = `chunks-${m.chunks.hash}.json.gz`;
    const root = await getOpfsRoot();

    let bytes: Uint8Array | null = root ? await readOpfsFile(root, filename) : null;
    if (!bytes) {
      const res = await fetch(getDataUrl(m.chunks.file));
      if (!res.ok) throw new Error(`Failed to fetch chunks: HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      if (root) {
        await writeOpfsFile(root, filename, bytes);
      }
    }

    const text = await decompressGzip(bytes);
    return JSON.parse(text) as RawChunk[];
  }

  async embeddings(): Promise<{ data: ArrayBuffer; scales?: ArrayBuffer }> {
    const m = await this.manifest();
    const filename = `embeddings-${m.chunks.hash}.f32.bin`;
    const root = await getOpfsRoot();

    let bytes: Uint8Array | null = root ? await readOpfsFile(root, filename) : null;
    if (!bytes) {
      const res = await fetch(getDataUrl(m.embeddings.file));
      if (!res.ok) throw new Error(`Failed to fetch embeddings: HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      if (root) {
        await writeOpfsFile(root, filename, bytes);
      }
    }

    if (m.embeddings.quantization.type === 'int8') {
      const scaleFilename = `scales-${m.chunks.hash}.f32.bin`;
      let scaleBytes: Uint8Array | null = root ? await readOpfsFile(root, scaleFilename) : null;
      if (!scaleBytes) {
        const sRes = await fetch(getDataUrl(m.embeddings.quantization.scales));
        if (!sRes.ok) throw new Error(`Failed to fetch scales: HTTP ${sRes.status}`);
        scaleBytes = new Uint8Array(await sRes.arrayBuffer());
        if (root) {
          await writeOpfsFile(root, scaleFilename, scaleBytes);
        }
      }
      return { data: bytes.buffer as ArrayBuffer, scales: scaleBytes.buffer as ArrayBuffer };
    }

    return { data: bytes.buffer as ArrayBuffer };
  }

  async clear(): Promise<void> {
    this.manifestPromise = null;
    const root = await getOpfsRoot();
    if (root) {
      // Remove OPFS files
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys?.() ?? []) {
        try {
          await root.removeEntry(name);
        } catch {
          // Ignore removal error
        }
      }
    }
    if (typeof caches !== 'undefined') {
      await caches.delete(FALLBACK_CACHE);
    }
  }
}
