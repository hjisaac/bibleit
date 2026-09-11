# RunCrucible — Framework Internals

Contributor guide. Usage docs: [docs/README.md](../docs/README.md). User jobs live in `jobs/<name>/` (see `core/constants/JOBS_ROOT`).

## Layout

```text
crucible/
├── core/           # jobs, runtime, config, handlers, trackers, mixins, constants, utils
├── plugins/ml/     # reusable ML modules (models, optimizers) — not jobs
├── interface/cli/  # Typer CLI, scaffolding, templates
└── tests/
```

## Runtime

`run_named_job()` → discover class → load config + overrides → `job.execute()`.

## Job classes

- `AbstractJob` — `on_prepare()`, `on_execute()`; `execute()` runs the full hook chain
- `AbstractTrainerJob` — `on_prepare_data/model/metrics`, `on_train()`, `on_evaluate()`
- `AbstractGDTrainerJob` — adds optimizer and LR scheduler setup

Hooks: `on_start` → `on_prepare` → `on_track` → `on_execute` → `on_finalize` / `on_fail` → `on_teardown`

## Testing

```bash
uv run pytest
```
