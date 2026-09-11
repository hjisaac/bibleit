from abc import ABCMeta, abstractmethod


class GradientDescentMixin(metaclass=ABCMeta):
	"""Mixin for gradient-descent-based training: optimizer and lr scheduler setup."""

	@abstractmethod
	def on_prepare_optimizer(self) -> None:
		"""Initialize the optimizer (e.g. SGD, Adam, Muon)."""
		pass

	@abstractmethod
	def on_prepare_lr_scheduler(self) -> None:
		"""Initialize the learning rate scheduler (e.g. cosine, step)."""
		pass
