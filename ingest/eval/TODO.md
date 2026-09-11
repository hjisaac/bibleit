# Eval TODO

## Extract a small Template Method lifecycle for eval scripts

`question_to_passage_eval.py`'s `main()` mixes two things: the actual eval
logic (one call to `trigger_eval`) and scaffolding that has nothing to do
with this specific eval (generate a run id, set up a logger, build a
results dict, write it to JSON). That scaffolding would be duplicated
verbatim in every future eval script.

Checked whether an existing library already provides this (a minimal
prepare/execute/finalize lifecycle) before deciding to write it: nothing
fits without dragging in something much bigger built for a different
job (Kedro/Hamilton = full pipeline/DAG frameworks, Luigi/Prefect/Airflow
= task scheduling, pytest/unittest = test pass/fail semantics). No
standalone "Template Method as a package" exists either, on PyPI or
GitHub - the pattern is small enough that everyone who wants it just
writes it (run-crucible's own version is ~15 lines).

Planned shape: `eval/harness.py`, an `EvalRun` ABC (`on_prepare`,
`on_execute`, `on_finalize`), mirroring run-crucible's `AbstractJob`
structure. Each eval script becomes one subclass; `run()` handles the
run id, logger, and handing `on_execute`'s result to `on_finalize`.
Full sketch worked out in conversation; not yet applied to any file.
