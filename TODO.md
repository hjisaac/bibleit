# bibleit — Production Roadmap & Task Checklist

*Tracks the remaining milestones to make bibleit 100% operational offline and online.*

---

## Phase 1: Ingest & Versioned Artifact Publishing (`ingest/`)

The offline Python pipeline prepares and quantizes static data files for the browser.

- [ ] **1.1 Canonical Corpus Export (`verses.json.gz`)**
  - Export all 31,102 verses with stable addressing: `{ book, chapter, verse, text }`.
  - Validate text encoding and versification mapping.
- [ ] **1.2 Pericope Chunking (`chunks.json.gz`)**
  - Chunk passages using pericope boundaries with book/chapter context grounding (resolving the disembodied chunk problem).
  - Target window: 100–400 tokens per chunk.
- [ ] **1.3 Embedding Generation & int8 Quantization (`embeddings.i8.bin`)**
  - Embed chunks with `Xenova/all-MiniLM-L6-v2` (384 dimensions).
  - Quantize float32 vectors to int8 with per-vector or per-matrix scale factors (`scales.f32.bin`).
- [ ] **1.4 Manifest Publishing (`manifest.json`)**
  - Output schema version 1 metadata matching `design/architecture.md`.
  - Place outputs in `app/public/artifacts/web@v1/` for local dev testing.

---

## Phase 2: Offline Runtime Adapters (`app/src/adapters/`)

Replace `MockSearchEngine` with the real, local on-device retrieval engine.

- [ ] **2.1 Scripture Reference Parser (`RegexRefParser`)**
  - Parse canonical citations without ML (e.g., `"John 3:16"`, `"Gen 1:1-3"`, `"Ps 23"`).
  - Support English and French book names and common abbreviations.
- [ ] **2.2 Persistent Offline Storage (`OpfsArtifactStore`)**
  - Download and cache artifacts using Origin Private File System (OPFS) and Cache API.
  - Implement cache eviction recovery and "Free Up Space" clearance.
- [ ] **2.3 In-Browser BM25 Keyword Search (`MiniSearchLexicalIndex`)**
  - Build or hydrate in-memory MiniSearch index over verses.
  - Implement term matching with hit offsets for highlight rendering.
- [ ] **2.4 Query Embedding in Web Worker (`TransformersQueryEmbedder`)**
  - Run `@xenova/transformers` with ONNX Runtime WASM/WebGPU.
  - Offload embedding to a Web Worker to keep the UI at 60 FPS.
- [ ] **2.5 Fast TypedArray Vector Search (`BruteForceVectorIndex`)**
  - Implement int8 dot-product search over chunk matrix in typed arrays (<15ms for 6k vectors).
- [ ] **2.6 Signal Fusion (`RrfRanker`)**
  - Combine Reference, Lexical, and Semantic scores using Reciprocal Rank Fusion (RRF).
- [ ] **2.7 Local Engine Wiring (`composition.ts`)**
  - Connect all 6 adapters into `buildLocalEngine()` and verify end-to-end in browser.

---

## Phase 3: Online Superpowers & Hybrid RAG

Enhance search with online LLM generation when connected.

- [ ] **3.1 Streaming LLM Answer Provider (`WorkerAnswerProvider`)**
  - Implement `AnswerProvider` port via Cloudflare Worker proxying free-tier LLM APIs (Gemini, Claude, Groq).
  - Stream grounded explanations citing retrieved verses token-by-token.
- [ ] **3.2 Graceful Offline Degradation**
  - When offline or network fails, set `answers.available = false` and display scripture cards cleanly without latency.
- [ ] **3.3 Optional Remote Search Adapter (`RemoteSearchEngine`)**
  - Implement HTTP search client for server-hosted Qdrant/FastAPI instance.
  - Allow user to toggle between Local Engine (OPFS) and Remote Engine in Settings.

---

## Phase 4: Reader Expansion & Production Polish

- [x] **4.1 Book & Chapter Selector Drawer & Quick Navigator**
  - Canonical 66-book definitions (`app/src/core/bible-books.ts`) with OT/NT grouping.
  - 2-tap selection modal (`BookSelectorModal.tsx`) accessible from search bar and reader header.
  - Live as-you-type chapter navigator strip in search view.
- [ ] **4.2 Continuous Chapter Reading & Scrolling**
  - Allow infinite scrolling or previous/next chapter navigation in Reader View.
- [ ] **4.3 Production PWA Assets**
  - Replace placeholder icon references with generated SVG and PNG icons (`favicon.ico`, `pwa-192x192.png`, `pwa-512x512.png`).
  - Verify PWA installability prompt on iOS Safari and Android Chrome.
