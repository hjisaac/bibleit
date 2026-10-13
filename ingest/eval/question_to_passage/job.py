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
from bibleit_ingest.chunking import AdaptiveWindowChunker, resolve_verse_to_chunk_index
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

        corpus = get_or_prepare_corpus(self.web_path, BSB_DIR)

        # 1. Resolve embedding artifact (explicit override, or auto-match from embed_corpus)
        emb_dir_override = self.config.get("embedding_artifact_dir")
        emb_run_dir = Path(emb_dir_override) if emb_dir_override else None

        if not emb_run_dir:
            emb_outputs = REPO / "ingest" / "analysis" / "embed_corpus" / "outputs"
            emb_criteria = {
                "floor": floor,
                "ceiling": ceiling,
                "overlap": overlap,
                "render_strategy": render_strategy,
                "embedding_model": str(embedding_model),
            }
            emb_run_dir = resolve_matching_artifacts(emb_outputs, emb_criteria)

        chunks: list[Passage]
        chunk_embeddings: Any
        upstream_lock_meta: dict[str, Any] = {}

        if emb_run_dir and (emb_run_dir / "embeddings.npy").exists() and (emb_run_dir / "chunks.json").exists():
            if (emb_run_dir / "config.lock.yaml").exists():
                upstream_lock_meta = read_lock_file(emb_run_dir / "config.lock.yaml")
            import numpy as np

            chunk_embeddings = np.load(emb_run_dir / "embeddings.npy")
            raw_meta = json.loads((emb_run_dir / "chunks.json").read_text(encoding="utf-8"))
            chunks = []
            for item in raw_meta:
                start_idx = corpus.address_index[(item["book"], item["chapter"], item["verse"])]
                sections = []
                for s in item.get("sections", []):
                    sec_idx = corpus.address_index.get((item["book"], s["chapter"], s["verse"]), start_idx)
                    sections.append((sec_idx, s["heading"]))
                if not sections and "headings" in item:
                    sections = [(start_idx, h) for h in item["headings"]]
                chunks.append(
                    Passage(
                        book=item["book"],
                        start_idx=start_idx,
                        end_idx=start_idx + item["verse_count"],
                        sections=tuple(sections),
                    )
                )
        else:
            logger.info("No matching embedding artifact found; computing in-line.")
            chunks = AdaptiveWindowChunker(
                ordered_verses=corpus.ordered_verses,
                address_index=corpus.address_index,
                floor=floor,
                ceiling=ceiling,
                overlap=overlap,
            ).chunk(corpus.pericopes)

            threads = int(self.config.get("threads", 4))
            embedder = Embedder(
                model_name=embedding_model,
                cache_dir=str(FASTEMBED_CACHE_DIR),
                threads=threads,
            )
            renderer = get_renderer(
                render_strategy,
                ordered_verses=corpus.ordered_verses,
                address_index=corpus.address_index,
            )
            texts = (renderer.render(chunk) for chunk in chunks)
            batch_size = int(self.config.get("batch_size", 16))
            with Timer(
                text=f"Embedded {len(chunks)} chunks in {{:.1f}}s", logger=logger.info
            ):
                chunk_embeddings = np.array(
                    list(
                        tqdm(
                            embedder.embed_documents(texts, batch_size=batch_size),
                            total=len(chunks),
                            desc=f"embedding chunks [{render_strategy}]",
                            unit="chunk",
                        )
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
            "address_index": corpus.address_index,
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
            address_index=prepared["address_index"],
            embed_query_fn=lambda q: prepared["query_map"].get(q, prepared["embedder"].embed_query(q)),
            k=prepared["k"],
        )

    def on_finalize(self, prepared: dict, result: dict) -> None:
        diagnostics = result.pop("diagnostics", [])
        if diagnostics:
            report_path = self.run_dir / "retrieval_inspect.md"
            generate_retrieval_report(
                diagnostics=diagnostics,
                renderer=lambda idx: format_passage(prepared["chunks"][idx], prepared["corpus"].ordered_verses),
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
