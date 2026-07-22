/**
 * Composition root — the ONLY file that imports concrete adapters.
 * Swapping a component happens here and nowhere else.
 */
import type {
  AnswerProvider,
  ArtifactStore,
  LexicalIndex,
  QueryEmbedder,
  Ranker,
  RefParser,
  SearchEngine,
  VectorIndex,
} from './core/ports';
import type { RetrievalResult } from './core/types';

// v1 adapters (each is one file in src/adapters/ — see design/architecture.md
// for the swap path of every port):
// import { OpfsArtifactStore } from './adapters/opfs-artifact-store';
// import { RegexRefParser } from './adapters/regex-ref-parser';
// import { MiniSearchLexicalIndex } from './adapters/minisearch-lexical-index';
// import { TransformersQueryEmbedder } from './adapters/transformers-query-embedder';
// import { BruteForceVectorIndex } from './adapters/bruteforce-vector-index';
// import { RrfRanker } from './adapters/rrf-ranker';
// import { NullAnswerProvider } from './adapters/null-answer-provider';

interface Ports {
  store: ArtifactStore;
  refParser: RefParser;
  lexical: LexicalIndex;
  embedder: QueryEmbedder;
  vectors: VectorIndex;
  ranker: Ranker;
  answers: AnswerProvider;
}

/**
 * LocalEngine: the fully in-browser SearchEngine, composed from the fine ports.
 * A future RemoteEngine implements SearchEngine directly over HTTP instead —
 * same interface, so the UI never changes.
 */
export function buildLocalEngine(p: Ports): SearchEngine {
  const ready = (async () => {
    const manifest = await p.store.manifest();

    // INVARIANT: query model must match corpus model (see QueryEmbedder docs).
    if (p.embedder.modelId !== manifest.embeddings.model) {
      throw new Error(
        `Embedder/corpus mismatch: app has "${p.embedder.modelId}", ` +
          `artifacts were built with "${manifest.embeddings.model}". ` +
          `Update the app or re-run ingest.`,
      );
    }

    const [verses, , emb] = await Promise.all([
      p.store.verses(),
      p.store.chunks(),
      p.store.embeddings(),
    ]);
    await Promise.all([
      p.lexical.build(verses),
      p.vectors.build(manifest, emb.data, emb.scales),
      p.embedder.load(),
    ]);
  })();

  return {
    ready,
    answers: p.answers,
    async retrieve(query, k = 10): Promise<RetrievalResult> {
      await ready;
      const parsedRefs = p.refParser.parse(query);
      // TODO(v1): resolve parsedRefs to passages via the store.
      const refPassages = [] as RetrievalResult['passages'];
      const [lexical, queryVec] = await Promise.all([
        Promise.resolve(p.lexical.search(query, k)),
        p.embedder.embed(query),
      ]);
      const semantic = p.vectors.search(queryVec, k);
      return {
        parsedRefs,
        passages: p.ranker.merge(refPassages, lexical, semantic, k),
      };
    },
  };
}

/**
 * v1 wiring. Uncomment adapter imports as they are implemented.
 * Later, swapping to a server backend is exactly:
 *   return new RemoteEngine('https://api.bibleit.example/search');
 */
export function createDefaultEngine(): SearchEngine {
  throw new Error('Adapters not implemented yet — see src/adapters/');
  // return buildLocalEngine({
  //   store: new OpfsArtifactStore('/artifacts/web@v1/'),
  //   refParser: new RegexRefParser(['en', 'fr']),
  //   lexical: new MiniSearchLexicalIndex(),
  //   embedder: new TransformersQueryEmbedder(),
  //   vectors: new BruteForceVectorIndex(),
  //   ranker: new RrfRanker(),
  //   answers: new NullAnswerProvider(),
  // });
}
