# RunCrucible

From paper or idea to runnable experiment with minimal friction — a composable Python job runner with dynamic job discovery, Hydra config overrides, and a Typer CLI.

I designed RunCrucible to speed up how I explore AI/ML: testing research ideas, trying methods from a paper, or learning a technique — a robust, low-effort path from sketch to runnable job.

## Vocabulary

RunCrucible uses three words, each with exactly one meaning:

- **Job** — the unit of work you author: a Python package under `jobs/<name>/` containing a `Job` class.
- **Run** — a single execution of a job. Each run gets a unique `run_id` and its own log file.
- **`execute`** (the CLI verb) — execute a job (produces one run).

Reusable ML building blocks (models, optimizers, schedulers) live in `crucible/plugins/ml/` and are never jobs themselves.

## Quick Start

```bash
uv sync
uv run crucible list
uv run crucible execute mlp
```

Requires Python 3.11+ (driven by dependencies such as numpy). [uv](https://docs.astral.sh/uv/) is recommended for install and runs.

## CLI

```bash
uv run crucible list
uv run crucible execute <job> --config default -o log_console_level=DEBUG
uv run crucible create <name> --kind job      # plain job
uv run crucible create <name> --kind trainer  # trainer scaffold
uv run crucible create <name> --kind job --force
```

Direct commands (e.g. `uv run crucible mlp`) are still supported.

## Job Lifecycle Hooks

The design is inspired by React and Vue component lifecycle hook patterns. The runtime calls `job.execute()`; the "framework" owns the order, you implement the hooks:

```text
execute()
  ├─ on_start()        # optional — banners, config validation
  ├─ on_prepare()      # required — build state on self (data, paths, clients)
  ├─ on_track()        # optional — attach self.tracker
  ├─ try:
  │    result = on_execute()   # required — main work; return a small result dict
  │    on_finalize(result)     # optional — save artifacts, log summaries
  ├─ except:
  │    on_fail(exc)            # optional — react to errors
  └─ finally:
       on_teardown()           # always — close tracker, release resources
```

**Data flow:** read from `self.config` during prepare; write runtime state on `self`; return a serializable `result` from `on_execute()`.

**Plain job** — implement `on_prepare()` and `on_execute()`.

**Trainer job** (`AbstractTrainerJob`) — `on_prepare()` delegates to `on_prepare_data()`, `on_prepare_model()`, and `on_prepare_metrics()`; `on_execute()` runs `on_train()` then `on_evaluate()`.

## Authoring a Job

Scaffold with `crucible create`, or add a package under `jobs/<name>/` manually:

- `__init__.py` — export `Job` or `JOB_CLASS`
- `job.py` — concrete `AbstractJob` subclass
- `configs/default.yaml` — run config

```python
from crucible.core.jobs import AbstractJob


class Job(AbstractJob):
    def on_prepare(self) -> None:
        self.data = {"status": "ready"}

    def on_execute(self):
        return {"status": "ok"}


JOB_CLASS = Job
```

Templates live in `crucible/interface/cli/templates/` and can be customized without editing CLI code. For internal structure, see [crucible/README.md](../crucible/README.md).

## Testing

```bash
uv run pytest
```

## Notes

- Logging config keys: `log_dir`, `log_console_level`, `log_file_level`.
- Experiment tracking: `crucible/core/trackers/wandb.py`.
