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

async function getExtractor() {
  if (!extractorPromise) {
    lastReportedProgress = 0;
    extractorPromise = pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
      dtype: 'q8',
      progress_callback: (item: any) => {
        if (item.status === 'progress') {
          const isModel = Boolean(item.file && item.file.includes('.onnx'));
          const fileFrac =
            typeof item.progress === 'number'
              ? Math.min(Math.max(item.progress / 100, 0), 1)
              : item.total > 0
              ? Math.min(Math.max(item.loaded / item.total, 0), 1)
              : 0;
          // Tokenizer/config files represent ~3% of package; ONNX model weights represent ~97%.
          const totalFrac = isModel ? 0.03 + fileFrac * 0.96 : fileFrac * 0.03;
          if (totalFrac > lastReportedProgress) {
            lastReportedProgress = totalFrac;
            self.postMessage({ type: 'progress', progress: totalFrac });
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
      self.postMessage({ type: 'progress', progress: 1.0 });
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      extractorPromise = null;
      lastReportedProgress = 0;
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
