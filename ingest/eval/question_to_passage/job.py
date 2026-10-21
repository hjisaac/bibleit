import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from codetiming import Timer
from tqdm import tqdm

from bibleit_ingest.artifacts import (
    read_lock_file,
    resolve_matching_artifacts,
    write_lock_file,
)
from bibleit_ingest.chunking import get_chunker
from bibleit_ingest.constants import (
    BSB_DIR,
    FASTEMBED_CACHE_DIR,
    REPO,
    EmbeddingModel,
)
from bibleit_ingest.embedding import Embedder
from bibleit_ingest.helpers import trigger_retrieval_eval
from bibleit_ingest.pericopes import get_or_prepare_corpus
from bibleit_ingest.renderers import get_renderer
from bibleit_ingest.report import format_passage, generate_retrieval_report
from bibleit_ingest.types import Passage
from eval.job import EvalJobBase

logger = logging.getLogger(__name__)


class EvalJobQuestionToPassage(EvalJobBase):
    path_config_keys = (
        "eval_data_path",
        "web_path",
    )

    def _make_slug(self) -> str:
        k = self.config.get("k", 1)
        f = self.config.get("floor", 5)
        c = self.config.get("ceiling", 30)
        model = str(self.config.get("embedding_model", "nomic"))
        model_short = "nomic" if "nomic" in model else model.split("/")[-1]
        return f"k{k}_f{f}_c{c}_{model_short}"

    def on_start(self) -> None:
        super().on_start()
        logger.info("=== Starting run [%s] ===", self.run_id)

    def on_prepare(self) -> dict:
        k = int(self.config.get("k", 1))
        floor = int(self.config.get("floor", 5))
        ceiling = int(self.config.get("ceiling", 30))
        overlap = int(self.config.get("overlap", 0))
        render_strategy = str(self.config.get("render_strategy", "heading_and_text"))
        embedding_model = EmbeddingModel(self.config["embedding_model"])
        self.config["chunk_source_model"] = str(embedding_model)

        corpus, pericopes = get_or_prepare_corpus(self.web_path, BSB_DIR)

        # 1. Resolve embedding artifact (explicit override, or auto-match from embed_corpus)
        emb_dir_override = self.config.get("embedding_artifact_dir")
        if emb_dir_override:
            emb_run_dir = Path(emb_dir_override)
            if not emb_run_dir.exists():
                raise FileNotFoundError(f"Specified embedding_artifact_dir does not exist: {emb_dir_override}")
        else:
            emb_run_dir = None

        if "strategy" not in self.config:
            raise KeyError("Missing required 'strategy' parameter in evaluation configuration")
        strategy_name = str(self.config["strategy"])
        if not emb_run_dir:
            emb_outputs = REPO / "ingest" / "analysis" / "embed_corpus" / "outputs"
            emb_criteria = {
                "strategy": strategy_name,
                "ceiling": ceiling,
                "overlap": overlap,
                "render_strategy": render_strategy,
                "embedding_model": str(embedding_model),
            }
            if strategy_name == "adaptive" and floor is not None:
                emb_criteria["floor"] = int(floor)
            if "include_overlap_heading" in self.config:
                emb_criteria["include_overlap_heading"] = bool(self.config["include_overlap_heading"])
            emb_run_dir = resolve_matching_artifacts(emb_outputs, emb_criteria)

        if (
            not emb_run_dir
            or not (emb_run_dir / "embeddings.npy").exists()
            or not (emb_run_dir / "chunks.json").exists()
        ):
            raise FileNotFoundError(
                f"No matching embedding artifact found in {emb_outputs} for criteria: {emb_criteria}"
            )

        logger.info("Found matching upstream embedding artifact at %s", emb_run_dir)
        upstream_lock_meta: dict[str, Any] = {}
        if (emb_run_dir / "config.lock.yaml").exists():
            upstream_lock_meta = read_lock_file(emb_run_dir / "config.lock.yaml")

        chunk_embeddings = np.load(emb_run_dir / "embeddings.npy")
        raw_meta = json.loads((emb_run_dir / "chunks.json").read_text(encoding="utf-8"))
        chunks: list[Passage] = []
        for item in raw_meta:
            book = item["book"]
            if "start" in item:
                ch_s, v_s = item["start"]
                ch_e, v_e = item["end"]
            elif "start_addr" in item:
                ch_s, v_s = item["start_addr"]
                ch_e, v_e = item["end_addr"]
            else:
                ch_s, v_s = item["chapter"], item["verse"]
                ch_e, v_e = ch_s, v_s + item["verse_count"] - 1

            headings = []
            headings_raw = item.get("headings", [])
            if headings_raw and isinstance(headings_raw[0], (list, tuple)):
                for ch, v, h in headings_raw:
                    headings.append((int(ch), int(v), str(h)))
            elif "sections" in item:
                for s in item["sections"]:
                    headings.append((int(s["chapter"]), int(s["verse"]), str(s["heading"])))
            elif headings_raw and isinstance(headings_raw[0], str):
                for h in headings_raw:
                    headings.append((int(ch_s), int(v_s), str(h)))

            chunks.append(
                Passage(
                    book=book,
                    start=(ch_s, v_s),
                    end=(ch_e, v_e),
                    headings=tuple(headings),
                )
            )

        assert len(chunks) == chunk_embeddings.shape[0], (
            f"chunks count ({len(chunks)}) != embedding rows ({chunk_embeddings.shape[0]})"
        )
        logger.info("Loaded %d embedded chunks (strategy=%s)", len(chunks), render_strategy)

        # 2. Query embedder
        threads = int(self.config.get("threads", 4))
        embedder = Embedder(
            model_name=embedding_model,
            cache_dir=str(FASTEMBED_CACHE_DIR),
            threads=threads,
        )

        # Batch embed eval queries for instant lookup instead of single-item inferences
        eval_data = json.loads(self.eval_data_path.read_text())
        q_texts = [q["query"] for q in eval_data["queries"]]
        with Timer(text=f"Embedded {len(q_texts)} queries in {{:.1f}}s", logger=logger.info):
            q_vecs = list(
                tqdm(
                    embedder.embed_queries(q_texts, batch_size=4),
                    total=len(q_texts),
                    desc="embedding queries",
                    unit="query",
                )
            )
        query_map = {q["query"]: vec for q, vec in zip(eval_data["queries"], q_vecs)}

        return {
            "k": k,
            "chunks": chunks,
            "corpus": corpus,
            "chunk_embeddings": chunk_embeddings,
            "embedder": embedder,
            "query_map": query_map,
            "upstream_lock": upstream_lock_meta,
        }

    def on_execute(self, prepared: dict) -> dict:
        return trigger_retrieval_eval(
            eval_path=self.eval_data_path,
            chunks=prepared["chunks"],
            chunk_embeddings=prepared["chunk_embeddings"],
            corpus=prepared["corpus"],
            embed_query_fn=lambda q: prepared["query_map"].get(q, prepared["embedder"].embed_query(q)),
            k=prepared["k"],
        )

    def on_finalize(self, prepared: dict, result: dict) -> None:
        diagnostics = result.pop("diagnostics", [])
        if diagnostics:
            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                renderer=lambda idx: format_passage(prepared["chunks"][idx], prepared["corpus"]),
                metrics=result.get("metrics", {}),
                params={
                    "k": self.config.get("k", 1),
                    "floor": self.config.get("floor", 5),
                    "ceiling": self.config.get("ceiling", 30),
                    "overlap": self.config.get("overlap", 0),
                    "render_strategy": self.config.get("render_strategy", "heading_and_text"),
                    "embedding_model": self.config.get("embedding_model"),
                },
                out_path=report_path,
            )
            result["report_path"] = str(report_path)
            preview = "\n".join(report_path.read_text().splitlines()[:6])
            logger.info("Saved report to %s:\n%s\n...", report_path, preview)
            if self.tracker is not None:
                self.tracker.track_artifact(report_path, name="retrieval-report", type="artifact-outputs")

        # Write immutable lock file for evaluation artifact
        lock_data = {
            "stage": "evaluation",
            "parameters": {
                "k": int(self.config.get("k", 1)),
                "floor": int(self.config.get("floor", 5)),
                "ceiling": int(self.config.get("ceiling", 30)),
                "overlap": int(self.config.get("overlap", 0)),
                "render_strategy": str(self.config.get("render_strategy", "heading_and_text")),
                "embedding_model": str(self.config.get("embedding_model")),
            },
            "output": {
                "metrics": result.get("metrics", {}),
                "total_queries": result.get("total_queries", 0),
                "resolvable": result.get("resolvable", 0),
            },
            "upstream": prepared.get("upstream_lock", {}),
        }
        write_lock_file(self.run_dir / "config.lock.yaml", lock_data)
        logger.info("Saved evaluation artifact with lock to %s", self.run_dir)

        super().on_finalize(prepared, result)


JOB_CLASS = EvalJobQuestionToPassage
