"""Firestore fronta analýz – integračné testy iba proti lokálnemu demo emulátoru."""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app import analysis_jobs
from app.firestore_jobs import FirestoreJobRepository
from app.firestore_repository import FirestoreAnalysisRepository
from app.repository import AnalysisTooLargeError

PAYLOAD = {"raw_text": "Skills: Python, SQL, Docker", "kind": "pdf", "requirements": "Python, Docker",
           "document_sha256": "abc"}


@pytest.fixture
def client():
    project = os.getenv("FIREBASE_PROJECT_ID", "")
    if not os.getenv("FIRESTORE_EMULATOR_HOST") or not project.startswith("demo-"):
        pytest.skip("Requires FIRESTORE_EMULATOR_HOST and a demo- project; never runs against cloud")
    from google.cloud import firestore
    client = firestore.Client(project=project, database="(default)")
    # Fronta je zdieľaná kolekcia – testy začínajú s prázdnou, aby claim vrátil ich úlohy.
    for snapshot in client.collection("analysis_jobs").stream():
        snapshot.reference.delete()
    yield client
    client.close()


@pytest.fixture
def jobs(client):
    return FirestoreJobRepository(client)


@pytest.fixture
def app_id(jobs):
    value = 1_000_000_000 + (uuid4().int % 900_000_000)
    yield value
    jobs.analyses.delete([value])


def test_enqueue_is_idempotent_and_claim_processes_once(jobs, app_id):
    assert jobs.status(app_id) is None
    first = jobs.enqueue(app_id, PAYLOAD, "local_rules")
    assert first["state"] == "queued" and first["attempts"] == 0
    assert jobs.enqueue(app_id, {**PAYLOAD, "raw_text": "iné CV"}, "azure_llm")["provider"] == "local_rules"
    job = jobs.claim()
    assert job["application_id"] == app_id and job["payload"] == PAYLOAD
    assert jobs.status(app_id)["state"] == "processing"
    assert jobs.claim() is None  # prenájom ešte nevypršal


def test_worker_completes_atomically_with_result(jobs, app_id):
    jobs.enqueue(app_id, PAYLOAD, "local_rules")
    assert analysis_jobs.process_one(jobs)
    assert jobs.status(app_id)["state"] == "completed"
    latest = jobs.analyses.get_latest(app_id)
    assert latest["score_percentage"] == 100.0 and sorted(latest["matched_skills"]) == ["Docker", "Python"]
    snapshot = jobs._ref(app_id).get()
    assert "lease_until" not in snapshot.to_dict()
    assert analysis_jobs.process_one(jobs) is False  # hotová úloha sa znova nespracuje


def test_stale_lock_and_gdpr_delete_never_write_result(jobs, app_id):
    jobs.enqueue(app_id, PAYLOAD, "local_rules")
    job = jobs.claim()
    result = analysis_jobs.analyze_text(**job["payload"], provider="local_rules")
    assert not jobs.complete({**job, "lock_token": "cudzi"}, result)
    assert jobs.analyses.delete([app_id]) == 1  # GDPR mazanie počas spracovania
    assert not jobs.complete(job, result)
    assert jobs.status(app_id) is None and jobs.analyses.get_latest(app_id) is None


def test_failure_retry_and_expired_lease(jobs, app_id):
    jobs.enqueue(app_id, PAYLOAD, "local_rules")
    job = jobs.claim()
    jobs.fail(job, "Azure dosiahlo kvótu")
    assert jobs.status(app_id)["state"] == "failed" and jobs.claim() is None
    assert jobs.retry(app_id) and not jobs.retry(app_id)
    job = jobs.claim()
    # Spadnutý worker: prenájom vyprší a úlohu prevezme ďalší, po 3 pokusoch zlyhá.
    for attempt in (2, 3):
        jobs._ref(app_id).update({"lease_until": datetime.now(timezone.utc) - timedelta(seconds=1)})
        job = jobs.claim()
        assert job and job["attempts"] == attempt - 1
    jobs._ref(app_id).update({"lease_until": datetime.now(timezone.utc) - timedelta(seconds=1)})
    assert jobs.claim() is None
    assert jobs.status(app_id)["state"] == "failed"


def test_too_large_payload_is_rejected(jobs, app_id):
    with pytest.raises(AnalysisTooLargeError):
        jobs.enqueue(app_id, {**PAYLOAD, "raw_text": os.urandom(1_000_000).hex()}, "local_rules")
    assert jobs.status(app_id) is None


def test_analysis_repository_uses_the_same_queue(client, jobs):
    assert isinstance(FirestoreAnalysisRepository(client, jobs=jobs).jobs, FirestoreJobRepository)
