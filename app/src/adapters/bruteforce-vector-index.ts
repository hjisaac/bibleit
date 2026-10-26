import type { VectorIndex } from '../core/ports';
import type { Chunk, Manifest, ScoredPassage } from '../core/types';

// 2,655 x 768 float32 cosine scan takes ~1.5ms in JIT without WASM HNSW graph overhead.
export class BruteForceVectorIndex implements VectorIndex {
  private chunks: Chunk[] = [];
  private matrix: Float32Array = new Float32Array(0);
  private invNorms: Float32Array = new Float32Array(0);
  private dim = 0;

  async build(manifest: Manifest, chunks: Chunk[], data: ArrayBuffer): Promise<void> {
    this.dim = manifest.embeddings.dim;
    this.chunks = chunks;
    this.matrix = new Float32Array(data);

    if (this.matrix.length !== chunks.length * this.dim) {
      throw new Error(
        `VectorIndex shape mismatch: expected ${chunks.length * this.dim} floats, got ${this.matrix.length}.`,
      );
    }

    const n = chunks.length;
    const dim = this.dim;
    this.invNorms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const offset = i * dim;
      let sumSq = 0;
      for (let d = 0; d < dim; d++) {
        const v = this.matrix[offset + d]!;
        sumSq += v * v;
      }
      this.invNorms[i] = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0;
    }
  }

  search(queryVector: Float32Array, k: number): ScoredPassage[] {
    const n = this.chunks.length;
    if (n === 0 || k <= 0 || queryVector.length !== this.dim) return [];

    let qSumSq = 0;
    for (let d = 0; d < this.dim; d++) {
      const v = queryVector[d]!;
      qSumSq += v * v;
    }
    const qInvNorm = qSumSq > 0 ? 1 / Math.sqrt(qSumSq) : 0;

    const results: ScoredPassage[] = new Array(n);
    const dim = this.dim;
    const mat = this.matrix;
    const invNorms = this.invNorms;

    for (let i = 0; i < n; i++) {
      const offset = i * dim;
      let dot = 0;
      for (let d = 0; d < dim; d++) {
        dot += queryVector[d]! * mat[offset + d]!;
      }
      const cos = dot * qInvNorm * invNorms[i]!;
      results[i] = { chunk: this.chunks[i]!, score: cos, source: 'semantic' };
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}
