"""Test API s repozitárom v pamäti (bez MySQL)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.backend1 import Backend1Error, get_backend1
from app.main import app
from app.routers.ml import MAX_BYTES, get_repository

REQ = "Node.js, TypeScript, Kubernetes, Docker"


class FakeRepository:
    def __init__(self):
        self.rows = {}

    def save(self, application_id, result):
        at = datetime(2026, 10, 19, 12, 0, 0)
        self.rows[application_id] = {
            "application_id": application_id,
            "score_percentage": result.score_percentage,
            "text_similarity": result.text_similarity,
            "skill_coverage": result.skill_coverage,
            "matched_skills": result.matched_skills,
            "missing_skills": result.missing_skills,
            "cv_skills": result.cv_skills,
            "education": result.education,
            "experience_years": result.experience_years,
            "analyzed_at": at,
        }
        return at

    def get_latest(self, application_id):
        return self.rows.get(application_id)

    def delete(self, application_ids):
        found = [i for i in application_ids if i in self.rows]
        for i in found:
            del self.rows[i]
        return len(found)


class FakeBackend1:
    """Zaznamená odovzdané CV; `fail` simuluje odmietnutie Backendom 1."""

    def __init__(self):
        self.calls = []
        self.fail = None

    def store_cv(self, application_id, session_cookie, filename, kind, data, name, phone):
        if self.fail:
            raise self.fail
        self.calls.append(dict(application_id=application_id, cookie=session_cookie, filename=filename,
                               kind=kind, size=len(data), name=name, phone=phone))


@pytest.fixture
def repo():
    fake = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def backend1(repo):
    fake = FakeBackend1()
    app.dependency_overrides[get_backend1] = lambda: fake
    return fake


@pytest.fixture
def client(repo, backend1):
    c = TestClient(app)  # bez `with` -> lifespan (MySQL) sa nespúšťa
    c.cookies.set("hr.sid", "s%3Asession-uchadzaca")
    return c


def post(client, data, name="cv.pdf", application_id="7", requirements=REQ):
    form = {}
    if application_id is not None:
        form["application_id"] = application_id
    if requirements is not None:
        form["requirements"] = requirements
    return client.post("/api/ml/analyze", data=form, files={"file": (name, data, "application/octet-stream")})


def test_analyze_pdf_and_get_result(client, repo, cv_pdf):
    r = post(client, cv_pdf)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["application_id"] == 7
    assert body["matched_skills"] == ["Node.js", "TypeScript", "Docker"]
    assert body["missing_skills"] == ["Kubernetes"]
    assert body["skill_coverage"] == 75.0
    assert body["education"]["degrees"] == ["master"]
    assert body["experience_years"] is not None
    assert 7 in repo.rows

    g = client.get("/api/ml/results/7")
    assert g.status_code == 200
    assert g.json() == body


def test_analyze_docx(client, cv_docx):
    r = post(client, cv_docx, name="cv.docx")
    assert r.status_code == 201
    assert "Node.js" in r.json()["cv_skills"]


def test_result_not_found(client):
    assert client.get("/api/ml/results/999").status_code == 404
    assert client.get("/api/ml/results/0").status_code == 422
    assert client.get("/api/ml/results/abc").status_code == 422


def test_validation(client, cv_pdf):
    assert post(client, cv_pdf, application_id=None).status_code == 422
    assert post(client, cv_pdf, application_id="-1").status_code == 422
    assert post(client, cv_pdf, requirements=None).status_code == 422
    assert post(client, cv_pdf, requirements="").status_code == 422
    assert client.post("/api/ml/analyze", data={"application_id": "1", "requirements": REQ}).status_code == 422


def test_bad_files(client, cv_pdf):
    r = post(client, b"hello", name="cv.txt")
    assert r.status_code == 415 and "PDF" in r.json()["detail"]
    assert post(client, b"%PDF-1.4 broken", name="cv.pdf").status_code == 422
    assert post(client, b"", name="cv.pdf").status_code == 422
    big = cv_pdf + b"0" * (MAX_BYTES + 1 - len(cv_pdf))
    assert post(client, big).status_code == 413


def test_cors(client):
    r = client.options("/api/ml/analyze", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
    })
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert r.headers["access-control-allow-credentials"] == "true"
    r = client.options("/api/ml/analyze", headers={
        "Origin": "http://evil.example", "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in r.headers


def test_cv_and_contact_sent_to_backend1(client, backend1, cv_pdf):
    assert post(client, cv_pdf, name="Moje CV.pdf").status_code == 201
    assert backend1.calls == [dict(
        application_id=7, cookie="s%3Asession-uchadzaca", filename="Moje CV.pdf", kind="pdf",
        size=len(cv_pdf), name="Jan Novak", phone="+421 905 123 456",
    )]


def test_backend1_rejection_stops_analysis(client, repo, backend1, cv_pdf):
    backend1.fail = Backend1Error(403, "Prihláška nepatrí prihlásenému používateľovi")
    r = post(client, cv_pdf)
    assert r.status_code == 403 and "nepatrí" in r.json()["detail"]
    assert repo.rows == {}  # analýza sa neuložila
    backend1.fail = Backend1Error(502, "Backend 1 je nedostupný")
    assert post(client, cv_pdf).status_code == 502


def test_bad_file_not_sent_to_backend1(client, backend1):
    post(client, b"hello", name="cv.txt")
    assert backend1.calls == []


def test_firestore_document_limit_returns_413(client, repo, cv_pdf, monkeypatch):
    from app.firestore_repository import AnalysisTooLargeError
    def reject(*args):
        raise AnalysisTooLargeError("Text CV je príliš veľký")
    monkeypatch.setattr(repo, "save", reject)
    response = post(client, cv_pdf)
    assert response.status_code == 413
    assert "príliš veľký" in response.json()["detail"]


KEY = "test-internal-key"


@pytest.fixture
def internal_key(monkeypatch):
    from app.routers import internal
    monkeypatch.setattr(internal, "settings", type("S", (), {"internal_api_key": KEY})())


def test_internal_delete(client, repo, cv_pdf, internal_key):
    post(client, cv_pdf, application_id="7")
    post(client, cv_pdf, application_id="8")
    r = client.post("/api/ml/internal/delete", json={"application_ids": [7, 7, 99]}, headers={"X-Internal-Key": KEY})
    assert r.status_code == 200 and r.json() == {"deleted": 1}
    assert client.get("/api/ml/results/7").status_code == 404
    assert client.get("/api/ml/results/8").status_code == 200


def test_internal_delete_auth_and_validation(client, internal_key):
    url = "/api/ml/internal/delete"
    assert client.post(url, json={"application_ids": [1]}).status_code == 403
    assert client.post(url, json={"application_ids": [1]}, headers={"X-Internal-Key": "zly"}).status_code == 403
    for body in ({"application_ids": []}, {"application_ids": [0]}, {}):
        assert client.post(url, json=body, headers={"X-Internal-Key": KEY}).status_code == 422


def test_internal_delete_not_configured(client, monkeypatch):
    from app.routers import internal
    monkeypatch.setattr(internal, "settings", type("S", (), {"internal_api_key": None})())
    assert client.post("/api/ml/internal/delete", json={"application_ids": [1]}).status_code == 503
