import MiniSearch from 'minisearch';
import type { LexicalIndex } from '../core/ports';
import { getChunkKey, type Chunk, type ScoredPassage } from '../core/types';

export class MiniSearchLexicalIndex implements LexicalIndex {
  private miniSearch: MiniSearch<Chunk>;
  private chunksByKey: Map<string, Chunk> = new Map();

  constructor() {
    this.miniSearch = new MiniSearch<Chunk>({
      idField: 'key',
      fields: ['text'],
      extractField: (document, fieldName) => {
        if (fieldName === 'key') return getChunkKey(document);
        return (document as unknown as Record<string, unknown>)[fieldName];
      },
      searchOptions: {
        boost: { text: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  async build(chunks: Chunk[]): Promise<void> {
    this.chunksByKey.clear();
    this.miniSearch.removeAll();

    for (const chunk of chunks) {
      this.chunksByKey.set(getChunkKey(chunk), chunk);
    }

    this.miniSearch.addAll(chunks);
  }

  search(query: string, k: number): ScoredPassage[] {
    const results = this.miniSearch.search(query);
    const topResults = results.slice(0, k);

    return topResults.flatMap((res) => {
      const chunk = this.chunksByKey.get(String(res.id));
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
