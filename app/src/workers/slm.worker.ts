import { pipeline, env, TextStreamer } from '@huggingface/transformers';
import { env as appEnv } from '../env';

env.allowLocalModels = false;

const r2Base = appEnv.r2Url;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
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

function buildChatPrompt(query: string, passages: (string | { text?: string })[]): string {
  const context = (passages || [])
    .slice(0, 5)
    .map((c) => (typeof c === 'string' ? c : c.text ?? ''))
    .join('\n\n');

  return `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\nPassages:\n${context}\n\nTopic / Question: ${query}\nDirect answer (plain text, no preamble):<|im_end|>\n<|im_start|>assistant\n`;
}

let generatorPromise: Promise<any> | null = null;
let lastReportedProgress = 0;

function createPipeline(device: 'webgpu' | 'wasm') {
  return pipeline('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct', {
    dtype: 'q4',
    device,
    progress_callback: (item: any) => {
      if (item.status === 'progress') {
        const isModel = Boolean(item.file && item.file.includes('.onnx'));
        const fileFrac =
          typeof item.progress === 'number'
            ? Math.min(Math.max(item.progress / 100, 0), 1)
            : item.total > 0
            ? Math.min(Math.max(item.loaded / item.total, 0), 1)
            : 0;
        // Tokenizer/config files represent ~2% of package; ONNX weights represent ~98%.
        const totalFrac = isModel ? 0.02 + fileFrac * 0.96 : fileFrac * 0.02;
        if (totalFrac > lastReportedProgress) {
          lastReportedProgress = totalFrac;
          self.postMessage({ type: 'progress', progress: totalFrac });
        }
      }
    },
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
      await getGenerator();
      self.postMessage({ type: 'progress', progress: 1.0 });
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      generatorPromise = null;
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
      if (!activeGenerations.has(id)) return;

      const prompt = buildChatPrompt(data.query, data.passages);

      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (token: string) => {
          if (activeGenerations.has(id)) {
            self.postMessage({ type: 'token', id, token });
          }
        },
      });

      await generator(prompt, {
        max_new_tokens: 220,
        temperature: 0.2,
        top_p: 0.9,
        do_sample: false,
        streamer,
      });

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
