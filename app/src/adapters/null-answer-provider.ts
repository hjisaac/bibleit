import type { AnswerProvider } from '../core/ports';
import type { RetrievalResult } from '../core/types';

export class NullAnswerProvider implements AnswerProvider {
  readonly available = false;

  async *answer(_query: string, _context: RetrievalResult): AsyncIterable<string> {
    // No-op in v1 offline mode.
  }
}
