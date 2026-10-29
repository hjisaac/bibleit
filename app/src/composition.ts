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

import { HybridEngine } from './adapters/hybrid-engine';

export function createDefaultEngine(
  store: ArtifactStore = createDefaultArtifactStore(),
  embedder: QueryEmbedder = createDefaultEmbedder(),
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

  const backendUrl = import.meta.env.VITE_BACKEND_API_URL?.trim();
  if (backendUrl) {
    return new HybridEngine(localEngine, backendUrl);
  }
  return localEngine;
}

export function createDefaultNarrator(): AudioNarrator {
  return new WebSpeechNarrator();
}
