# bibleit — Agent Instructions

## Project Overview
`bibleit` is an offline-first Bible search Progressive Web App (PWA) with hybrid retrieval:
- **Reference search**: Exact book/chapter/verse lookups (e.g., *John 3:16*).
- **Keyword search**: Lexical / full-text search (BM25 or client inverted index).
- **Semantic search**: Dense vector search running locally/offline via embeddings and ONNX Runtime.

The codebase was restarted from a pre-adapter checkpoint (`design/architecture.md`, `design/conventions.md`, `design/vocabulary.md`) so the user can re-derive and own the architecture.

---

## Agent Role & Behavior (Non-Negotiable)

### Socratic Learning Mode
The user is building this project to learn by doing and to have full ownership of the codebase.
- **Do not write implementation code or architecture autonomously.** Do not do the thinking for the user. Propose questions, probe assumptions, point out trade-offs, and guide.
- **Do not execute builds, installs, downloads, or run scripts on the user's behalf.** Provide the exact command with a brief explanation so the user can run it in their own terminal.
- **Read-only investigation is encouraged**: Inspecting files, running read diagnostics, and checking git status are fine.
- **Scaffolding on request**: Creating empty or minimal files requested by the user is fine, but do not pre-fill logic meant for the user's derivation.

---

## Code Quality & Engineering Standards

### 1. Quality Over Volume (Avoid Code Bloat)
- We strictly prioritize **code quality over volume**. Never generate unnecessary lines of code, boilerplate, or over-engineered abstractions.
- **Lean Job Hooks**: Crucible job files (`job.py`) are orchestrators, not data transformers. Keep lifecycle hooks (`on_prepare`, `on_execute`, `on_finalize`) concise and focused (~10–20 lines max).
- **Domain Logic Belongs in Domain Modules**: Heavy serialization, file I/O, or data processing belongs in reusable functions in `bibleit_ingest`, never inlined into job hooks.
- **Do Not Duplicate Canonical Data**: Avoid writing duplicate copies of the entire Bible text into output files when IDs or verse pointers already map canonically to source data.

### 2. Concise Comments
- Keep comments short and focused: **1–2 lines max** stating the non-obvious *why*.
- Avoid multi-line paragraphs, restating what the code does, or elaborating on alternatives.
- If a comment takes more than 2 lines, the code itself should be made clearer.

### 3. No Module Docstrings
- Do not write file-level (`"""..."""`) module docstrings in Python files. They go stale and will not be maintained.
- Class and function docstrings are allowed where useful, but keep them concise.

### 4. Protect Vendored Code (`crucible/`)
- `ingest/eval/crucible/` is vendored external tooling.
- **Never** style-groom, reformat, or trim comments in `crucible/`. Only edit it for functional bug fixes or explicit user requests.

### 5. Swappable & Lightweight Experiment Tracking
- Weights & Biases (W&B) is not a hard lock-in. Any similar metrics/artifact tracker is acceptable.
- **No heavy artifacts to remote trackers**: Never upload large files (embeddings matrices, raw text corpora) to W&B. Only track lightweight summaries (run JSON, summary metrics, small plots).
- **Heavy files stay on disk**: Data files (`embeddings.npy`, chunk metadata) remain strictly on local disk within their isolated run directories (`outputs/{slug}/`).
- **Let trackers handle tooling concerns**: Do not write bespoke subprocess calls to fetch git commits, branches, or machine info; remote trackers capture environment provenance automatically.

### 6. Clean Typings & Constants Separation
- `constants` modules must hold only true runtime immutable values (paths, filenames, regexes).
- Types, type aliases (`Literal`, `TypeVar`), and Enums must never be placed in `constants/`; place them in dedicated `types.py` modules or scope them directly to the domain package that uses them.

---

## Repository Structure & Architecture

- `app/`: Astro + TypeScript client application.
  - Hexagonal architecture: Ports live in `app/src/core/ports.ts`, adapters live in `app/src/adapters/`.
  - **Composition root**: Only `app/src/composition.ts` may import adapters and wire dependencies.
- `ingest/`: Python data preparation pipeline (`bibleit_ingest`).
  - USFM parsing, pericope extraction, verse addressing, chunking strategies, and embedding generation.
  - Ingest and the client app communicate strictly via versioned artifacts (`manifest.json` + data files).
- `ingest/eval/`: Experiment runner and benchmark evaluation.
  - Powered by Crucible: `crucible execute <job>`.
  - Config-driven execution: scalar values produce a single run; lists in YAML trigger multi-axis sweeps.
- `design/`: Architectural documents, domain vocabulary (`vocabulary.md`), and conventions (`conventions.md`).

---

## Key Conventions
1. **Query model must match corpus model**: Query embedding model must equal the corpus embedding model at wiring time.
2. **Public-domain translations only**: Bundled texts must be public domain (BSB, WEB).
3. **Artifact seams**: The ingest pipeline and the frontend app only communicate through version-gated artifacts.
