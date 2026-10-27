import type { QueryEmbedder } from '../core/ports';

export class NullQueryEmbedder implements QueryEmbedder {
  readonly modelId = 'nomic-ai/nomic-embed-text-v1.5';
  readonly dim = 768;

  async load(_onProgress?: (fraction: number) => void): Promise<void> {
    throw new Error('Neural query embedding not yet loaded');
  }

  async embed(_query: string): Promise<Float32Array> {
    throw new Error('Neural query embedding not yet loaded');
  }
}
