from app import analysis_jobs
from app.nlp.providers import ProviderError


class Queue:
    def __init__(self):
        self.job={'application_id':7,'provider':'local_rules','lock_token':'claim','payload':{'raw_text':'Skills: Python','kind':'pdf','requirements':'Python'}}
        self.completed,self.failure=None,None
    def claim(self):
        job,self.job=self.job,None
        return job
    def complete(self,job,result):self.completed=result
    def fail(self,job,message):self.failure=message


def test_worker_completes_and_never_changes_recruitment_status():
    queue=Queue()
    assert analysis_jobs.process_one(queue)
    assert queue.completed.score_percentage==100 and queue.failure is None
    assert analysis_jobs.process_one(queue) is False


def test_worker_failure_keeps_job_retryable_without_fabricating_result(monkeypatch):
    queue=Queue()
    def fail(**kwargs):raise ProviderError('Azure dosiahlo kvótu')
    monkeypatch.setattr(analysis_jobs,'analyze_text',fail)
    assert analysis_jobs.process_one(queue)
    assert queue.completed is None and 'kvótu' in queue.failure


def test_worker_internal_error_does_not_disclose_raw_cv(monkeypatch):
    queue=Queue()
    def fail(**kwargs):raise ValueError('sensitive CV text and API key')
    monkeypatch.setattr(analysis_jobs,'analyze_text',fail)
    analysis_jobs.process_one(queue)
    assert 'sensitive' not in queue.failure and queue.completed is None
