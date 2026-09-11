"""Environment-derived settings, exposed as constants (Django's settings.py style).

Jobs should import constants from this module instead of calling
``decouple.config()`` directly.
"""

from decouple import config
from dotenv import load_dotenv

load_dotenv()

# Defaulted, not required: this module is imported unconditionally by
# every AbstractJob (see jobs/abstract.py, which loads .env here before
# any job runs), so a required value with no default forced every job --
# MNIST-related or not -- to define an env var it might have nothing to
# do with. Only jobs/mlp and jobs/simple_mlp_on_mnist actually use this.
MNIST_DATA_PATH: str | None = config("MNIST_DATA_PATH", default=None)
