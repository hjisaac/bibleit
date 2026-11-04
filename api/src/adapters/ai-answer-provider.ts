import { createOpenAI } from '@ai-sdk/openai';
import { streamText, createTextStreamResponse } from 'ai';
import { StatusCodes } from 'http-status-codes';
import {
  renderChunk,
  type AnswerProvider,
  type RetrievalResult,
  type ScoredPassage,
} from '@bibleit/engine';
import { logger } from '../logger';

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  tier?: number;
}

const SYSTEM_PROMPT = `You are BibleIt, a focused scripture assistant.
Answer the user's question or explain the search topic using ONLY the provided Bible passages.
Guidelines:
- Ground your answer strictly in the provided text. Do not invent theology or verses.
- Cite specific verse references in brackets, e.g. [JHN 3:16].
- If the passages do not contain enough information to answer the question, state that clearly and briefly.
- Keep answers concise, objective, and clear.`;

function buildPrompt(query: string, passages: ScoredPassage[]): string {
  const context = passages
    .slice(0, 5)
    .map((p) => renderChunk(p.chunk))
    .join('\n\n');

  return `Question: ${query}\n\nPassages:\n${context}`;
}

/**
 * Parses cooldown duration from 429 response headers or error messages.
 * Groq (RFC retry-after): https://console.groq.com/docs/rate-limits
 * OpenRouter (x-ratelimit-reset): https://openrouter.ai/docs/api-reference/limits
 * Gemini ("retry in Xs"): https://ai.google.dev/gemini-api/docs/rate-limits
 * Mistral (retry-after): https://docs.mistral.ai/api/#tag/limits
 */
export function parseCooldownMs(err: unknown): number {
  const errorObj = err as Record<string, unknown> | undefined;
  const headers = (errorObj?.responseHeaders || errorObj?.headers) as
    | Headers
    | Record<string, string>
    | undefined;

  // 1. Standard RFC Retry-After (seconds)
  const getHeader = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name) || undefined;
    }
    return (headers as Record<string, string>)[name] || (headers as Record<string, string>)[name.toLowerCase()];
  };

  const retryAfter = getHeader('retry-after');
  if (retryAfter && !isNaN(Number(retryAfter))) {
    return Math.max(1000, Number(retryAfter) * 1000);
  }

  // 2. OpenRouter Unix timestamp reset
  const resetUnix = getHeader('x-ratelimit-reset');
  if (resetUnix && Number(resetUnix) > 1000) {
    const diff = Number(resetUnix) * 1000 - Date.now();
    if (diff > 0 && diff < 3600_000) return diff;
  }

  // 3. Gemini error message regex: "Please retry in 34.07s"
  const msg =
    String(errorObj?.message || '') ||
    String((errorObj?.data as Record<string, unknown>)?.error || '');
  const match = msg.match(/retry in ([\d\.]+)s/i);
  if (match?.[1]) {
    return Math.max(1000, Math.ceil(parseFloat(match[1])) * 1000);
  }

  // 4. Safe default: 30 seconds + random jitter to prevent stampedes
  return 30_000 + Math.floor(Math.random() * 5000);
}

// Free tier endpoints catalog: https://github.com/mnfst/awesome-free-llm-apis
export class AiAnswerProvider implements AnswerProvider {
  private cooldowns = new Map<string, number>();
  private roundRobinCounter = 0;

  get available(): boolean {
    return this.getProviders().length > 0;
  }

  getProviders(): ProviderConfig[] {
    const list: ProviderConfig[] = [];

    if (process.env.GROQ_API_KEY) {
      list.push({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        tier: 1,
      });
    }
    if (process.env.GEMINI_API_KEY) {
      list.push({
        name: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        tier: 1,
      });
    }
    if (process.env.OPENROUTER_API_KEY) {
      list.push({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
        tier: 2,
      });
    }
    if (process.env.MISTRAL_API_KEY) {
      list.push({
        name: 'mistral',
        baseURL: 'https://api.mistral.ai/v1',
        apiKey: process.env.MISTRAL_API_KEY,
        model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
        tier: 2,
      });
    }
    if (process.env.COHERE_API_KEY) {
      list.push({
        name: 'cohere',
        baseURL: 'https://api.cohere.ai/compatibility/v1',
        apiKey: process.env.COHERE_API_KEY,
        model: process.env.COHERE_MODEL || 'command-r',
        tier: 2,
      });
    }

    return list;
  }

  /**
   * Returns healthy providers ordered by round-robin rotation,
   * keeping Tier 1 primary providers ahead of Tier 2 reserve providers.
   */
  getCandidateList(): ProviderConfig[] {
    const all = this.getProviders();
    if (all.length === 0) return [];

    const now = Date.now();
    const healthy = all.filter((p) => now >= (this.cooldowns.get(p.name) || 0));

    // Fallback to earliest recovering provider if all are currently cooling down
    const pool =
      healthy.length > 0
        ? healthy
        : [...all].sort((a, b) => (this.cooldowns.get(a.name) || 0) - (this.cooldowns.get(b.name) || 0));

    const offset = Math.abs(this.roundRobinCounter++) % pool.length;
    return [...pool.slice(offset), ...pool.slice(0, offset)];
  }

  /** Alias for getCandidateList */
  getCandidateQueue(): ProviderConfig[] {
    return this.getCandidateList();
  }

  markCooldown(providerName: string, err: unknown): void {
    const cooldownMs = parseCooldownMs(err);
    const cooldownUntil = Date.now() + cooldownMs;
    this.cooldowns.set(providerName, cooldownUntil);
    logger.warn(
      { provider: providerName, cooldownSec: Math.round(cooldownMs / 1000) },
      'Provider cooled down after error or rate limit',
    );
  }

  async *answer(query: string, context: RetrievalResult): AsyncIterable<string> {
    const candidates = this.getCandidateList();
    if (candidates.length === 0) return;

    const prompt = buildPrompt(query, context.passages);

    for (const provider of candidates) {
      try {
        let streamError: Error | null = null;
        const client = createOpenAI({
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
        });
        const result = streamText({
          model: client.chat(provider.model),
          system: SYSTEM_PROMPT,
          prompt,
          onError: ({ error }) => {
            streamError = error instanceof Error ? error : new Error(String(error));
          },
        });

        for await (const chunk of result.textStream) {
          yield chunk;
        }

        if (!streamError) return;
        this.markCooldown(provider.name, streamError);
      } catch (err) {
        this.markCooldown(provider.name, err);
      }
    }
  }

  async streamResponse(
    query: string,
    passages: ScoredPassage[],
    signal?: AbortSignal,
  ): Promise<Response> {
    const candidates = this.getCandidateList();
    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No LLM API keys configured. Set GEMINI_API_KEY, GROQ_API_KEY, or others in .env',
        }),
        { status: StatusCodes.SERVICE_UNAVAILABLE, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const prompt = buildPrompt(query, passages);

    for (let i = 0; i < candidates.length; i++) {
      const provider = candidates[i]!;
      try {
        const client = createOpenAI({
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
        });

        const result = streamText({
          model: client.chat(provider.model),
          system: SYSTEM_PROMPT,
          prompt,
          abortSignal: signal,
          onError: ({ error }) => {
            this.markCooldown(provider.name, error);
          },
        });

        return createTextStreamResponse({ stream: result.textStream });
      } catch (err) {
        this.markCooldown(provider.name, err);
        if (i === candidates.length - 1) {
          throw err;
        }
      }
    }

    return new Response(JSON.stringify({ error: 'All configured LLM providers failed or in cooldown' }), {
      status: StatusCodes.BAD_GATEWAY,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
