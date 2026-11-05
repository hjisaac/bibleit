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

Chunking configurations, token limits, and embedding models are evaluated through systematic ablation sweeps using Crucible.

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

## Further Notes

### Ongoing Work

- **Calibrated Abstention**: The app currently generates an overview for search queries without checking if the retrieved passages strongly support an answer. Adding abstention to avoid answering unsupported questions is planned for future work.
- **Ingest and Chunking**: Additional experiments on chunk sizes, verse boundaries, and quantized embeddings are ongoing to improve search quality and reduce storage.

### Deployment

For now, the live web app runs on free-tier hosting:
- **Cold starts**: The cloud API runs on a free Render instance that sleeps when idle. The first search may take 40 to 60 seconds while the server wakes up. Later searches run normally.
- **Search submission**: Searches run on submit (Enter key or Search button), not as you type.
- **Offline search**: If the server is unreachable or sleeping, the app searches locally using downloaded text and vectors. You can also turn on "Device-only (Offline)" in Settings to keep all search local.

## Citation

If this project is helpful to your work or studies, citation is appreciated:

```bibtex
@misc{bibleit2026,
  author = {Houngue, Isaac H.J.},
  title = {bibleit: Offline-first hybrid Bible search},
  year = {2026},
  url = {https://github.com/hjisaac/bibleit}
}
```

