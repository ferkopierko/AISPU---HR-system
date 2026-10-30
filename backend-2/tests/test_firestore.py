"""Real Firestore integration tests, restricted to a local demo emulator."""

import gzip
import os
from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.firestore_repository import AnalysisTooLargeError, FirestoreAnalysisRepository, analysis_document
from app.nlp.pipeline import AnalysisResult


@pytest.fixture
def result():
    return AnalysisResult(
        raw_text="Životopis – Python, SQL, Docker\n" * 100, file_kind="pdf",
        candidate_name=None, candidate_phone=None, cv_skills=["Python", "SQL"],
        education={"degrees": ["master"], "institutions": ["Univerzita"]},
        experience_years=2.5, required_skills=["Python", "Docker"],
        matched_skills=["Python"], missing_skills=["Docker"],
        text_similarity=40.0, skill_coverage=50.0, score_percentage=46.0,
    )


def test_document_limit_and_compressed_unicode(result):
    document = analysis_document(7, result, datetime.now(timezone.utc))
    assert gzip.decompress(document["raw_text_gzip"]).decode() == result.raw_text
    assert "candidate_name" not in document
    with pytest.raises(AnalysisTooLargeError):
        analysis_document(7, replace(result, cv_skills=["x" * 210_000]), datetime.now(timezone.utc))
    with pytest.raises(AnalysisTooLargeError):
        analysis_document(7, replace(result, raw_text=os.urandom(1_000_000).hex()), datetime.now(timezone.utc))


def test_empty_emulator_setting_uses_cloud_client(monkeypatch):
    from app import firestore_db
    firestore_db.get_client.cache_clear()
    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "")
    captured = {}
    def client(**kwargs):
        captured.update(kwargs)
        assert "FIRESTORE_EMULATOR_HOST" not in os.environ
        return object()
    monkeypatch.setattr(firestore_db.firestore, "Client", client)
    try:
        firestore_db.get_client()
        assert captured["database"] == firestore_db.settings.firestore_database_id
    finally:
        firestore_db.get_client.cache_clear()


@pytest.fixture
def repo():
    project = os.getenv("FIREBASE_PROJECT_ID", "")
    if not os.getenv("FIRESTORE_EMULATOR_HOST") or not project.startswith("demo-"):
        pytest.skip("Requires FIRESTORE_EMULATOR_HOST and a demo- project; never runs against cloud")
    from google.cloud import firestore
    client = firestore.Client(project=project, database="(default)")
    repository = FirestoreAnalysisRepository(client)
    yield repository
    client.close()


@pytest.fixture
def ids(repo):
    # Unique signed-int IDs avoid touching migrated application data.
    values = [1_000_000_000 + (uuid4().int % 900_000_000) for _ in range(2)]
    yield values
    repo.delete(values)


def test_roundtrip_reanalysis_and_gdpr(repo, ids, result):
    first, other = ids
    assert repo.get_latest(first) is None
    at = repo.save(first, result)
    latest = repo.get_latest(first)
    assert latest["analyzed_at"] == at
    assert latest["education"] == result.education
    assert latest["score_percentage"] == 46.0
    assert "raw_text_gzip" not in latest
    repo.save(first, replace(result, score_percentage=80.0, skill_coverage=None))
    repo.save(other, result)
    ref = repo.client.collection("cv_analyses").document(str(first))
    assert len(list(ref.collection("history").stream())) == 2
    assert repo.get_latest(first)["score_percentage"] == 80.0
    assert repo.get_latest(first)["skill_coverage"] is None
    assert repo.delete([first, first, 999_999_999]) == 1
    assert repo.get_latest(first) is None
    assert list(ref.collection("history").stream()) == []
    assert repo.get_latest(other) is not None
    assert repo.delete([first]) == 0


def test_delete_more_than_500_history_records_and_orphans(repo, ids):
    ref = repo.client.collection("cv_analyses").document(str(ids[0]))
    for start in (0, 400):
        batch = repo.client.batch()
        for index in range(start, min(start + 400, 505)):
            batch.set(ref.collection("history").document(str(index)), {"score_percentage": 1})
        batch.commit()
    # No parent: simulates a partially completed prior delete.
    assert repo.delete([ids[0]]) == 1
    assert list(ref.collection("history").stream()) == []


def test_rejected_large_document_preserves_latest_and_history(repo, ids, result):
    repo.save(ids[0], result)
    with pytest.raises(AnalysisTooLargeError):
        repo.save(ids[0], replace(result, cv_skills=["x" * 210_000]))
    assert repo.get_latest(ids[0])["score_percentage"] == result.score_percentage
    ref = repo.client.collection("cv_analyses").document(str(ids[0]))
    assert len(list(ref.collection("history").stream())) == 1


def test_firestore_health_and_unavailable_storage(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    def unavailable():
        raise ConnectionError("unavailable")
    monkeypatch.setattr(main.storage, "ping", unavailable)
    response = TestClient(main.app).get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"
