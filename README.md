# bibleit

An offline-first Bible search application with local hybrid retrieval, running entirely in the browser as a Progressive Web App (PWA).

## Overview

Most Scripture search tools force a trade-off between brittle keyword matching and cloud-dependent AI search that compromises user privacy and fails without internet connectivity.

`bibleit` delivers instant, private, offline retrieval across three search modes fused via Reciprocal Rank Fusion (RRF):
- **Exact Reference**: Instant verse and chapter lookups (e.g., `John 3:16`, `Genesis 1:1–31`).
- **Keyword Search**: Inverted index / BM25 lexical matching for precise phrasing.
- **Semantic Search**: Dense vector retrieval running locally in-browser via quantized embeddings, matching conceptual queries (e.g., "comfort in sorrow", "handling anxiety") without requiring exact word matches.
- **RAG**: Passage grounded answer generation.


## Architecture

`bibleit` is organized into four workspace packages:
- **`engine/` (`@bibleit/engine`)**: Shared core search algorithms and port contracts.
- **`app/`**: Progressive Web App (PWA) built with Preact and TypeScript, running locally with OPFS and Web Workers.
- **`api/` (`@bibleit/api`)**: Fast Node.js search server (Hono) providing cloud-assisted search when online.
- **`ingest/` (`bibleit_ingest`)**: Offline Python pipeline parsing USFM sources, chunking, quantizing, and exporting static artifacts.

Detailed specification: [docs/architecture.md](docs/architecture.md).

## Empirical Evaluation & Experiments

<details>
<summary>Systematic ablation sweeps and experiment tracking</summary>

Offline semantic retrieval in the browser requires strict trade-offs between passage granularity, embedding token limits, and ranking accuracy. Instead of arbitrary chunking heuristics, `bibleit` evaluates chunking configurations, token headroom margins, and embedding models through systematic ablation sweeps using Crucible and streaming quantiles.

All experimental runs and benchmark metrics are tracked and published openly:

- **Corpus Linguistic Profiling**: [Weights & Biases - `bibleit-analysis-corpus-profile`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-corpus-profile)  
  Statistical distributions of raw verse lengths, pericope token budgets, and chapter structures across testaments.
- **Chunking Strategy Analysis**: [Weights & Biases - `bibleit-analysis-chunking-strategy`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-chunking-strategy)  
  Ablation sweeps over token ceilings (256, 512, 1024), verse overlaps, and header render strategies to measure token distributions (P50, P90, P99), pericope preservation, and truncation boundaries.
- **Embedding Space Diagnostics**: [Weights & Biases - `bibleit-analysis-embed-corpus`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-embed-corpus)  
  Vector space health diagnostics profiling representation spread, vector norm distributions, and pairwise cosine similarity across text rendering representations.
- **Vector Quantization Diagnostics**: [Weights & Biases - `bibleit-analysis-quantize-corpus`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-quantize-corpus)  
  Vector compression diagnostics profiling row-wise cosine fidelity, reconstruction MSE, and int8 scale distributions.
- **Retrieval Benchmark**: [Weights & Biases - `bibleit-eval-question-to-passage`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-eval-question-to-passage)  
  Retrieval ranking performance (MRR, Hits@1, Hits@5, Hits@10) across embedding models and vector quantization targets.

</details>
