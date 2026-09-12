# Eval TODO

## Done: Template Method lifecycle for eval jobs

Was planned here as a standalone `eval/harness.py`/`EvalRun` ABC (see
git history for the original entry). Landed differently in practice:
run-crucible got vendored in as first-party code (no longer a
submodule), and `eval/job.py`'s `EvalJob(AbstractJob)` is the actual
result -- a second, bibleit-owned template layer on top of crucible's
lifecycle, handling REPO-relative config paths, the W&B tracker, and
saving/tracking the result generically. A new eval job only needs
`on_prepare`/`on_execute`; see
`eval/jobs/question_to_passage_eval/job.py` for the reference shape.
Everything eval-related -- this file, crucible's vendored code, and
discovered job packages -- lives together under `eval/`, one
directory, not two.
