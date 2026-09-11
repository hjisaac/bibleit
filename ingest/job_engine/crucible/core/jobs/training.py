from abc import abstractmethod
from typing import Any

from crucible.core.jobs.abstract import AbstractJob
from crucible.core.mixins.sgd import GradientDescentMixin


class AbstractTrainerJob(AbstractJob):
	"""Base class for all trainer jobs, regardless of optimization strategy."""

	def __init__(self, config) -> None:
		super().__init__(config)

	def on_prepare(self) -> None:
		self.on_prepare_data()
		self.on_prepare_model()
		self.on_prepare_metrics()

	@abstractmethod
	def on_prepare_data(self) -> None:
		pass

	@abstractmethod
	def on_prepare_model(self) -> None:
		pass

	@abstractmethod
	def on_prepare_metrics(self) -> None:
		pass

	def on_execute(self) -> Any:
		train_result = self.on_train()
		eval_result = self.on_evaluate()
		if isinstance(train_result, dict) and isinstance(eval_result, dict):
			return {**train_result, **eval_result}
		return eval_result if eval_result is not None else train_result

	@abstractmethod
	def on_train(self) -> Any:
		pass

	@abstractmethod
	def on_evaluate(self) -> Any:
		pass


class AbstractGDTrainerJob(AbstractTrainerJob, GradientDescentMixin):
	"""Trainer job that assumes gradient-descent-based optimization."""

	def on_prepare(self) -> None:
		super().on_prepare()
		self.on_prepare_optimizer()
		self.on_prepare_lr_scheduler()
