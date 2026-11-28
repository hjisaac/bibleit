import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WorkerQueryEmbedder,
  isQueryModelCached,
  clearQueryModelCache,
} from '../src/adapters/worker-query-embedder';
import { createEmbedder } from '../src/composition';
import manifest from '../public/data/manifest.json';

describe('WorkerQueryEmbedder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const baseConfig = {
    modelId: manifest.embeddings.model,
    dim: manifest.embeddings.dim,
    queryPrefix: manifest.embeddings.query_prefix,
  };

  it('wires from manifest.json as single source of truth via createEmbedder()', () => {
    const embedder = createEmbedder();
    expect(embedder.modelId).toBe(manifest.embeddings.model);
    expect(embedder.dim).toBe(manifest.embeddings.dim);
  });

  it('constructs with custom config via constructor injection', () => {
    const embedder = new WorkerQueryEmbedder({
      modelId: 'BAAI/bge-small-en-v1.5',
      dim: 384,
      queryPrefix: 'query: ',
    });
    expect(embedder.modelId).toBe('BAAI/bge-small-en-v1.5');
    expect(embedder.dim).toBe(384);
  });

  it('posts load message to worker with modelId and resolves on loaded', async () => {
    const postMessageSpy = vi.fn();
    class MockWorker {
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
      addEventListener(type: string, fn: any) {
        (this.listeners[type] ||= []).push(fn);
      }
      removeEventListener(type: string, fn: any) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
      }
      postMessage(msg: any) {
        postMessageSpy(msg);
        if (msg.type === 'load') {
          setTimeout(() => {
            (this.listeners['message'] || []).forEach((fn) =>
              fn({ data: { type: 'loaded' } } as MessageEvent),
            );
          }, 0);
        }
      }
      terminate() {}
    }

    vi.stubGlobal('Worker', MockWorker);
    const embedder = new WorkerQueryEmbedder({ modelId: 'custom/model', dim: 512 });
    await expect(embedder.load()).resolves.toBeUndefined();
    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'load', modelId: 'custom/model' });
  });

  it('rejects on load_error from worker', async () => {
    class FailingWorker {
      listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
      addEventListener(type: string, fn: any) {
        (this.listeners[type] ||= []).push(fn);
      }
      removeEventListener(type: string, fn: any) {
        this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
      }
      postMessage(msg: any) {
        if (msg.type === 'load') {
          setTimeout(() => {
            (this.listeners['message'] || []).forEach((fn) =>
              fn({ data: { type: 'load_error', error: 'Download failed' } } as MessageEvent),
            );
          }, 0);
        }
      }
      terminate() {}
    }

    vi.stubGlobal('Worker', FailingWorker);
    const embedder = new WorkerQueryEmbedder(baseConfig);
    await expect(embedder.load()).rejects.toThrow('Download failed');
  });

  it('rejects with AbortError when cancelLoad is invoked', async () => {
    const terminateSpy = vi.fn();
    class SlowWorker {
      addEventListener() {}
      removeEventListener() {}
      postMessage() {}
      terminate = terminateSpy;
    }

    vi.stubGlobal('Worker', SlowWorker);
    const embedder = new WorkerQueryEmbedder(baseConfig);
    const loadPromise = embedder.load();

    embedder.cancelLoad();

    await expect(loadPromise).rejects.toThrow('The user aborted a request.');
    expect(terminateSpy).toHaveBeenCalled();
  });

  it('throws when embed() is called before model is cached', async () => {
    vi.stubGlobal('caches', {
      has: vi.fn(async () => false),
    });
    const embedder = new WorkerQueryEmbedder(baseConfig);
    await expect(embedder.embed('grace')).rejects.toThrow(
      'Neural query model is not installed. Download it in Settings before running on-device vector search.',
    );
  });

  it('embeds query and passes queryPrefix and modelId to worker', async () => {
    vi.stubGlobal('caches', {
      has: vi.fn(async () => true),
      open: vi.fn(async () => ({
        keys: async () => [{ url: 'https://huggingface.co/custom/model/resolve/main/model.onnx' }],
        match: async () => ({ ok: true }),
      })),
    });

    const expectedVector = new Float32Array([0.1, 0.2, 0.3]);
    const postMessageSpy = vi.fn();

    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      addEventListener(type: string, fn: any) {
        if (type === 'message') {
          setTimeout(() => fn({ data: { type: 'loaded' } } as MessageEvent), 0);
        }
      }
      removeEventListener() {}
      postMessage(msg: any) {
        postMessageSpy(msg);
        if (msg.type === 'embed') {
          setTimeout(() => {
            this.onmessage?.({
              data: { type: 'embed_result', id: msg.id, vector: expectedVector },
            } as MessageEvent);
          }, 0);
        }
      }
      terminate() {}
    }

    vi.stubGlobal('Worker', MockWorker);
    const embedder = new WorkerQueryEmbedder({
      modelId: 'custom/model',
      dim: 3,
      queryPrefix: 'search_query: ',
    });

    const result = await embedder.embed('peace');
    expect(result).toBe(expectedVector);
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'embed',
        modelId: 'custom/model',
        text: 'search_query: peace',
      }),
    );
  });
});

describe('isQueryModelCached & clearQueryModelCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects model in transformers-cache matching exact /modelId/ boundary, .onnx, and res.ok', async () => {
    const mockCache = {
      keys: vi.fn(async () => [
        { url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/model_quantized.onnx' },
        { url: 'https://huggingface.co/other-model/resolve/main/model.onnx' },
      ]),
      match: vi.fn(async () => ({ ok: true })),
    };
    vi.stubGlobal('caches', {
      has: vi.fn(async (name) => name === 'transformers-cache'),
      open: vi.fn(async () => mockCache),
    });

    expect(await isQueryModelCached('nomic-ai/nomic-embed-text-v1.5')).toBe(true);
    // Substring prefix without full path segment must not match
    expect(await isQueryModelCached('nomic-ai/nomic-embed-text-v1')).toBe(false);
    expect(await isQueryModelCached('BAAI/bge-small-en-v1.5')).toBe(false);
  });

  it('returns false when cached response is not ok', async () => {
    const mockCache = {
      keys: vi.fn(async () => [
        { url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/model_quantized.onnx' },
      ]),
      match: vi.fn(async () => ({ ok: false })),
    };
    vi.stubGlobal('caches', {
      has: vi.fn(async () => true),
      open: vi.fn(async () => mockCache),
    });

    expect(await isQueryModelCached('nomic-ai/nomic-embed-text-v1.5')).toBe(false);
  });

  it('returns false when transformers-cache does not exist', async () => {
    vi.stubGlobal('caches', {
      has: vi.fn(async () => false),
    });
    expect(await isQueryModelCached('any-model')).toBe(false);
  });

  it('clears specific model entries from transformers-cache', async () => {
    const deleteSpy = vi.fn();
    const mockReq1 = { url: 'https://huggingface.co/target/model/resolve/main/model.onnx' };
    const mockReq2 = { url: 'https://huggingface.co/keep/model/resolve/main/model.onnx' };

    const mockCache = {
      keys: vi.fn(async () => [mockReq1, mockReq2]),
      delete: deleteSpy,
    };
    vi.stubGlobal('caches', {
      has: vi.fn(async () => true),
      open: vi.fn(async () => mockCache),
    });

    await clearQueryModelCache('target/model');
    expect(deleteSpy).toHaveBeenCalledWith(mockReq1);
    expect(deleteSpy).not.toHaveBeenCalledWith(mockReq2);
  });

  it('deletes entire transformers-cache when modelId is omitted', async () => {
    const deleteCacheSpy = vi.fn();
    vi.stubGlobal('caches', {
      delete: deleteCacheSpy,
    });

    await clearQueryModelCache();
    expect(deleteCacheSpy).toHaveBeenCalledWith('transformers-cache');
  });
});
