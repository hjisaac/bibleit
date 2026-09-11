import logging
import sys
from pathlib import Path

if __package__ is None or __package__ == "":
	# Supports direct execution: python jobs/mlp/job.py
	sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


from crucible.core.jobs import AbstractJob
from crucible.core.settings import MNIST_DATA_PATH
import torch
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from crucible.plugins.ml.models.mlp import MLP


logger = logging.getLogger(__name__)


class Job(AbstractJob):
	"""Train a simple MLP on MNIST."""

	def on_prepare(self) -> None:
		transform = transforms.Compose([
			transforms.ToTensor(),
			transforms.Lambda(lambda x: x.view(-1))
		])
		self.train_dataset = datasets.MNIST(
			root=MNIST_DATA_PATH, train=True, download=True, transform=transform
		)
		self.valid_dataset = datasets.MNIST(
			root=MNIST_DATA_PATH, train=False, download=True, transform=transform
		)

	def on_execute(self) -> dict[str, str]:
		device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
		model = MLP().to(device)
		train_loader = DataLoader(self.train_dataset, batch_size=64, shuffle=True)
		optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
		criterion = torch.nn.CrossEntropyLoss()

		model.train()
		for epoch in range(1, 3):  # 2 epochs for demo
			total_loss = 0.0
			for batch_idx, (data, target) in enumerate(train_loader):
				data, target = data.to(device), target.to(device)
				optimizer.zero_grad()
				output = model(data)
				loss = criterion(output, target)
				loss.backward()
				optimizer.step()
				total_loss += loss.item()
			avg_loss = total_loss / len(train_loader)
			logger.info(f"Epoch {epoch}: avg loss = {avg_loss:.4f}")

		model.eval()
		test_loader = DataLoader(self.valid_dataset, batch_size=256)
		correct = 0
		total = 0
		with torch.no_grad():
			for data, target in test_loader:
				data, target = data.to(device), target.to(device)
				output = model(data)
				pred = output.argmax(dim=1)
				correct += (pred == target).sum().item()
				total += target.size(0)
		accuracy = correct / total
		logger.info(f"Test accuracy: {accuracy:.4f}")
		return {"status": "ok", "accuracy": f"{accuracy:.4f}"}


JOB_CLASS = Job
