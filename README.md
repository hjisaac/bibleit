# bibleit

An offline-first Bible search application with local hybrid retrieval, running entirely in the browser as a Progressive Web App (PWA).

## Overview

Most Scripture search tools force a trade-off between brittle keyword matching and cloud-dependent AI search that compromises user privacy and fails without internet connectivity.

`bibleit` delivers instant, private, offline retrieval across three search modes fused via Reciprocal Rank Fusion (RRF):
- **Exact Reference**: Instant verse and chapter lookups (e.g., `John 3:16`, `Genesis 1:1–31`).
- **Keyword Search**: Inverted index / BM25 lexical matching for precise phrasing.
- **Semantic Search**: Dense vector retrieval running locally in-browser via quantized embeddings, matching conceptual queries (e.g., "comfort in sorrow", "handling anxiety") without requiring exact word matches.
- **RAG**: Passage grounded generation answer generation.


## Architecture

The system maintains a strict boundary between offline data preparation and the client runtime:

### Ingest Pipeline (`ingest/`)
An offline Python pipeline responsible for data preparation, segmentation, and evaluation:
- Parses public-domain translations (World English Bible, Berean Standard Bible) from USFM and USJ AST formats.
- Projects semantic pericope boundaries across versification schemes to generate context-preserving passage chunks.
- Profiles token distributions and benchmarks retrieval quality (MRR, Hits@k) using Crucible experiment orchestration.
- Quantizes and exports version-gated static artifacts (`manifest.json`, `chunks.json.gz`, `verses.json.gz`, int8 binary embeddings).

### Client Application (`app/`)
A lightweight, offline-ready web application built with Preact and TypeScript:
- **Hexagonal Architecture**: Core domain ports decouple search engines, rankers, and storage from runtime implementations.
- **Client-Side Storage**: Entire Bible corpora and retrieval models cache locally using Cache Storage and IndexedDB.
- **Reader & Discovery**: Renders canonical citation spans, pericope section titles, and transitions smoothly into full-chapter Scripture reading.

## Empirical Evaluation & Experiments

Offline semantic retrieval in the browser requires strict trade-offs between passage granularity, embedding token limits, and ranking accuracy. Instead of arbitrary chunking heuristics, `bibleit` evaluates chunking configurations, token headroom margins, and embedding models through systematic ablation sweeps using Crucible and streaming quantiles.

All experimental runs and benchmark metrics are tracked and published openly:

- **Corpus Linguistic Profiling**: [Weights & Biases — `bibleit-analysis-corpus-profile`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-corpus-profile)  
  Statistical distributions of raw verse lengths, pericope token budgets, and chapter structures across testaments.
- **Chunking Strategy Analysis**: [Weights & Biases — `bibleit-analysis-chunking-strategy`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-chunking-strategy)  
  Ablation sweeps over token ceilings (256, 512, 1024), verse overlaps, and header render strategies to measure token distributions (P50, P90, P99), pericope preservation, and truncation boundaries.
- **Embedding Space Diagnostics**: [Weights & Biases — `bibleit-analysis-embed-corpus`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-analysis-embed-corpus)  
  Vector space health diagnostics profiling representation spread, vector norm distributions, and pairwise cosine similarity across text rendering representations.
- **Retrieval Benchmark**: [Weights & Biases — `bibleit-eval-question-to-passage`](https://wandb.ai/hjisaach-aims-south-africa/bibleit-eval-question-to-passage)  
  Retrieval ranking performance (MRR, Hits@1, Hits@5, Hits@10) across embedding models and vector quantization targets.
- **Public Workspace**: [Weights & Biases — `hjisaach-aims-south-africa`](https://wandb.ai/hjisaach-aims-south-africa)

## Documentation

- [design/architecture.md](design/architecture.md) — System design, artifact contract, and component ports.
- [design/conventions.md](design/conventions.md) — Engineering standards and architectural rules.
- [design/vocabulary.md](design/vocabulary.md) — Domain definitions (references, pericopes, passages, chunks).
