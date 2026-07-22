# bibleit — Conventions (rules of the road)

1. **Components are swapped in the composition root, nowhere else.**
   Runtime ports live in `app/src/core/ports.ts`, adapters in `app/src/adapters/`,
   and only `app/src/composition.ts` may import adapters.
2. **The ingest pipeline and the app only communicate through artifacts** —
   `manifest.json` + data files. `schema_version` gates compatibility; the app
   refuses schemas newer than it knows.
3. **Query embedding model must equal the corpus embedding model.**
   Enforced at wiring time in the composition root (hard error on mismatch).
4. **Only public-domain translations get bundled.** Licensed texts (NIV, ESV,
   Segond 21…) stay out of the repo and out of the artifacts — API-only, later.
5. **Offline seams mirror runtime seams.** Python ABCs in
   `ingest/bibleit_ingest/ports.py`; a new translation or model is a new adapter
   plus a CLI flag, never an edit to the pipeline core.
