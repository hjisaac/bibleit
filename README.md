# bibleit

Offline-first Bible search PWA — hybrid retrieval (reference / keyword / semantic)
running fully in the browser. Optional LLM answers later via a swappable provider.

## Docs

- [design/architecture.md](design/architecture.md) — decisions, component map, swap paths, perf budgets
- [design/conventions.md](design/conventions.md) — rules of the road

## Layout

- **`app/`** — TypeScript PWA. Ports in `src/core/ports.ts`, adapters in
  `src/adapters/`, wiring in `src/composition.ts`.
- **`ingest/`** — Offline Python pipeline: Bible JSON → chunks → embeddings →
  quantized static artifacts consumed by the app.
