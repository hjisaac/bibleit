/**
 * Composition root: the ONLY file that imports concrete adapters.
 * Swapping a component happens here and nowhere else.
 */
import type {
  AnswerProvider,
  ArtifactStore,
  AudioNarrator,
  QueryEmbedder,
  SearchEngine,
  Telemetry,
} from './core/ports';
import {
  LocalEngine,
  RegexRefParser,
  MiniSearchLexicalIndex,
  BruteForceVectorIndex,
  RrfRanker,
} from '@bibleit/engine';

import { createArtifactStore } from './adapters/opfs-storage';
import { WorkerQueryEmbedder, type QueryEmbedderConfig } from './adapters/worker-query-embedder';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';
import { WorkerSlmAnswerProvider } from './adapters/worker-slm-answer-provider';
import { HttpAnswerProvider } from './adapters/http-answer-provider';
import { RemoteEngine } from './adapters/remote-engine';
import { createHybridEngine } from './adapters/hybrid-engine';
import { PostHogTelemetry } from './adapters/posthog-telemetry';
import { BrowserLanguageDetector } from './core/language-detector';
import { env } from './env';
import { $locale } from './stores/i18n';
import { $queryTranslationEnabled } from './stores/preferences';
import manifest from '../public/data/manifest.json';

export { LocalEngine, createArtifactStore };

export function createEmbedder(
  config: QueryEmbedderConfig = {
    modelId: manifest.embeddings.model,
    dim: manifest.embeddings.dim,
    queryPrefix: manifest.embeddings.query_prefix,
  },
): QueryEmbedder {
  return new WorkerQueryEmbedder(config);
}

export function createAnswerProvider(
  isInstalled?: () => boolean,
  modelId: string = manifest.generation?.model || 'HuggingFaceTB/SmolLM2-360M-Instruct',
): AnswerProvider {
  return new WorkerSlmAnswerProvider(isInstalled, modelId);
}

export function createEngine(
  artifactStore: ArtifactStore = createArtifactStore(),
  queryEmbedder: QueryEmbedder = createEmbedder(),
  isDeviceOnly?: () => boolean,
  answerProvider: AnswerProvider = createAnswerProvider(),
): SearchEngine {
  const localEngine = new LocalEngine({
    artifactStore,
    refParser: new RegexRefParser(),
    lexicalIndex: new MiniSearchLexicalIndex(),
    queryEmbedder,
    vectorIndex: new BruteForceVectorIndex(),
    ranker: new RrfRanker(),
    answerProvider,
  });

  const remoteUrl = env.backendApiUrl?.trim().replace(/\/+$/, '');
  const remoteEngine = remoteUrl
    ? new RemoteEngine(
        remoteUrl,
        new HttpAnswerProvider(remoteUrl, isDeviceOnly),
        () => $locale.get(),
        () => $queryTranslationEnabled.get(),
        new BrowserLanguageDetector(),
      )
    : null;

  return createHybridEngine(remoteEngine, localEngine, isDeviceOnly, () => $locale.get());
}

export function createNarrator(): AudioNarrator {
  return new WebSpeechNarrator(undefined, undefined, () => $locale.get());
}

export function createTelemetry(): Telemetry {
  return new PostHogTelemetry(
    env.posthogKey,
    env.posthogHost,
    env.telemetryBatchSize,
    env.telemetryEnv,
  );
}
