from pathlib import Path

import numpy as np
import typer

from bibleit_ingest.artifacts import (
    load_chunks_artifact,
    load_embedding_run,
    read_lock_file,
    resolve_matching_artifacts,
)
from bibleit_ingest.constants import APP_DATA_DIR, EMBED_CORPUS_OUTPUTS, QUERY_PREFIX, REPO, WEB_PATH
from bibleit_ingest.sinks import StaticArtifactSink
from bibleit_ingest.types import BookCorpus
from bibleit_ingest.walkers import WebCorpusWalker

app = typer.Typer(add_completion=False)


@app.command()
def export_artifacts(
    run_hash: str = typer.Argument(..., help="12-char hash of the embedding run to publish."),
    model: str | None = typer.Option(None, help="Disambiguate when the hash was embedded with several models."),
    out_dir: Path = typer.Option(APP_DATA_DIR, help="Destination for the static artifacts."),
    quantized: bool = typer.Option(True, help="Export int8 quantized embeddings with scales."),
) -> None:
    """Publish a hash-addressed embedding run as the PWA's static artifacts."""
    if quantized:
        quant_dir = resolve_matching_artifacts(REPO / "ingest/analysis/quantize_corpus/outputs", run_hash)
        if not quant_dir:
            raise FileNotFoundError(f"No quantization output found for hash {run_hash}")
        lock = read_lock_file(quant_dir / "config.lock.yaml") if (quant_dir / "config.lock.yaml").exists() else {}
        chunks = load_chunks_artifact(quant_dir / "chunks.json")
        dim = int(lock.get("output", {}).get("shape", [len(chunks), 768])[1])
        embeddings = np.fromfile(quant_dir / "embeddings.i8.bin", dtype=np.int8).reshape(len(chunks), dim)
        scales = np.fromfile(quant_dir / "scales.f32.bin", dtype=np.float32)
        model_name = str(lock.get("parameters", {}).get("embedding_model", "nomic-ai/nomic-embed-text-v1.5"))
        chunk_params = dict(lock.get("upstream", {}).get("parameters", {}))
    else:
        run = load_embedding_run(EMBED_CORPUS_OUTPUTS, run_hash, model=model)
        chunks = run.chunks
        embeddings = run.embeddings
        scales = None
        model_name = run.model
        chunk_params = run.chunk_params

    corpus = BookCorpus.from_verses(WebCorpusWalker(WEB_PATH).lazy_walk())

    StaticArtifactSink().write(
        out_dir=out_dir,
        corpus=corpus,
        chunks=chunks,
        embeddings=embeddings,
        scales=scales,
        model=model_name,
        query_prefix=QUERY_PREFIX,
        chunk_meta={"hash": run_hash, **chunk_params},
    )
    typer.echo(f"Exported {run_hash} ({model_name}, {len(chunks)} chunks, quantized={quantized}) -> {out_dir}")


if __name__ == "__main__":
    app()
