"""SQL Connect transport guards and integration against the official demo emulator."""

import os
from dataclasses import replace
from uuid import uuid4

import pytest
from requests import Response

from app.config import settings
from app.nlp.pipeline import AnalysisResult
from app.sqlconnect_client import SQLConnectClient, SQLConnectError
from app.sqlconnect_repository import SQLConnectAnalysisRepository


class NoJobs:
    def delete(self, ids):
        return set()


@pytest.fixture
def result():
    return AnalysisResult(raw_text="Syntetický životopis: Python a SQL.\n" * 3,
                          file_kind="pdf", candidate_name=None, candidate_phone=None,
                          cv_skills=["Python", "SQL"], education={"degrees": [], "institutions": []},
                          experience_years=None, required_skills=["Python", "Docker"],
                          matched_skills=["Python"], missing_skills=["Docker"],
                          text_similarity=40.0, skill_coverage=50.0, score_percentage=50.0)


def test_transport_uses_admin_endpoints_and_never_logs_remote_body():
    seen = []
    class Transport:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            seen.append((url, kwargs))
            response = Response()
            response.status_code = 200
            response._content = b'{"data":{"cvAnalysis":null}}'
            return response
    config = replace(settings, dataconnect_emulator_host="", firebase_project_id="test-project")
    client = SQLConnectClient(config, session_factory=Transport)
    assert client.execute("GetAnalysis", {"applicationId": 7}) == {"cvAnalysis": None}
    assert seen[0][0].endswith(":impersonateQuery")
    assert seen[0][1]["allow_redirects"] is False
    client.execute("DeleteAnalysis", {"applicationId": 7}, mutation=True)
    assert seen[1][0].endswith(":impersonateMutation")

    class Failure(Transport):
        def post(self, *args, **kwargs):
            response = Response()
            response.status_code = 403
            response._content = b'PRIVATE-CV-AND-SECRET'
            return response
    with pytest.raises(SQLConnectError) as error:
        SQLConnectClient(config, session_factory=Failure).execute("StorageHealth")
    assert 'PRIVATE-CV' not in str(error.value)


def test_emulator_cannot_use_live_project_or_arbitrary_scheme():
    for project, host in [('real-project', 'localhost:9399'), ('demo-project', 'https://evil.example')]:
        with pytest.raises(SQLConnectError):
            SQLConnectClient(replace(settings, firebase_project_id=project, dataconnect_emulator_host=host))


@pytest.mark.parametrize('ephemeral', [True, False])
def test_onboarding_database_cannot_receive_production_migration(ephemeral):
    import json
    class Onboarding:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, *args, **kwargs):
            response = Response()
            response.status_code = 200
            pg = {'cloudSql': {'instance': 'projects/test/instances/postgres'}}
            if ephemeral:
                pg['ephemeral'] = True
            response._content = json.dumps({'datasources': [{'postgresql': pg}]}).encode()
            return response
    config = replace(settings, dataconnect_emulator_host="", firebase_project_id="test-project")
    if ephemeral:
        with pytest.raises(SQLConnectError, match='onboarding'):
            SQLConnectClient(config, session_factory=Onboarding).require_postgresql()
    else:
        SQLConnectClient(config, session_factory=Onboarding).require_postgresql()


@pytest.fixture
def repo():
    host = os.getenv('DATA_CONNECT_EMULATOR_HOST', '')
    project = os.getenv('FIREBASE_PROJECT_ID', '')
    if not host or not project.startswith('demo-'):
        pytest.skip('Requires the official local SQL Connect emulator and a demo- project')
    return SQLConnectAnalysisRepository(jobs=NoJobs())


@pytest.fixture
def ids(repo):
    values = [1_000_000_000 + uuid4().int % 900_000_000 for _ in range(2)]
    yield values
    repo.delete(values)


def test_roundtrip_history_and_delete(repo, ids, result):
    first, other = ids
    assert repo.get_latest(first) is None
    at = repo.save(first, result)
    saved = repo.get_latest(first)
    assert saved['analyzed_at'] == at
    assert saved['cv_skills'] == result.cv_skills
    assert saved['score_percentage'] == 50
    repo.save(first, replace(result, score_percentage=None, skill_coverage=None))
    repo.save(other, result)
    assert len(list(repo.history(first))) == 2
    assert repo.get_latest(first)['score_percentage'] is None
    assert repo.delete([first, first, 999_999_999]) == 1
    assert repo.get_latest(first) is None
    assert list(repo.history(first)) == []
    assert repo.get_latest(other) is not None
    assert repo.delete([first]) == 0


def test_failed_import_rolls_back_parent_and_never_overwrites(repo, ids, result):
    from datetime import datetime, timezone
    from app.sqlconnect_repository import normalized_result, storage_row
    first = ids[0]
    snapshot = normalized_result(first, result, datetime.now(timezone.utc))
    parent = storage_row(snapshot, raw_text=result.raw_text)
    # Invalid FK: the transaction must not leave the parent behind.
    invalid = storage_row({**snapshot, 'application_id': ids[1]}, run_id=str(uuid4()))
    with pytest.raises(SQLConnectError):
        repo.client.execute('ImportAnalysis', {'analysis': parent, 'runs': [invalid]}, mutation=True)
    assert repo.get_latest(first) is None
    history = storage_row(snapshot, run_id=str(uuid4()))
    repo.client.execute('ImportAnalysis', {'analysis': parent, 'runs': [history]}, mutation=True)
    assert len(list(repo.history(first))) == 1
    with pytest.raises(SQLConnectError):
        repo.client.execute('ImportAnalysis', {'analysis': parent, 'runs': [history]}, mutation=True)
    assert len(list(repo.history(first))) == 1
