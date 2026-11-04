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

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
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

export class AiAnswerProvider implements AnswerProvider {
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
      });
    }
    if (process.env.OPENROUTER_API_KEY) {
      list.push({
        name: 'openrouter',
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      });
    }
    if (process.env.GEMINI_API_KEY) {
      list.push({
        name: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      });
    }
    return list;
  }

  async *answer(query: string, context: RetrievalResult): AsyncIterable<string> {
    const providers = this.getProviders();
    if (providers.length === 0) return;

    const prompt = buildPrompt(query, context.passages);

    for (const provider of providers) {
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
      } catch (err) {
        logger.warn({ provider: provider.name, err }, 'Provider failed in answer iteration, falling back');
      }
    }
  }

  async streamResponse(
    query: string,
    passages: ScoredPassage[],
    signal?: AbortSignal,
  ): Promise<Response> {
    const providers = this.getProviders();
    if (providers.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No LLM API keys configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in .env',
        }),
        { status: StatusCodes.SERVICE_UNAVAILABLE, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const prompt = buildPrompt(query, passages);

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
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
            logger.warn({ provider: provider.name, error }, 'LLM stream error occurred');
          },
        });

        return createTextStreamResponse({ stream: result.textStream });
      } catch (err) {
        logger.warn({ provider: provider.name, err }, 'Failed initiating stream with provider, trying fallback');
        if (i === providers.length - 1) {
          throw err;
        }
      }
    }

    return new Response(JSON.stringify({ error: 'All configured LLM providers failed' }), {
      status: StatusCodes.BAD_GATEWAY,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
