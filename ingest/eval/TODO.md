# Eval TODO

## Done: Template Method lifecycle for eval jobs

Was planned here as a standalone `eval/harness.py`/`EvalRun` ABC (see
git history for the original entry). Landed differently in practice:
run-crucible got vendored in as first-party code at `ingest/job_engine`
(no longer a submodule), and `eval/job.py`'s `EvalJob(AbstractJob)` is
the actual result -- a second, bibleit-owned template layer on top of
crucible's lifecycle, handling REPO-relative config paths, the W&B
tracker, and saving/tracking the result generically. A new eval job
only needs `on_prepare`/`on_execute`; see
`job_engine/jobs/question_to_passage_eval/job.py` for the reference
shape.
