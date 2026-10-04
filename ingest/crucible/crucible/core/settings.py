# Loads .env once, on first import, so every job has WANDB_API_KEY (and
# anything else it needs) in os.environ before it runs. Imported by
# jobs/abstract.py for exactly this side effect.
from dotenv import load_dotenv

load_dotenv()
