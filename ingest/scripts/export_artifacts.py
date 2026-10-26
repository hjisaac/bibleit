from pathlib import Path

import typer

from bibleit_ingest.artifacts import load_embedding_run
from bibleit_ingest.constants import APP_DATA_DIR, EMBED_CORPUS_OUTPUTS, QUERY_PREFIX, WEB_PATH
from bibleit_ingest.sinks import StaticArtifactSink
from bibleit_ingest.types import BookCorpus
from bibleit_ingest.walkers import WebCorpusWalker

app = typer.Typer(add_completion=False)


@app.command()
def export_artifacts(
    run_hash: str = typer.Argument(..., help="12-char hash of the embedding run to publish."),
    model: str | None = typer.Option(None, help="Disambiguate when the hash was embedded with several models."),
    out_dir: Path = typer.Option(APP_DATA_DIR, help="Destination for the static artifacts."),
) -> None:
    """Publish a hash-addressed embedding run as the PWA's static artifacts."""
    run = load_embedding_run(EMBED_CORPUS_OUTPUTS, run_hash, model=model)
    corpus = BookCorpus.from_verses(WebCorpusWalker(WEB_PATH).lazy_walk())

    StaticArtifactSink().write(
        out_dir=out_dir,
        corpus=corpus,
        chunks=run.chunks,
        embeddings=run.embeddings,
        model=run.model,
        query_prefix=QUERY_PREFIX,
        chunk_meta={"hash": run.hash, **run.chunk_params},
    )
    typer.echo(f"Exported {run.hash} ({run.model}, {len(run.chunks)} chunks) from {run.run_dir.name} -> {out_dir}")


if __name__ == "__main__":
    app()
