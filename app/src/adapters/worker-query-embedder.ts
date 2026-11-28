import type { QueryEmbedder } from '../core/ports';

export interface QueryEmbedderConfig {
  readonly modelId: string;
  readonly dim: number;
  readonly queryPrefix?: string;
}

const TRANSFORMERS_CACHE_NAME = 'transformers-cache';

export class WorkerQueryEmbedder implements QueryEmbedder {
  readonly modelId: string;
  readonly dim: number;
  private readonly queryPrefix: string;

  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadReject: ((err: Error) => void) | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (err: Error) => void }>();
  private progressListeners = new Set<(fraction: number) => void>();

  constructor(config: QueryEmbedderConfig) {
    this.modelId = config.modelId;
    this.dim = config.dim;
    this.queryPrefix = config.queryPrefix ?? '';
  }

  onProgress(cb: (fraction: number) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Web Workers not supported in this runtime');
      }
      this.worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e) => this.handleMessage(e.data);
      this.worker.onerror = (e) => {
        console.error('Embedder worker error:', e);
        const err = new Error(e.message || 'Worker execution error');
        if (this.loadReject) {
          this.loadReject(err);
          this.loadPromise = null;
          this.loadReject = null;
        }
        for (const req of this.pending.values()) {
          req.reject(err);
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }

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
      worker.postMessage({ type: 'load', modelId: this.modelId });
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

  async clear(): Promise<void> {
    this.cancelLoad();
    this.progressListeners.clear();
    await clearQueryModelCache(this.modelId);
  }

  async hasModel(): Promise<boolean> {
    return isQueryModelCached(this.modelId);
  }

  async embed(query: string): Promise<Float32Array> {
    if (!(await this.hasModel())) {
      throw new Error(
        'Neural query model is not installed. Download it in Settings before running on-device vector search.',
      );
    }
    await this.load();
    const worker = this.getWorker();
    const id = this.nextId++;

    return new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({
        type: 'embed',
        id,
        modelId: this.modelId,
        text: `${this.queryPrefix}${query}`,
      });
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

export async function isQueryModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const hasCache = await caches.has(TRANSFORMERS_CACHE_NAME);
    if (!hasCache) return false;
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url.includes(`/${modelId}/`) && req.url.endsWith('.onnx')) {
        const res = await cache.match(req);
        if (res && res.ok) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function clearQueryModelCache(modelId?: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    if (!modelId) {
      await caches.delete(TRANSFORMERS_CACHE_NAME);
      return;
    }
    const hasCache = await caches.has(TRANSFORMERS_CACHE_NAME);
    if (!hasCache) return;
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url.includes(`/${modelId}/`)) {
        await cache.delete(req);
      }
    }
  } catch {
    // Ignore cache deletion errors
  }
}

