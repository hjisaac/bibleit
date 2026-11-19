/**
 * Composition root: the ONLY file that imports concrete adapters.
 * Swapping a component happens here and nowhere else.
 */
import type {
  AnswerProvider,
  ArtifactStore,
  AudioNarrator,
  FileStorage,
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

import { OpfsStorage, createArtifactStore } from './adapters/opfs-storage';
import { WorkerQueryEmbedder } from './adapters/worker-query-embedder';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';
import { WorkerSlmAnswerProvider } from './adapters/worker-slm-answer-provider';
import { HybridEngine } from './adapters/hybrid-engine';
import { env } from './env';
import { $locale } from './stores/i18n';

export { LocalEngine };

export function createDefaultArtifactStore(storage: FileStorage = new OpfsStorage()): ArtifactStore {
  return createArtifactStore(storage);
}

let defaultEmbedder: QueryEmbedder | null = null;
export function createDefaultEmbedder(): QueryEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = new WorkerQueryEmbedder();
  }
  return defaultEmbedder;
}

let defaultAnswerProvider: AnswerProvider | null = null;
export function createDefaultAnswerProvider(
  isInstalled?: () => boolean,
): AnswerProvider {
  if (!defaultAnswerProvider) {
    defaultAnswerProvider = new WorkerSlmAnswerProvider(isInstalled);
  }
  return defaultAnswerProvider;
}

export function createDefaultEngine(
  artifactStore: ArtifactStore = createDefaultArtifactStore(),
  queryEmbedder: QueryEmbedder = createDefaultEmbedder(),
  isDeviceOnly?: () => boolean,
  answerProvider: AnswerProvider = createDefaultAnswerProvider(),
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

export function createDefaultNarrator(): AudioNarrator {
  return new WebSpeechNarrator(undefined, undefined, () => $locale.get());
}
