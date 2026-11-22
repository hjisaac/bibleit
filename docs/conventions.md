# bibleit: Conventions (rules of the road)

1. **Components are swapped in the composition root, nowhere else.**
   Runtime ports live in `app/src/core/ports.ts`, adapters in `app/src/adapters/`,
   and only `app/src/composition.ts` may import adapters.
2. **The ingest pipeline and the app only communicate through artifacts**:
   `manifest.json` + data files. `schema_version` gates compatibility; the app
   refuses schemas newer than it knows.
3. **Query embedding model must equal the corpus embedding model.**
   Enforced at wiring time in the composition root (hard error on mismatch).
4. **Only public-domain translations get bundled.** Licensed texts (NIV, ESV,
   Segond 21...) stay out of the repo and out of the artifacts: API-only, later.
5. **Offline seams mirror runtime seams.** Python ABCs in
   `ingest/rag_core/`; a new translation or model is a new adapter
   plus a CLI flag, never an edit to the pipeline core.
6. **UI chrome localization is separated from Scripture translations.**
   UI strings use `@nanostores/i18n` with component-scoped keys and lazy-loaded catalogs (`app/src/locales/`). Canonical Scripture texts, pericopes, and book names stay bound to version-gated artifacts. See [docs/i18n.md](file:///home/hjisaac/Devs/bibleit/docs/i18n.md).
7. **Storage namespacing and versioning are decoupled from app shell releases.**
   Storage keys follow `bibleit:<category>:<identity>` across browser storage tiers:
   - **App Shell**: `bibleit-shell-v{appVersion}` (Cache API; managed by Service Worker, pruned on SW activate).
   - **Scripture Text**: `bibleit-books-{translation}@{contentHash}` (Cache API; 8-char CRC32 over book manifest checksums — not a git commit hash).
   - **Artifacts & Vectors**: `bibleit-artifacts-{translation}@{version}` (OPFS; e.g. chunks, embeddings).
   - **User Activity**: `bibleit:activity:*` (localStorage/IDB; saved verses, reading state, history). Never automatically pruned.
   - **Preferences**: `bibleit:pref:*` (localStorage; theme, locale, search mode).
   - **UI State**: `bibleit:ui:*` (localStorage; active tab, ephemeral search state).

