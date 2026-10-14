import MiniSearch from 'minisearch';
import type { LexicalIndex } from '../core/ports';
import type { Chunk, ScoredPassage } from '../core/types';

export class MiniSearchLexicalIndex implements LexicalIndex {
  private miniSearch: MiniSearch<Chunk>;
  private chunksById: Map<number, Chunk> = new Map();

  constructor() {
    this.miniSearch = new MiniSearch<Chunk>({
      fields: ['text'],
      storeFields: ['id'],
      searchOptions: {
        boost: { text: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  async build(chunks: Chunk[]): Promise<void> {
    this.chunksById.clear();
    this.miniSearch.removeAll();

    for (const chunk of chunks) {
      this.chunksById.set(chunk.id, chunk);
    }

    this.miniSearch.addAll(chunks);
  }

  search(query: string, k: number): ScoredPassage[] {
    const results = this.miniSearch.search(query);
    const topResults = results.slice(0, k);

    return topResults.flatMap((res) => {
      const chunk = this.chunksById.get(Number(res.id));
      if (!chunk) return [];
      return [
        {
          chunk,
          score: res.score,
          source: 'lexical',
        },
      ];
    });
  }
}
