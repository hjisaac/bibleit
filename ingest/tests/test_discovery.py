import pytest
from crucible.core.runtime.discovery import resolve_job_class
from analysis.chunking_strategy.job import AnalysisJobChunkingStrategy
from eval.question_to_passage_eval.job import EvalJobQuestionToPassage


def test_resolve_chunking_strategy_job() -> None:
    job_cls = resolve_job_class("chunking_strategy")
    assert job_cls is AnalysisJobChunkingStrategy


def test_resolve_question_to_passage_job() -> None:
    job_cls = resolve_job_class("question_to_passage_eval")
    assert job_cls is EvalJobQuestionToPassage


def test_resolve_nonexistent_job() -> None:
    with pytest.raises(ValueError, match="not found across roots"):
        resolve_job_class("non_existent_job_xyz")
