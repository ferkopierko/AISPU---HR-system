import json
from dataclasses import replace

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.nlp.review_summary import generate_summary, summary_context
from app.nlp.providers import ProviderError
from app.routers import internal

FACTS = {"position": "Backend Developer", "matched_skills": ["Python"], "missing_skills": ["SQL"], "uncertain_skills": ["Docker"]}
LINES = ["Text CV dokladá časť požadovaných zručností pre túto pozíciu.",
         "Relevantným doloženým podkladom je zmienka o používaní Pythonu.",
         "SQL sa v texte nenašlo a tvrdenie o Dockeri vyžaduje overenie.",
         "Na pohovore overte praktické použitie Pythonu a doplňte informácie o SQL a Dockeri."]


def response(lines=LINES):
    return {"status": "completed", "model": "test-model", "usage": {"total_tokens": 345},
            "output": [{"type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": json.dumps({"lines": lines})}]}]}


def config():
    return replace(settings, ai_provider="azure_llm", azure_openai_endpoint="https://test.openai.azure.com/openai/v1/responses",
                   azure_openai_api_key="test-key", azure_openai_deployment="test-deployment")


def test_one_structured_request_without_personal_data_or_tools():
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=response())
    result = generate_summary(FACTS, config(), transport=httpx.MockTransport(handle))
    assert result["lines"] == LINES and result["usage"] == {"total_tokens": 345}
    assert len(calls) == 1 and calls[0]["store"] is False and "tools" not in calls[0]
    assert calls[0]["max_output_tokens"] == 650
    assert json.loads(calls[0]["input"][0]["content"][0]["text"]) == FACTS


@pytest.mark.parametrize("lines", [[], LINES[:3], LINES + ["Extra"], ["x" * 401] * 4, ["two\nlines"] * 4])
def test_invalid_output_is_rejected(lines):
    with pytest.raises(ProviderError):
        generate_summary(FACTS, config(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response(lines))))


def test_remote_failure_is_sanitized_and_not_retried():
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(429, text="private CV and test-key")
    with pytest.raises(ProviderError) as error:
        generate_summary(FACTS, config(), transport=httpx.MockTransport(handle))
    assert len(calls) == 1 and "test-key" not in str(error.value) and "private CV" not in str(error.value)


def test_context_excludes_personal_data_and_invalidates_on_changes():
    analysis = {**FACTS, "analyzed_at": "2026-11-04", "candidate_name": "Private Name", "raw_text": "private CV",
                "requirements_snapshot": "Python, SQL", "document_sha256": "aaa"}
    facts, fingerprint = summary_context(analysis, "Backend Developer", "Python, SQL")
    assert facts == FACTS and "private" not in json.dumps(facts).lower()
    assert fingerprint != summary_context({**analysis, "analyzed_at": "2026-11-05"}, "Backend Developer", "Python, SQL")[1]
    assert fingerprint != summary_context(analysis, "Backend Developer", "Java")[1]


def test_internal_boundary_and_stale_context_make_no_model_call(monkeypatch):
    analysis = {**FACTS, "analyzed_at": "2026-11-04", "requirements_snapshot": "Python, SQL"}
    class Repository:
        def get_latest(self, appid):
            return analysis if appid == 7 else None
    app = FastAPI(); app.include_router(internal.router)
    app.dependency_overrides[internal.get_repository] = lambda: Repository()
    monkeypatch.setattr(internal, "settings", replace(settings, internal_api_key="test-internal"))
    calls = []
    monkeypatch.setattr(internal, "generate_summary", lambda *_: calls.append(1) or {"lines": LINES})
    client = TestClient(app)
    body = {"application_id": 7, "title": "Backend Developer", "requirements": "Python, SQL"}
    context = "/api/ml/internal/review-summary/context"
    generate = "/api/ml/internal/review-summary/generate"
    headers = {"X-Internal-Key": "test-internal"}
    assert client.post(context, json=body).status_code == 403
    assert client.post(generate, json=body, headers=headers).status_code == 409
    assert client.post(context, json={**body, "requirements": "Java"}, headers=headers).status_code == 409
    assert client.post(context, json={**body, "application_id": 8}, headers=headers).status_code == 404
    assert calls == []
    fingerprint = client.post(context, json=body, headers=headers).json()["fingerprint"]
    assert client.post(generate, json={**body, "fingerprint": fingerprint}, headers=headers).status_code == 200
    assert calls == [1]
    calls.clear()
    analysis['analysis_metadata'] = {'position_snapshot': {'title':'Backend Developer','description':'',
        'responsibilities':'','requirements':'Python, SQL'}, 'review_summary': {'lines':LINES,'usage_scope':'shared_analysis'}}
    cached = client.post(context,json=body,headers=headers).json()
    assert cached['summary']['lines']==LINES
    assert client.post(generate,json={**body,'fingerprint':cached['fingerprint']},headers=headers).json()['usage_scope']=='shared_analysis'
    assert calls==[]
    assert client.post(context,json={**body,'description':'Changed description'},headers=headers).status_code==409
