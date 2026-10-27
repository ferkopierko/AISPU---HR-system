"""Azure wire-contract tests with httpx.MockTransport: no credentials or cloud needed."""
import json
from dataclasses import replace

import httpx
import pytest

from app.config import settings, validate_ai_config
from app.nlp.pipeline import analyze_text
from app.nlp.providers import AzureCustomNer, ProviderError, SkillEntity, canonical_skill


TEXT = "Životopis 👩‍💻\nVyvíjam v Pythone. Databázy: Postgres a SQL."


def config(**overrides):
    defaults = dict(ai_provider='azure_custom_ner',azure_language_endpoint='https://hr-demo.cognitiveservices.azure.com',
                    azure_language_key='test-only-key',azure_ner_project='cv-skills',azure_ner_deployment='v1',
                    azure_ner_model_version='skills-2026-01',internal_api_key='test-internal',azure_timeout_seconds=5)
    return replace(settings,**(defaults|overrides))


def result(entities=None, **overrides):
    doc={'id':'cv','entities':entities if entities is not None else [{'category':'Skill','text':'SQL','offset':TEXT.index('SQL'),'length':3,'confidenceScore':.94}]}
    return {'status':'succeeded','tasks':{'failed':0,'completed':1,'items':[{'status':'succeeded','kind':'CustomEntityRecognitionLROResults','results':{'documents':[doc],'errors':[],**overrides}}]}}


def azure(responses, settings_override=None):
    calls=[]
    def handle(request):
        calls.append(request)
        return responses.pop(0)
    clock=[0.]
    client=AzureCustomNer(settings_override or config(),transport=httpx.MockTransport(handle),clock=lambda:clock[0],sleep=lambda n:clock.__setitem__(0,clock[0]+n))
    return client,calls


def accepted(location='https://hr-demo.cognitiveservices.azure.com/language/analyze-text/jobs/id?api-version=2022-05-01'):
    return httpx.Response(202,headers={'operation-location':location})


def test_submit_poll_unicode_offsets_and_no_logging():
    client,calls=azure([accepted(),httpx.Response(200,json={'status':'running'}),httpx.Response(200,json=result())])
    entities,version=client.extract(TEXT)
    assert entities[0].skill=='sql' and entities[0].offset==TEXT.index('SQL')
    assert entities[0].confidence==.94 and version=='skills-2026-01'
    payload=json.loads(calls[0].content)
    assert calls[0].headers['Ocp-Apim-Subscription-Key']=='test-only-key'
    params=payload['tasks'][0]['parameters']
    assert params['stringIndexType']=='UnicodeCodePoint' and params['loggingOptOut'] is True
    assert payload['analysisInput']['documents'][0]['text']==TEXT
    assert [r.method for r in calls]==['POST','GET','GET']


@pytest.mark.parametrize('location',['https://attacker.invalid/language/analyze-text/jobs/id','http://hr-demo.cognitiveservices.azure.com/language/analyze-text/jobs/id','https://hr-demo.cognitiveservices.azure.com/wrong'])
def test_never_forward_key_to_untrusted_operation_url(location):
    client,calls=azure([accepted(location)])
    with pytest.raises(ProviderError): client.extract(TEXT)
    assert len(calls)==1


@pytest.mark.parametrize('code',[401,403,429,500])
def test_http_errors_are_sanitized_and_post_not_retried(code):
    client,calls=azure([httpx.Response(code,text='CV + secret test-only-key')])
    with pytest.raises(ProviderError) as error:client.extract(TEXT)
    assert 'test-only-key' not in str(error.value) and 'secret' not in str(error.value)
    assert len(calls)==1


def test_poll_rate_limit_and_timeout():
    client,calls=azure([accepted(),httpx.Response(429,headers={'retry-after':'1'}),httpx.Response(200,json=result())])
    assert client.extract(TEXT)[0]
    client,calls=azure([accepted()]+[httpx.Response(200,json={'status':'running'}) for _ in range(5)])
    with pytest.raises(ProviderError,match='Vypršal'):client.extract(TEXT)
    assert sum(r.method=='POST' for r in calls)==1


@pytest.mark.parametrize('entity',[
    {'category':'Skill','text':'SQL','offset':-1,'length':3,'confidenceScore':.9},
    {'category':'Skill','text':'SQL','offset':0,'length':3,'confidenceScore':.9},
    {'category':'Skill','text':'SQL','offset':TEXT.index('SQL'),'length':3,'confidenceScore':1.2},
])
def test_invalid_evidence_is_error_not_a_missing_skill(entity):
    client,_=azure([accepted(),httpx.Response(200,json=result([entity]))])
    with pytest.raises(ProviderError):client.extract(TEXT)


def test_document_error_and_limits_are_not_zero_scores():
    body=result(errors=[{'id':'cv','error':{'code':'InvalidDocument'}}])
    client,_=azure([accepted(),httpx.Response(200,json=body)])
    with pytest.raises(ProviderError):client.extract(TEXT)
    client,calls=azure([],config(azure_max_characters=5))
    with pytest.raises(ProviderError):client.extract(TEXT)
    assert calls==[]


def test_no_rule_fallback_and_weighted_score_from_azure_entities():
    class FakeAzure:
        def extract(self,text):return [SkillEntity('sql','SQL',text.index('SQL'),3,.94,'azure_custom_ner')],'test-v1'
    text='Skills: Python, SQL, Docker.'
    outcome=analyze_text(text,'pdf','[{"skill":"Python","weight":5},{"skill":"SQL","weight":3},{"skill":"Docker","weight":2}]',provider='azure_custom_ner',azure_client=FakeAzure())
    assert outcome.score_percentage==30 and outcome.cv_skills==['sql']
    assert outcome.provider=='azure_custom_ner' and outcome.model_version=='test-v1'
    assert len(outcome.requirements_sha256)==64 and outcome.skill_evidence[1]['mentions'][0]['confidence']==.94
    class BrokenAzure:
        def extract(self,text):raise ProviderError('Azure unavailable')
    with pytest.raises(ProviderError):analyze_text(text,'pdf','Python',provider='azure_custom_ner',azure_client=BrokenAzure())


def test_low_confidence_and_negation_are_separate_from_missing():
    text='Nemám skúsenosti s Docker.\nSQL'
    class FakeAzure:
        def extract(self,raw):return [SkillEntity('docker','Docker',raw.index('Docker'),6,.99,'azure_custom_ner'),SkillEntity('sql','SQL',raw.index('SQL'),3,.5,'azure_custom_ner')],'test-v1'
    outcome=analyze_text(text,'docx','["Docker","SQL","Python"]',provider='azure_custom_ner',azure_client=FakeAzure())
    assert outcome.score_percentage==0 and outcome.uncertain_skills==['docker','sql']
    assert outcome.missing_skills==['python'] and not outcome.matched_skills
    assert canonical_skill('Postgres')=='postgresql' and canonical_skill('K8s')=='kubernetes'


def test_configuration_is_explicit_and_fails_closed():
    validate_ai_config(config())
    with pytest.raises(RuntimeError):validate_ai_config(config(azure_language_key=''))
    with pytest.raises(RuntimeError):validate_ai_config(config(azure_language_endpoint='http://localhost'))
    with pytest.raises(RuntimeError):validate_ai_config(config(azure_confidence_threshold=float('nan')))
    with pytest.raises(RuntimeError):validate_ai_config(config(ai_provider='typo'))
