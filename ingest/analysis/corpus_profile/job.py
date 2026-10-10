import logging
from pathlib import Path
from typing import Any

from analysis.corpus_profile.plots import generate_corpus_plots
from analysis.corpus_profile.profile import profile_corpus
from analysis.job import AnalysisJobBase
from bibleit_ingest.constants import FASTEMBED_CACHE_DIR
from bibleit_ingest.embedding import FastEmbedder
from bibleit_ingest.pericopes import get_or_prepare_corpus

logger = logging.getLogger(__name__)


class AnalysisJobCorpusProfile(AnalysisJobBase):
    path_config_keys = ("web_path", "bsb_dir")

    def on_prepare(self) -> dict:
        corpus = get_or_prepare_corpus(self.web_path, self.bsb_dir)
        tok_model_name = self.config.get("tokenizer_model", "nomic-ai/nomic-embed-text-v1.5")
        embedder = FastEmbedder(model_name=tok_model_name, cache_dir=str(FASTEMBED_CACHE_DIR))
        return {"corpus": corpus, "tokenizer": embedder.raw_model.model.tokenizer}

    def on_execute(self, prepared: dict) -> dict[str, Any]:
        limit = int(self.config.get("token_limit", 512))
        return profile_corpus(prepared["corpus"], prepared["tokenizer"], token_limit=limit)

    def on_finalize(self, prepared: dict, result: dict[str, Any]) -> None:
        token_limit = int(self.config.get("token_limit", 512))
        plot_paths = generate_corpus_plots(
            result["verse_records"],
            result["pericope_records"],
            self.run_dir,
            token_limit=token_limit,
        )
        if self.tracker is not None:
            for name, path in plot_paths.items():
                self.tracker.track_artifact(path, name=name, type="plot")

        filtered = {k: v for k, v in result.items() if not k.endswith("_records")}
        super().on_finalize(prepared, filtered)


Job = AnalysisJobCorpusProfile
JOB_CLASS = AnalysisJobCorpusProfile
