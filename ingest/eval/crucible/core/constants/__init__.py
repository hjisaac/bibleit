import os
import re
from pathlib import Path

# Name of the directory that holds user-authored jobs (can be changed for custom setups).
JOBS_ROOT_NAME = "jobs"

# Workspace-level jobs folder discovered by the runtime and CLI scaffolding.
# Defaults to a "jobs" directory next to this package, but a consumer using
# crucible as a dependency (rather than working inside this repo directly)
# can point it at their own jobs directory instead, so their job code lives
# in their own project rather than inside crucible's own source tree.
JOBS_ROOT = (
    Path(os.environ["CRUCIBLE_JOBS_ROOT"]).resolve()
    if "CRUCIBLE_JOBS_ROOT" in os.environ
    else Path(__file__).resolve().parents[3] / JOBS_ROOT_NAME
)
SUPPORTED_CONFIG_EXTENSIONS = (".yaml", ".yml")
ROOT_CONFIG_FILENAME = "root.config.yaml"

# Characters a run_id must not contain: it becomes a log and result filename,
# and override values routinely hold '/' (model names).
UNSAFE_IN_FILENAME = re.compile(r"[^A-Za-z0-9_.,=-]")
