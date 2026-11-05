import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import type { QueryEmbedder } from '@bibleit/engine';

export class NodeQueryEmbedder implements QueryEmbedder {
  readonly modelId: string;
  readonly dim: number;
  private queryPrefix: string;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(
    modelId = 'nomic-ai/nomic-embed-text-v1.5',
    dim = 768,
    queryPrefix = 'search_query: ',
  ) {
    this.modelId = modelId;
    this.dim = dim;
    this.queryPrefix = queryPrefix;
    const baseCache = process.env.HF_HOME
      ? (process.env.HF_HOME.endsWith('transformers')
          ? process.env.HF_HOME
          : path.join(process.env.HF_HOME, 'transformers'))
      : path.join(os.homedir(), '.cache', 'huggingface', 'transformers');

    try {
      fs.mkdirSync(baseCache, { recursive: true });
      env.cacheDir = baseCache;
    } catch {
      // Fallback to tmpdir if container home directory is read-only
      const tmpCache = path.join(os.tmpdir(), 'huggingface', 'transformers');
      fs.mkdirSync(tmpCache, { recursive: true });
      env.cacheDir = tmpCache;
    }
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
  }

  async hasModel(): Promise<boolean> {
    return true;
  }

  async load(): Promise<void> {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline('feature-extraction', this.modelId, {
        dtype: 'q8',
      }) as Promise<FeatureExtractionPipeline>;
    }
    await this.extractorPromise;
  }

  async embed(query: string): Promise<Float32Array> {
    await this.load();
    const extractor = await this.extractorPromise!;
    const prefixed = `${this.queryPrefix}${query}`;
    const output = await extractor(prefixed, { pooling: 'mean', normalize: true });
    return output.data as Float32Array;
  }
}
