import { createOpenAI } from '@ai-sdk/openai';
import { streamText, createTextStreamResponse } from 'ai';
import {
  CircuitState,
  ConsecutiveBreaker,
  DelegateBackoff,
  circuitBreaker,
  handleWhen,
  type CircuitBreakerPolicy,
} from 'cockatiel';
import { StatusCodes } from 'http-status-codes';
import {
  renderChunk,
  TELEMETRY_HEADERS,
  type AnswerProvider,
  type RetrievalResult,
  type ScoredPassage,
  isFrenchLocale,
} from '@bibleit/engine';
import {
  COHERE_BASE_URL,
  COHERE_DEFAULT_MODEL,
  GEMINI_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  GROQ_BASE_URL,
  GROQ_DEFAULT_MODEL,
  MISTRAL_BASE_URL,
  MISTRAL_DEFAULT_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from '../constants';
import { logger } from '../logger';

export interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  tier: 1 | 2;
}

export interface ProviderStatus {
  name: string;
  tier: 1 | 2;
  model: string;
  status: 'healthy' | 'cooldown';
  cooldownRemainingSec?: number;
}

interface ProviderBreaker {
  readonly policy: CircuitBreakerPolicy;
  openUntil: number;
}

const handleProviderError = handleWhen(
  (err: any) => !(err?.name === 'AbortError' || err?.message?.includes('aborted')),
);

const SYSTEM_PROMPT = `You are BibleIt, a focused scripture assistant.
Provide a direct, factual biblical summary using ONLY the provided Bible passages.

Rules:
- Zero preamble: NEVER include conversational openings or meta-announcements such as "Based on the provided passages", "Here is what the Bible says/teaches", or "According to the verses". Start directly with the core message.
- Plain text only: Do NOT use markdown syntax (no asterisks, bold, italics, bullet points, headers, or blockquotes).
- Strict grounding: State only what is explicitly in the passages. Do not invent theology or verses.
- Citations: Cite specific references in brackets, e.g. [MAT 22:39] or [ROM 13:8-10]. Use a regular hyphen in verse ranges.
- Length: Keep the summary cohesive, concise, and focused (1 to 2 paragraphs, under 150 words).`;

function getSystemPrompt(locale?: string): string {
  if (isFrenchLocale(locale)) {
    return `${SYSTEM_PROMPT}\n- Language: Respond in French (rédige la réponse en français).`;
  }
  return SYSTEM_PROMPT;
}

function buildPrompt(query: string, passages: ScoredPassage[], locale?: string): string {
  const context = passages
    .slice(0, 5)
    .map((p) => renderChunk(p.chunk))
    .join('\n\n');

  const answerInstruction = isFrenchLocale(locale)
    ? 'Direct answer in French (plain text, no preamble or introductory phrase):'
    : 'Direct answer (plain text, no preamble or introductory phrase):';

  return `Passages:\n${context}\n\nTopic / Question: ${query}\n${answerInstruction}`;
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
  private breakers = new Map<string, ProviderBreaker>();
  private roundRobinCounter = 0;

  get available(): boolean {
    return this.getProviders().length > 0;
  }

  private getBreaker(providerName: string): ProviderBreaker {
    let entry = this.breakers.get(providerName);
    if (!entry) {
      let openUntil = 0;
      const policy = circuitBreaker(handleProviderError, {
        breaker: new ConsecutiveBreaker(1),
        halfOpenAfter: new DelegateBackoff((ctx) => {
          const err = 'error' in ctx.result ? ctx.result.error : undefined;
          const cooldownMs = parseCooldownMs(err);
          openUntil = Date.now() + cooldownMs;
          logger.warn(
            { provider: providerName, cooldownSec: Math.round(cooldownMs / 1000) },
            'Provider cooled down after error or rate limit',
          );
          return cooldownMs;
        }),
      });
      policy.onReset(() => {
        openUntil = 0;
      });
      entry = {
        policy,
        get openUntil() {
          return openUntil;
        },
        set openUntil(v: number) {
          openUntil = v;
        },
      };
      this.breakers.set(providerName, entry);
    }
    return entry;
  }

  private isCooling(providerName: string, now = Date.now()): boolean {
    const entry = this.breakers.get(providerName);
    if (!entry) return false;
    return entry.policy.state === CircuitState.Open && entry.openUntil > now;
  }

  /** Trips a provider's cockatiel circuit breaker with the given error. */
  recordFailure(providerName: string, err: unknown): Promise<void> {
    const wrapped =
      err instanceof Error
        ? err
        : Object.assign(new Error('Provider error'), typeof err === 'object' && err ? err : {});
    return this.getBreaker(providerName)
      .policy.execute(() => Promise.reject(wrapped))
      .catch(() => {});
  }

  getProviders(): ProviderConfig[] {
    const list: ProviderConfig[] = [];

    if (process.env.GROQ_API_KEY) {
      list.push({
        name: 'groq',
        baseURL: GROQ_BASE_URL,
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL,
        tier: 1,
      });
    }
    if (process.env.GEMINI_API_KEY) {
      list.push({
        name: 'gemini',
        baseURL: GEMINI_BASE_URL,
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
        tier: 1,
      });
    }
    if (process.env.OPENROUTER_API_KEY) {
      list.push({
        name: 'openrouter',
        baseURL: OPENROUTER_BASE_URL,
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL,
        tier: 2,
      });
    }
    if (process.env.MISTRAL_API_KEY) {
      list.push({
        name: 'mistral',
        baseURL: MISTRAL_BASE_URL,
        apiKey: process.env.MISTRAL_API_KEY,
        model: process.env.MISTRAL_MODEL || MISTRAL_DEFAULT_MODEL,
        tier: 2,
      });
    }
    if (process.env.COHERE_API_KEY) {
      list.push({
        name: 'cohere',
        baseURL: COHERE_BASE_URL,
        apiKey: process.env.COHERE_API_KEY,
        model: process.env.COHERE_MODEL || COHERE_DEFAULT_MODEL,
        tier: 2,
      });
    }

    return list;
  }

  /**
   * Returns candidate providers ordered with healthy Tier 1 providers rotated round-robin,
   * followed by healthy Tier 2 reserve providers.
   */
  getCandidateList(): ProviderConfig[] {
    const all = this.getProviders();
    if (all.length === 0) return [];

    const now = Date.now();
    const isHealthy = (p: ProviderConfig) => !this.isCooling(p.name, now);

    const tier1Healthy = all.filter((p) => p.tier === 1 && isHealthy(p));
    const tier2Healthy = all.filter((p) => p.tier === 2 && isHealthy(p));

    const candidates: ProviderConfig[] = [];
    if (tier1Healthy.length > 0) {
      const offset = Math.abs(this.roundRobinCounter++) % tier1Healthy.length;
      candidates.push(...tier1Healthy.slice(offset), ...tier1Healthy.slice(0, offset));
    }

    candidates.push(...tier2Healthy);

    if (candidates.length === 0) {
      const cooling = [...all].sort(
        (a, b) => (this.breakers.get(a.name)?.openUntil || 0) - (this.breakers.get(b.name)?.openUntil || 0),
      );
      candidates.push(...cooling);
    }

    return candidates;
  }

  /** Returns live health and cooldown status for all configured providers. */
  getProviderStatuses(): ProviderStatus[] {
    const now = Date.now();
    return this.getProviders().map((p) => {
      const openUntil = this.breakers.get(p.name)?.openUntil || 0;
      const isCooling = this.isCooling(p.name, now);
      return {
        name: p.name,
        tier: p.tier,
        model: p.model,
        status: isCooling ? 'cooldown' : 'healthy',
        ...(isCooling ? { cooldownRemainingSec: Math.ceil((openUntil - now) / 1000) } : {}),
      };
    });
  }

  async *answer(
    query: string,
    context: RetrievalResult,
    _onMeta?: unknown,
    locale?: string,
  ): AsyncIterable<string> {
    const candidates = this.getCandidateList();
    if (candidates.length === 0) return;

    const prompt = buildPrompt(query, context.passages, locale);
    const system = getSystemPrompt(locale);

    for (const provider of candidates) {
      const breaker = this.getBreaker(provider.name).policy;
      let yieldedAny = false;
      try {
        const iterator = await breaker.execute(async () => {
          const client = createOpenAI({
            baseURL: provider.baseURL,
            apiKey: provider.apiKey,
          });
          const result = streamText({
            model: client.chat(provider.model),
            system,
            prompt,
            maxOutputTokens: 300,
          });
          const it = result.textStream[Symbol.asyncIterator]();
          const first = await it.next();
          if (first.done && !first.value) {
            throw new Error('Provider returned empty stream');
          }
          return { it, first };
        });

        if (iterator.first.value) {
          yieldedAny = true;
          yield iterator.first.value;
        }
        while (true) {
          const { done, value } = await iterator.it.next();
          if (done) break;
          yieldedAny = true;
          yield value;
        }

        return;
      } catch (err) {
        if (yieldedAny) {
          await this.recordFailure(provider.name, err);
          return;
        }
      }
    }
  }

  async streamResponse(
    query: string,
    passages: ScoredPassage[],
    signal?: AbortSignal,
    locale?: string,
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

    const prompt = buildPrompt(query, passages, locale);
    const system = getSystemPrompt(locale);

    for (let i = 0; i < candidates.length; i++) {
      const provider = candidates[i]!;
      const breaker = this.getBreaker(provider.name).policy;
      try {
        const { iterator, first } = await breaker.execute(async () => {
          const client = createOpenAI({
            baseURL: provider.baseURL,
            apiKey: provider.apiKey,
          });

          const result = streamText({
            model: client.chat(provider.model),
            system,
            prompt,
            abortSignal: signal,
            maxOutputTokens: 300,
          });

          const it = result.textStream[Symbol.asyncIterator]();
          const firstChunk = await it.next();

          if (firstChunk.done && !firstChunk.value) {
            throw new Error('Provider returned empty stream');
          }
          return { iterator: it, first: firstChunk };
        });

        const onStreamErr = (err: unknown) => {
          void this.recordFailure(provider.name, err);
        };
        const responseStream = new ReadableStream<string>({
          async start(controller) {
            if (first.value) {
              controller.enqueue(first.value);
            }
            try {
              while (true) {
                const { done, value } = await iterator.next();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (err) {
              onStreamErr(err);
              controller.error(err);
            }
          },
        });

        logger.info(
          { provider: provider.name, model: provider.model, attempts: i + 1 },
          'Serving AI generation stream',
        );

        return createTextStreamResponse({
          stream: responseStream,
          headers: {
            [TELEMETRY_HEADERS.PROVIDER]: provider.name,
            [TELEMETRY_HEADERS.MODEL]: provider.model,
            [TELEMETRY_HEADERS.ATTEMPTS]: String(i + 1),
          },
        });
      } catch (err) {
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
