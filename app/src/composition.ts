/**
 * Composition root — the ONLY file that imports concrete adapters.
 * Swapping a component happens here and nowhere else.
 */
import type {
  ArtifactStore,
  AudioNarrator,
  QueryEmbedder,
  SearchEngine,
} from './core/ports';
import {
  buildLocalEngine,
  RegexRefParser,
  MiniSearchLexicalIndex,
  BruteForceVectorIndex,
  RrfRanker,
  NullAnswerProvider,
} from '@bibleit/engine';

import { OpfsArtifactStore } from './adapters/opfs-artifact-store';
import { WorkerQueryEmbedder } from './adapters/worker-query-embedder';
import { WebSpeechNarrator } from './adapters/web-speech-narrator';

export { buildLocalEngine };

export function createDefaultArtifactStore(): ArtifactStore {
  return new OpfsArtifactStore();
}

let defaultEmbedder: WorkerQueryEmbedder | null = null;
export function createDefaultEmbedder(): WorkerQueryEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = new WorkerQueryEmbedder();
  }
  return defaultEmbedder;
}

import { env } from './env';
import { HybridEngine } from './adapters/hybrid-engine';

export function createDefaultEngine(
  store: ArtifactStore = createDefaultArtifactStore(),
  embedder: QueryEmbedder = createDefaultEmbedder(),
  isDeviceOnly?: () => boolean,
): SearchEngine {
  const localEngine = buildLocalEngine({
    store,
    refParser: new RegexRefParser(),
    lexical: new MiniSearchLexicalIndex(),
    embedder,
    vectors: new BruteForceVectorIndex(),
    ranker: new RrfRanker(),
    answers: new NullAnswerProvider(),
  });

  return new HybridEngine(localEngine, env.backendApiUrl, isDeviceOnly);
}

export function createDefaultNarrator(): AudioNarrator {
  return new WebSpeechNarrator();
}
