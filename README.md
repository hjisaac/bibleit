# bibleit

An offline-first Bible search Progressive Web App (PWA) with hybrid retrieval.

## Overview

`bibleit` provides fast, private scripture search across three modes combined using Reciprocal Rank Fusion (RRF):
- **Exact Reference**: Instant verse and chapter lookups (e.g., `John 3:16`, `Genesis 1:1-31`).
- **Keyword Search**: BM25 lexical search for exact phrases and words.
- **Semantic Search**: Dense vector search running locally in the browser to match conceptual queries (e.g., "comfort in sorrow", "handling anxiety").
- **Passage Grounding**: Contextual passage reading and answer grounding.

## Architecture

`bibleit` is organized into four workspace packages:
- **`engine/` (`@bibleit/engine`)**: Core search algorithms and interfaces.
- **`app/`**: Client PWA built with Preact and TypeScript, running locally with OPFS and Web Workers.
- **`api/` (`@bibleit/api`)**: Node.js search server (Hono) for online cloud retrieval.
- **`ingest/` (`bibleit_ingest`)**: Python pipeline for USFM parsing, chunking, quantization, and artifact export.

## Empirical Evaluation & Experiments

<details>
<summary>Systematic ablation sweeps and experiment tracking</summary>

`bibleit` evaluates chunking configurations, token limits, and embedding models through systematic ablation sweeps using Crucible.

Experiment runs and benchmark metrics:

- **Corpus Linguistic Profiling**: [Weights & Biases - `bibleit-analysis-corpus-profile`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-corpus-profile)  
  Statistical distributions of raw verse lengths, pericope token budgets, and chapter structures.
- **Chunking Strategy Analysis**: [Weights & Biases - `bibleit-analysis-chunking-strategy`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-chunking-strategy)  
  Ablation sweeps over token ceilings (256, 512, 1024), verse overlaps, and header strategies.
- **Embedding Space Diagnostics**: [Weights & Biases - `bibleit-analysis-embed-corpus`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-embed-corpus)  
  Diagnostics profiling representation spread and cosine similarity across text representations.
- **Vector Quantization Diagnostics**: [Weights & Biases - `bibleit-analysis-quantize-corpus`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-quantize-corpus)  
  Compression diagnostics profiling row-wise cosine fidelity, reconstruction MSE, and int8 scale distributions.
- **Retrieval Benchmark**: [Weights & Biases - `bibleit-eval-question-to-passage`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-eval-question-to-passage)  
  Ranking performance (MRR, Hits@1, Hits@5, Hits@10) across models and quantization targets.

</details>
