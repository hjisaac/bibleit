import type { AnswerMetadata, AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';

/**
 * WorkerSlmAnswerProvider: Runs on-device SLM inference in an isolated Web Worker.
 * Protects Interaction to Next Paint (INP) by offloading neural generation.
 */
export class WorkerSlmAnswerProvider implements AnswerProvider {
  readonly modelId = 'HuggingFaceTB/SmolLM2-360M-Instruct';

  private worker: Worker | null = null;
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

  get available(): boolean {
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
