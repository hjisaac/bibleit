# bibleit — Architecture

*Status: agreed 2026-07-22. v1 = retrieval-only, fully in-browser PWA.*

## Decisions so far

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | **Fully in-browser PWA** (no backend for v1) | Corpus is tiny (~31k verses); offline mode is a killer feature for a Bible app; free static hosting |
| Ingest | **Offline Python pipeline** run on a dev machine | Embeddings precomputed once, shipped as static artifacts |
| LLM answers | **Deferred (v2)** via a swappable `AnswerProvider`. Target: **free-tier LLM APIs** (OpenRouter / Groq / Gemini free tier / GitHub Models) behind a Cloudflare Worker that holds the key; BYOK direct-from-browser as a power-user mode | Free tiers are OpenAI-compatible → one adapter covers them all; provider is Worker env config, not code |
| Translations | Public domain first: **WEB** (English), **Louis Segond 1910** (French) | Freely redistributable; schema is multi-translation from day one |
| Hosting | Static (GitHub Pages / Cloudflare Pages) | Free, CDN, HTTPS for PWA |

## Guiding principle: swappable components

Every runtime component is defined by a **TypeScript interface** in `app/src/core/ports.ts`
and wired together in exactly one place (`app/src/composition.ts`). Implementations live in
`app/src/adapters/`. Swapping a component = writing a new adapter + changing one line in the
composition root. Nothing else imports adapters directly.

The offline/runtime boundary is a **versioned artifact contract** (`manifest.json`), so the
ingest pipeline and the PWA can evolve independently as long as both speak the manifest.

## Component map & swap paths

```
OFFLINE (Python, ingest/)                      RUNTIME (TypeScript PWA, app/)
┌──────────────┐                               ┌─────────────────────────────────┐
│ TextSource   │ JSON files → api.bible later  │ ArtifactStore   (OPFS/Cache API)│
│ Chunker      │ passage windows → pericopes   │ RefParser       (no ML)         │
│ Embedder     │ MiniLM → bge-small/…          │ LexicalIndex    (BM25)          │
│ Quantizer    │ int8 → binary/float16         │ QueryEmbedder   (transformers.js│
└──────┬───────┘                               │                  → WebGPU, API) │
       ▼                                       │ VectorIndex     (brute force →  │
  artifacts/ ── manifest.json ───────────────▶ │                  HNSW-wasm)     │
  (static files on CDN)                        │ Ranker          (RRF merge)     │
                                               │ AnswerProvider  (none → Worker  │
                                               │                  → BYOK)        │
                                               └─────────────────────────────────┘
```

### Runtime ports (the seams)

| Port | v1 adapter | Swap-to if perf/quality issue |
|---|---|---|
| `ArtifactStore` | OPFS + Cache API, graceful re-download on eviction (iOS) | IndexedDB fallback |
| `RefParser` | regex + book-name tables (en/fr) | — (no perf risk) |
| `LexicalIndex` | MiniSearch (BM25), built on device from verses | prebuilt index shipped as artifact |
| `QueryEmbedder` | transformers.js, quantized MiniLM, WASM | WebGPU backend; smaller model; **remote embed endpoint** (same interface, network call) |
| `VectorIndex` | brute-force int8 dot product over typed arrays | HNSW (wasm) if corpus grows; binary embeddings + rerank |
| `Ranker` | Reciprocal Rank Fusion of ref/lexical/semantic | learned weights, cross-encoder rerank |
| `AnswerProvider` | `NullAnswerProvider` (retrieval-only UI) | `OpenAICompatAnswerProvider` (CF Worker → any OpenAI-compatible free-tier API: OpenRouter/Groq/Gemini/GitHub Models; provider = Worker env vars), `DirectAnswerProvider` (BYOK) |

Key rule for `QueryEmbedder` ⇄ `VectorIndex`: **the query model must match the corpus model.**
Both read the model id + dimensions + quantization from `manifest.json`; the composition root
refuses to wire mismatched versions. This is what makes the embedder swappable at all — change
the model in ingest, re-publish artifacts, and the runtime adapts or prompts a re-download.

### Offline ports (Python, `ingest/`)

Same idea, lighter ceremony: `TextSource`, `Chunker`, `Embedder` are small ABCs; the pipeline
is `source → chunk → embed → quantize → write artifacts`. A new translation or model is a new
adapter + a CLI flag.

## Artifact contract (`artifacts/<translation>/manifest.json`)

```json
{
  "schema_version": 1,
  "translation": {"id": "web", "lang": "en", "name": "World English Bible", "license": "public domain"},
  "corpus": {"verses": "verses.json.gz", "count": 31102},
  "chunks": {"file": "chunks.json.gz", "strategy": "window", "window": 7, "overlap": 2},
  "embeddings": {
    "file": "embeddings.i8.bin",
    "model": "Xenova/all-MiniLM-L6-v2",
    "dim": 384,
    "quantization": {"type": "int8", "scales": "scales.f32.bin"},
    "count": 6210
  }
}
```

Rules:
- `schema_version` bumps on breaking changes; the app refuses newer schemas it doesn't know.
- Verse metadata (book/chapter/verse) lives on chunks so citations stay verse-precise even
  though retrieval units are passages.
- Everything is static files → cacheable, versioned by directory (`artifacts/web@v1/`).

## Retrieval flow (v1)

1. Parse query for explicit references → exact lookups (always ranked first).
2. In parallel: BM25 over verses + semantic top-k over passage chunks.
3. RRF merge, dedupe overlapping passages, expand to ±context verses.
4. Render passages with verse citations. (`AnswerProvider.answer()` slot sits after this;
   `NullAnswerProvider` returns nothing and the UI simply shows passages.)

## Perf budgets (mid-range phone)

| Stage | Budget | v1 expectation |
|---|---|---|
| One-time download | < 45 MB | ~2 MB text + ~12 MB int8 embeddings + ~25 MB model |
| Query embed | < 400 ms | ~100–300 ms WASM |
| Vector search | < 50 ms | ~31k int8 dot products, well under |
| BM25 + merge | < 30 ms | fine |

If a budget is blown on real devices, the swap paths above are the mitigation — no rearchitecting.

## v2+ (explicitly out of scope for v1)

- `AnswerProvider` backed by a free-tier LLM API (OpenRouter / Groq / Gemini free tier /
  GitHub Models — all OpenAI-compatible, so one adapter). A ~30-line Cloudflare Worker holds
  the key and relays `/ask`; `base_url` + `model` + key are Worker env vars, so switching
  provider (or moving to a paid one) is a config change, not a deploy of the app.
  - Free-tier caveats to design for: quota is shared across all users of the deployed key →
    the Worker rate-limits and the UI degrades gracefully to retrieval-only (passages always
    render independently of the answer stream). Some free tiers train on prompts → disclose.
  - BYOK direct-browser mode as a power-user setting (same OpenAI-compatible adapter).
- More translations (re-run ingest); licensed translations only via APIs, never bundled.
- Cross-references / topical index as additional retrieval signals.
