from crucible.core.jobs import AbstractJob


class Job(AbstractJob)
	def on_prepare(self) -> None:
		self.data = {{"status": "ready"}}

	def on_execute(self) -> dict[str, str]:
		return {{"status": "ok", "job": "{job_name}"}}


JOB_CLASS = Job
