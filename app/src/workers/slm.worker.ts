import { pipeline, env, TextStreamer, DynamicCache, type Tensor } from '@huggingface/transformers';
import { env as appEnv } from '../env';
import { OpfsStorage, createCacheProxy } from '../adapters/opfs-storage';

env.allowLocalModels = false;

const storage = new OpfsStorage();
const modelCache = createCacheProxy(storage, 'models');
env.useCustomCache = true;
env.customCache = modelCache as any;

const r2Base = appEnv.r2Url;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = appEnv.numThreads;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${r2Base}/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${r2Base}/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

const SYSTEM_PROMPT = `You are Bibleit, a focused scripture assistant.
Provide a direct, factual biblical summary using ONLY and ONLY the provided Bible passages.

Rules:
- Zero preamble: NEVER include conversational openings or meta-announcements such as "Based on the provided passages", "Here is what the Bible says/teaches", or "According to the verses". Start directly with the core message.
- Plain text only: Do NOT use markdown syntax (no asterisks, bold, italics, bullet points, headers, or blockquotes).
- Strict grounding: State ONLY what is explicitly in the passages. DO NOT INVENT THEOLOGY OR VERSES.
- Citations: Cite specific references in brackets, e.g. [MAT 22:39] or [ROM 13:8-10]. Use a regular hyphen in verse ranges.
- Length: Keep the summary cohesive, concise, and focused (1 to 2 paragraphs, under 150 words).`;

const SYSTEM_PREFIX = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n`;

function buildChatPrompt(query: string, passages: (string | { text?: string })[]): string {
  const context = (passages || [])
    .slice(0, 5)
    .map((c) => (typeof c === 'string' ? c : c.text ?? ''))
    .join('\n\n');

  return `${SYSTEM_PREFIX}Passages:\n${context}\n\nTopic / Question: ${query}\nDirect answer (plain text, no preamble):<|im_end|>\n<|im_start|>assistant\n`;
}

let systemPromptCacheEntries: Record<string, Tensor> | null = null;
let systemPromptCachePromise: Promise<void> | null = null;

async function warmSystemPromptCache(generator: any): Promise<void> {
  if (systemPromptCacheEntries) return;
  if (!systemPromptCachePromise) {
    systemPromptCachePromise = (async () => {
      try {
        const sysInputs = generator.tokenizer(SYSTEM_PREFIX, { add_special_tokens: false });
        const sysOutputs = await generator.model(sysInputs);
        const entries: Record<string, Tensor> = {};
        for (let i = 0; i < 32; i++) {
          const k = sysOutputs[`present.${i}.key`];
          const v = sysOutputs[`present.${i}.value`];
          if (k && v) {
            entries[`past_key_values.${i}.key`] = k;
            entries[`past_key_values.${i}.value`] = v;
          }
        }
        if (Object.keys(entries).length > 0) {
          systemPromptCacheEntries = entries;
        }
      } catch {
        systemPromptCacheEntries = null;
      }
    })();
  }
  await systemPromptCachePromise;
}

function getClonedSystemPromptCache(): DynamicCache | null {
  if (!systemPromptCacheEntries) return null;
  try {
    const cloned: Record<string, Tensor> = {};
    for (const key in systemPromptCacheEntries) {
      cloned[key] = (systemPromptCacheEntries[key] as any).clone();
    }
    return new DynamicCache(cloned);
  } catch {
    return null;
  }
}


const MODEL_REPO = 'HuggingFaceTB/SmolLM2-360M-Instruct';
const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_q4.onnx',
];

async function downloadModelFiles(onProgress: (fraction: number) => void): Promise<void> {
  const base = `https://huggingface.co/${MODEL_REPO}/resolve/main`;
  const TOTAL_ESTIMATED_BYTES = 372 * 1024 * 1024;
  let totalLoaded = 0;

  for (const file of MODEL_FILES) {
    const url = `${base}/${file}`;
    const cached = await modelCache.match(url);
    if (cached) {
      const cl = cached.headers.get('content-length');
      // Size fallbacks: ~370MB for Q4 ONNX weights, ~1KB for JSON configs when Content-Length header is missing.
      const size = cl ? parseInt(cl, 10) : (file.endsWith('.onnx') ? 370 * 1024 * 1024 : 1024);
      // Loose threshold (>300MB) guards against 0-byte or incomplete ONNX downloads in cache.
      if (!file.endsWith('.onnx') || size > 300_000_000) {
        totalLoaded += size;
        onProgress(Math.min(totalLoaded / TOTAL_ESTIMATED_BYTES, 0.99));
        continue;
      }
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${file}: HTTP ${res.status}`);

    let fileLoaded = 0;
    await modelCache.put(url, res, (item: { loaded: number }) => {
      const delta = item.loaded - fileLoaded;
      fileLoaded = item.loaded;
      totalLoaded += delta;
      onProgress(Math.min(totalLoaded / TOTAL_ESTIMATED_BYTES, 0.99));
    });
  }

  onProgress(1.0);
}

let generatorPromise: Promise<any> | null = null;
let lastReportedProgress = 0;

function createPipeline(device: 'webgpu' | 'wasm') {
  // dtype: 'q4' automatically resolves to onnx/model_q4.onnx matching OPFS cache keys.
  return pipeline('text-generation', MODEL_REPO, {
    dtype: 'q4',
    device,
  });
}

async function initGenerator() {
  lastReportedProgress = 0;
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        return await createPipeline('webgpu');
      }
    } catch {
      // fall through to WASM
    }
  }
  return await createPipeline('wasm');
}

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      try {
        return await initGenerator();
      } catch (err) {
        generatorPromise = null;
        lastReportedProgress = 0;
        throw err;
      }
    })();
  }
  return generatorPromise;
}

const activeGenerations = new Set<number>();

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'load') {
    try {
      await downloadModelFiles((frac) => {
        if (frac > lastReportedProgress) {
          lastReportedProgress = frac;
          self.postMessage({ type: 'progress', progress: frac });
        }
      });
      self.postMessage({ type: 'progress', progress: 1.0 });
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      lastReportedProgress = 0;
      self.postMessage({
        type: 'load_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else if (data.type === 'abort') {
    activeGenerations.delete(data.id);
  } else if (data.type === 'generate') {
    const id = data.id as number;
    activeGenerations.add(id);

    try {
      const generator = await getGenerator();
      await warmSystemPromptCache(generator);
      if (!activeGenerations.has(id)) return;

      const prompt = buildChatPrompt(data.query, data.passages);
      const prefixCache = getClonedSystemPromptCache();

      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (token: string) => {
          if (activeGenerations.has(id)) {
            self.postMessage({ type: 'token', id, token });
          }
        },
      });

      if (prefixCache && generator.model?.generate) {
        const inputs = generator.tokenizer(prompt, { add_special_tokens: false });
        await generator.model.generate({
          ...inputs,
          past_key_values: prefixCache,
          max_new_tokens: 150,
          temperature: 0.2,
          top_p: 0.9,
          do_sample: false,
          streamer,
        });
      } else {
        await generator(prompt, {
          max_new_tokens: 150,
          temperature: 0.2,
          top_p: 0.9,
          do_sample: false,
          streamer,
        });
      }

      if (activeGenerations.has(id)) {
        activeGenerations.delete(id);
        self.postMessage({ type: 'done', id });
      }
    } catch (err) {
      activeGenerations.delete(id);
      self.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
