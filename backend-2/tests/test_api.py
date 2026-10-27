"""Real HTTP handlers, fake databases/auth service. No cloud requests."""
from dataclasses import asdict
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.backend1 import Backend1Error, get_backend1
from app.main import app
from app.nlp.pipeline import analyze_text
from app.routers.ml import MAX_BYTES, get_repository, get_jobs

REQ = "Node.js, TypeScript, Kubernetes, Docker"


class FakeRepository:
    def __init__(self): self.rows = {}
    def get_latest(self, application_id): return self.rows.get(application_id)


class FakeJobs:
    def __init__(self): self.rows, self.payloads = {}, {}
    def status(self, application_id): return self.rows.get(application_id)
    def enqueue(self, application_id, payload, provider):
        if application_id not in self.rows:
            self.rows[application_id] = dict(application_id=application_id, state="queued", provider=provider, attempts=0)
            self.payloads[application_id] = payload
        return self.rows[application_id]
    def retry(self, application_id):
        self.rows[application_id].update(state="queued", error_message=None)
        return True
    def finish(self, repo, application_id):
        result=analyze_text(**self.payloads[application_id], provider="local_rules")
        repo.rows[application_id] = dict(asdict(result), application_id=application_id, analyzed_at=datetime(2026,10,27))
        self.rows[application_id]["state"] = "completed"


class FakeBackend1:
    def __init__(self): self.calls, self.fail, self.store_fail = [], None, None
    def analysis_context(self, application_id, session_cookie):
        if not session_cookie: raise Backend1Error(401,"Neprihlásený používateľ")
        if self.fail: raise self.fail
        return dict(applicationId=application_id, requirements=REQ)
    def store_cv(self, application_id, session_cookie, filename, kind, data, name, phone):
        if self.store_fail: raise self.store_fail
        self.calls.append(dict(application_id=application_id,cookie=session_cookie,filename=filename,kind=kind,size=len(data),name=name,phone=phone))


@pytest.fixture
def components():
    repo,jobs,backend1=FakeRepository(),FakeJobs(),FakeBackend1()
    app.dependency_overrides[get_repository]=lambda:repo
    app.dependency_overrides[get_jobs]=lambda:jobs
    app.dependency_overrides[get_backend1]=lambda:backend1
    yield repo,jobs,backend1
    app.dependency_overrides.clear()


@pytest.fixture
def client(components):
    client=TestClient(app)
    client.cookies.set("hr.sid","demo-session")
    return client


def post(client,data,name="cv.pdf",application_id="7",requirements=None):
    form={}
    if application_id is not None: form["application_id"]=application_id
    if requirements is not None: form["requirements"]=requirements
    return client.post('/api/ml/analyze',data=form,files={"file":(name,data,"application/octet-stream")})


def test_submit_queue_and_get_result(client,components,cv_pdf):
    repo,jobs,b1=components
    response=post(client,cv_pdf,requirements='[{"skill":"hacked","weight":100}]')
    assert response.status_code==202,response.text
    assert response.json()['state']=='queued'
    assert jobs.payloads[7]['requirements']==REQ  # authoritative server requirements
    assert len(b1.calls)==1 and b1.calls[0]['name']=='Jan Novak'
    assert client.get('/api/ml/results/7').status_code==404
    jobs.finish(repo,7)
    result=client.get('/api/ml/results/7').json()
    assert result['score_percentage']==75 and result['skill_coverage']==75
    assert result['matched_skills']==['node.js','typescript','docker']
    assert result['provider']=='local_rules' and result['requirements_snapshot']==REQ
    assert result['document_sha256'] and result['skill_evidence']
    assert client.get('/api/ml/status/7').json()['state']=='completed'


def test_duplicate_submit_and_retry_do_not_create_application_or_replace_cv(client,components,cv_pdf):
    repo,jobs,b1=components
    assert post(client,cv_pdf).status_code==202
    assert post(client,cv_pdf).status_code==202
    assert len(b1.calls)==1 and len(jobs.rows)==1
    jobs.rows[7].update(state='failed',error_message='Azure je dočasne nedostupné')
    assert client.post('/api/ml/retry/7').json()['state']=='queued'
    assert len(b1.calls)==1
    jobs.finish(repo,7)
    assert client.post('/api/ml/retry/7').status_code==409


def test_access_checked_before_processing_or_reading_results(client,components,cv_pdf):
    repo,jobs,b1=components
    b1.fail=Backend1Error(403,'K tejto prihláške nemáte prístup')
    assert post(client,cv_pdf).status_code==403
    assert client.get('/api/ml/results/7').status_code==403
    assert client.get('/api/ml/status/7').status_code==403
    assert client.post('/api/ml/retry/7').status_code==403
    assert b1.calls==[] and jobs.rows=={} and repo.rows=={}
    b1.fail=None
    client.cookies.clear()
    assert post(client,cv_pdf).status_code==401
    assert client.get('/api/ml/results/7').status_code==401


def test_cv_must_be_saved_before_enqueue(client,components,cv_pdf):
    repo,jobs,b1=components
    b1.store_fail=Backend1Error(502,'Uloženie CV zlyhalo')
    assert post(client,cv_pdf).status_code==502
    assert jobs.rows=={}


def test_validation_and_bad_files(client,components,cv_pdf):
    for app_id in (None,'-1','2147483648'):
        assert post(client,cv_pdf,application_id=app_id).status_code==422
    assert post(client,b'hello',name='cv.txt').status_code==415
    assert post(client,b'%PDF-1.4 broken').status_code==422
    assert post(client,b'').status_code==422
    assert post(client,cv_pdf+b'0'*(MAX_BYTES+1)).status_code==413
    assert components[2].calls==[]
    assert client.get('/api/ml/results/0').status_code==422


def test_docx_status_and_config(client,components,cv_docx):
    assert client.get('/api/ml/status/7').json()['state']=='not_started'
    assert post(client,cv_docx,name='cv.docx').status_code==202
    assert components[2].calls[0]['kind']=='docx'
    body=client.get('/api/ml/capabilities').json()
    assert body['provider']=='local_rules' and 'key' not in body


def test_cors(client):
    response=client.options('/api/ml/analyze',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST'})
    assert response.status_code==200 and response.headers['access-control-allow-credentials']=='true'
    response=client.options('/api/ml/analyze',headers={'Origin':'http://evil.example','Access-Control-Request-Method':'POST'})
    assert 'access-control-allow-origin' not in response.headers
