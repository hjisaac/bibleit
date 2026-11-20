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
} from './core/ports';
import {
  LocalEngine,
  RegexRefParser,
  MiniSearchLexicalIndex,
  BruteForceVectorIndex,
  RrfRanker,
} from '@bibleit/engine';

import { createArtifactStore } from './adapters/opfs-storage';
import { WorkerQueryEmbedder } from './adapters/worker-query-embedder';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';
import { WorkerSlmAnswerProvider } from './adapters/worker-slm-answer-provider';
import { HybridEngine } from './adapters/hybrid-engine';
import { env } from './env';
import { $locale } from './stores/i18n';

export { LocalEngine, createArtifactStore };

export function createEmbedder(): QueryEmbedder {
  return new WorkerQueryEmbedder();
}

export function createAnswerProvider(
  isInstalled?: () => boolean,
): AnswerProvider {
  return new WorkerSlmAnswerProvider(isInstalled);
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

  return new HybridEngine(localEngine, env.backendApiUrl, isDeviceOnly);
}

export function createNarrator(): AudioNarrator {
  return new WebSpeechNarrator(undefined, undefined, () => $locale.get());
}
