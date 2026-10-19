"""Test API s repozitárom v pamäti (bez MySQL)."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

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


@pytest.fixture
def repo():
    fake = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.fixture
def client(repo):
    return TestClient(app)  # bez `with` -> lifespan (MySQL) sa nespúšťa


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
    assert body["matched_skills"] == ["node.js", "typescript", "docker"]
    assert body["missing_skills"] == ["kubernetes"]
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
    assert "node.js" in r.json()["cv_skills"]


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
