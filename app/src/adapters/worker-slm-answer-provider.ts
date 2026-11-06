import type { AnswerMetadata, AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';

/**
 * WorkerSlmAnswerProvider: Runs on-device SLM inference in an isolated Web Worker.
 * Protects Interaction to Next Paint (INP) by offloading neural generation.
 */
export class WorkerSlmAnswerProvider implements AnswerProvider {
  readonly modelId = 'HuggingFaceTB/SmolLM2-360M-Instruct';

  private worker: Worker | null = null;
  private loadPromise: Promise<void> | null = null;
  private loadReject: ((err: Error) => void) | null = null;
  private nextId = 1;
  private progressListeners = new Set<(fraction: number) => void>();
  private activeStreams = new Map<
    number,
    {
      onToken: (token: string) => void;
      onDone: () => void;
      onError: (err: Error) => void;
    }
  >();

  constructor(private isInstalled?: () => boolean) {}

  get available(): boolean {
    if (this.isInstalled && !this.isInstalled()) {
      return false;
    }
    return typeof Worker !== 'undefined';
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
      this.worker = new Worker(new URL('../workers/slm.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e) => this.handleMessage(e.data);
      this.worker.onerror = (e) => console.error('SLM worker error:', e);
    }
    return this.worker;
  }

  private handleMessage(data: any): void {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'progress') {
      for (const listener of this.progressListeners) {
        listener(data.progress);
      }
    } else if (data.type === 'token') {
      const stream = this.activeStreams.get(data.id);
      stream?.onToken(data.token);
    } else if (data.type === 'done') {
      const stream = this.activeStreams.get(data.id);
      if (stream) {
        this.activeStreams.delete(data.id);
        stream.onDone();
      }
    } else if (data.type === 'error') {
      const stream = this.activeStreams.get(data.id);
      if (stream) {
        this.activeStreams.delete(data.id);
        stream.onError(new Error(data.error));
      }
    }
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

  async clear(): Promise<void> {
    this.cancelLoad();
    await clearSlmModelCache();
  }

  async hasModel(): Promise<boolean> {
    return isSlmModelCached();
  }

  async *answer(
    query: string,
    context: RetrievalResult,
    onMeta?: (meta: AnswerMetadata) => void,
  ): AsyncIterable<string> {
    if (!this.available || context.passages.length === 0) return;

    if (onMeta) {
      onMeta({ provider: 'local', model: 'SmolLM2-360M' });
    }

    const worker = this.getWorker();
    const id = this.nextId++;

    const tokenQueue: string[] = [];
    let isDone = false;
    let streamError: Error | null = null;
    let resolveSignal: (() => void) | null = null;

    const notify = () => {
      if (resolveSignal) {
        resolveSignal();
        resolveSignal = null;
      }
    };

    this.activeStreams.set(id, {
      onToken: (token) => {
        tokenQueue.push(token);
        notify();
      },
      onDone: () => {
        isDone = true;
        notify();
      },
      onError: (err) => {
        streamError = err;
        isDone = true;
        notify();
      },
    });

    const passages = context.passages.slice(0, 5).map((p) => p.chunk);
    worker.postMessage({ type: 'generate', id, query, passages });

    try {
      while (true) {
        if (tokenQueue.length > 0) {
          yield tokenQueue.shift()!;
        } else if (isDone) {
          if (streamError) throw streamError;
          break;
        } else {
          await new Promise<void>((resolve) => {
            resolveSignal = resolve;
          });
        }
      }
    } finally {
      this.activeStreams.delete(id);
      worker.postMessage({ type: 'abort', id });
    }
  }
}

export async function isSlmModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes('onnx')) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        if (keys.some((k) => k.url.includes('SmolLM2-360M-Instruct'))) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function clearSlmModelCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes('onnx')) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          if (req.url.includes('SmolLM2-360M-Instruct')) {
            await cache.delete(req);
          }
        }
      }
    }
  } catch {
    // Ignore cache deletion errors
  }
}
