import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for browser execution
env.allowLocalModels = false;

const r2Base = import.meta.env.VITE_CLOUDFLARE_R2_URL.trim().replace(/\/+$/, '');
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${r2Base}/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${r2Base}/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

let extractorPromise: Promise<any> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
      dtype: 'q8',
      progress_callback: (item: { status: string; progress?: number }) => {
        if (item.status === 'progress' && typeof item.progress === 'number') {
          self.postMessage({ type: 'progress', progress: item.progress / 100 });
        }
      },
    });
  }
  return extractorPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'load') {
    try {
      await getExtractor();
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      self.postMessage({
        type: 'load_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (data.type === 'embed') {
    try {
      const extractor = await getExtractor();
      const output = await extractor(data.text, { pooling: 'mean', normalize: true });
      const vector = output.data as Float32Array;
      self.postMessage({ type: 'embed_result', id: data.id, vector });
    } catch (err) {
      self.postMessage({
        type: 'embed_error',
        id: data.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
