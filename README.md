# bibleit

An offline-first Bible search application with local hybrid retrieval, running entirely in the browser as a Progressive Web App (PWA).

## Overview

Most Scripture search tools force a trade-off between brittle keyword matching and cloud-dependent AI search that compromises user privacy and fails without internet connectivity.

`bibleit` delivers instant, private, offline retrieval across three search modes fused via Reciprocal Rank Fusion (RRF):
- **Exact Reference**: Instant verse and chapter lookups (e.g., `John 3:16`, `Genesis 1:1–31`).
- **Keyword Search**: Inverted index / BM25 lexical matching for precise phrasing.
- **Semantic Search**: Dense vector retrieval running locally in-browser via quantized embeddings, matching conceptual queries (e.g., "comfort in sorrow", "handling anxiety") without requiring exact word matches.

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

## Documentation

- [design/architecture.md](design/architecture.md) — System design, artifact contract, and component ports.
- [design/conventions.md](design/conventions.md) — Engineering standards and architectural rules.
- [design/vocabulary.md](design/vocabulary.md) — Domain definitions (references, pericopes, passages, chunks).
