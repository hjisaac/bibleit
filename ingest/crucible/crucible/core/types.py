from enum import Enum
from typing import Literal

OnError = Literal["raise", "record"]


class RunState(Enum):
	COMPLETE = "complete"
	FAILED = "failed"
