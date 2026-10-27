import type { VectorIndex } from '../core/ports';
import type { Chunk, Manifest, ScoredPassage } from '../core/types';

// Cosine scan for 2,655 vectors in typed arrays: ~1.5ms in JIT.
export class BruteForceVectorIndex implements VectorIndex {
  private chunks: Chunk[] = [];
  private dim = 0;
  private isInt8 = false;
  private floatMatrix: Float32Array = new Float32Array(0);
  private int8Matrix: Int8Array = new Int8Array(0);
  private scales: Float32Array = new Float32Array(0);
  private invNorms: Float32Array = new Float32Array(0);

  async build(
    manifest: Manifest,
    chunks: Chunk[],
    data: ArrayBuffer,
    scales?: ArrayBuffer,
  ): Promise<void> {
    this.dim = manifest.embeddings.dim;
    this.chunks = chunks;
    this.isInt8 = manifest.embeddings.quantization.type === 'int8';

    if (this.isInt8) {
      this.int8Matrix = new Int8Array(data);
      if (this.int8Matrix.length !== chunks.length * this.dim) {
        throw new Error(
          `VectorIndex shape mismatch: expected ${chunks.length * this.dim} int8 bytes, got ${this.int8Matrix.length}.`,
        );
      }
      this.scales = scales ? new Float32Array(scales) : new Float32Array(chunks.length).fill(1 / 127);
    } else {
      this.floatMatrix = new Float32Array(data);
      if (this.floatMatrix.length !== chunks.length * this.dim) {
        throw new Error(
          `VectorIndex shape mismatch: expected ${chunks.length * this.dim} floats, got ${this.floatMatrix.length}.`,
        );
      }
      const n = chunks.length;
      const dim = this.dim;
      this.invNorms = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const offset = i * dim;
        let sumSq = 0;
        for (let d = 0; d < dim; d++) {
          const v = this.floatMatrix[offset + d]!;
          sumSq += v * v;
        }
        this.invNorms[i] = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0;
      }
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

    if (this.isInt8) {
      const mat = this.int8Matrix;
      const scales = this.scales;
      for (let i = 0; i < n; i++) {
        const offset = i * dim;
        let dot = 0;
        for (let d = 0; d < dim; d++) {
          dot += queryVector[d]! * mat[offset + d]!;
        }
        const cos = dot * scales[i]! * qInvNorm;
        results[i] = { chunk: this.chunks[i]!, score: cos, source: 'semantic' };
      }
    } else {
      const mat = this.floatMatrix;
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
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}
