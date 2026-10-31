import { pipeline, env } from '@huggingface/transformers';
import { env as appEnv } from '../env';

// Configure transformers.js for browser execution
env.allowLocalModels = false;

const r2Base = appEnv.r2Url;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${r2Base}/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${r2Base}/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

let extractorPromise: Promise<any> | null = null;
let lastReportedProgress = 0;
const fileProgress: Record<string, { loaded: number; total: number }> = {};

async function getExtractor() {
  if (!extractorPromise) {
    lastReportedProgress = 0;
    extractorPromise = pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
      dtype: 'q8',
      progress_callback: (item: any) => {
        if (item.status === 'progress_total' && typeof item.progress === 'number') {
          const frac = item.progress / 100;
          if (frac >= lastReportedProgress) {
            lastReportedProgress = frac;
            self.postMessage({ type: 'progress', progress: frac });
          }
        } else if (item.status === 'progress' && typeof item.loaded === 'number' && typeof item.total === 'number') {
          fileProgress[item.file] = { loaded: item.loaded, total: item.total };
          const loaded = Object.values(fileProgress).reduce((acc, f) => acc + f.loaded, 0);
          const total = Object.values(fileProgress).reduce((acc, f) => acc + f.total, 0);
          if (total > 0) {
            const frac = loaded / total;
            if (frac >= lastReportedProgress) {
              lastReportedProgress = frac;
              self.postMessage({ type: 'progress', progress: frac });
            }
          }
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
