import type { QueryEmbedder } from '../core/ports';

export class WorkerQueryEmbedder implements QueryEmbedder {
  readonly modelId = 'nomic-ai/nomic-embed-text-v1.5';
  readonly dim = 768;

  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (err: Error) => void }>();
  private progressListeners = new Set<(fraction: number) => void>();

  onProgress(cb: (fraction: number) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers not supported in this runtime');
      }
      this.worker = new Worker(new URL('../workers/embedder.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e) => this.handleMessage(e.data);
      this.worker.onerror = (e) => console.error('Embedder worker error:', e);
    }
    return this.worker;
  }

  private loadReject: ((err: Error) => void) | null = null;

  async load(onProgress?: (fraction: number) => void): Promise<void> {
    if (onProgress) this.progressListeners.add(onProgress);
    if (this.loadPromise) return this.loadPromise;

    const worker = this.getWorker();
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.loadReject = reject;
      const handler = (e: MessageEvent) => {
        if (!e.data) return;
        if (e.data.type === 'loaded') {
          worker.removeEventListener('message', handler);
          this.loadReject = null;
          resolve();
        } else if (e.data.type === 'load_error') {
          worker.removeEventListener('message', handler);
          this.loadPromise = null;
          this.loadReject = null;
          reject(new Error(e.data.error));
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'load' });
    });

    return this.loadPromise;
  }

  cancelLoad(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const reject = this.loadReject;
    this.loadPromise = null;
    this.loadReject = null;
    if (reject) {
      reject(new DOMException('The user aborted a request.', 'AbortError'));
    }
  }

  async embed(query: string): Promise<Float32Array> {
    await this.load();
    const worker = this.getWorker();
    const id = this.nextId++;

    return new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'embed', id, text: `search_query: ${query}` });
    });
  }

  private handleMessage(data: any): void {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'progress' && typeof data.progress === 'number') {
      this.progressListeners.forEach((cb) => cb(data.progress));
    } else if (data.type === 'embed_result' && typeof data.id === 'number') {
      const req = this.pending.get(data.id);
      if (req) {
        this.pending.delete(data.id);
        req.resolve(data.vector);
      }
    } else if (data.type === 'embed_error' && typeof data.id === 'number') {
      const req = this.pending.get(data.id);
      if (req) {
        this.pending.delete(data.id);
        req.reject(new Error(data.error));
      }
    }
  }
}

export async function isQueryModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes('model_quantized.onnx'));
  } catch {
    return false;
  }
}

export async function clearQueryModelCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete('transformers-cache');
  } catch {
    // Ignore cache deletion errors
  }
}

