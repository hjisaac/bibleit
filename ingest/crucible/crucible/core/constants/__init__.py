import os
import re
from pathlib import Path

WORKSPACE_ROOT = (
    Path(os.environ["CRUCIBLE_WORKSPACE_ROOT"]).resolve()
    if "CRUCIBLE_WORKSPACE_ROOT" in os.environ
    else Path(__file__).resolve().parents[4]
)
JOB_ROOT_NAMES = ("analysis", "eval")
JOBS_ROOTS = (
    [Path(os.environ["CRUCIBLE_JOBS_ROOT"]).resolve()]
    if "CRUCIBLE_JOBS_ROOT" in os.environ
    else [WORKSPACE_ROOT / name for name in JOB_ROOT_NAMES]
)
JOBS_ROOT = JOBS_ROOTS[0] if JOBS_ROOTS else WORKSPACE_ROOT / "jobs"
SUPPORTED_CONFIG_EXTENSIONS = (".yaml", ".yml")
ROOT_CONFIG_FILENAME = "root.config.yaml"

# Characters a run_id must not contain: it becomes a log and result filename,
# and override values routinely hold '/' (model names).
UNSAFE_IN_FILENAME = re.compile(r"[^A-Za-z0-9_.,=-]")
