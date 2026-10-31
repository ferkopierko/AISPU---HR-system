from app import analysis_jobs
from app.nlp.providers import ProviderError
from app.repository import AnalysisTooLargeError


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


class Cursor:
    def __init__(self,token):self.token,self.sql=token,[]
    def execute(self,sql,params=()):self.sql.append(sql)
    def fetchone(self):return (self.token,) if self.token else None


class Connection:
    def __init__(self,token):self.cursor_,self.committed=Cursor(token),False
    def cursor(self,**kwargs):return self.cursor_
    def commit(self):self.committed=True


class SavedResults:
    def __init__(self,error=None):self.saved,self.error=[],error
    def save(self,application_id,result,*,connection=None):
        if self.error:raise self.error
        self.saved.append((application_id,result,connection))


def firestore_mode(monkeypatch,token,storage_repo):
    from contextlib import contextmanager
    from dataclasses import replace
    conn=Connection(token)
    @contextmanager
    def connection():yield conn
    monkeypatch.setattr(analysis_jobs.db,'get_connection',connection)
    monkeypatch.setattr(analysis_jobs,'settings',replace(analysis_jobs.settings,db_provider='firestore'))
    monkeypatch.setattr(analysis_jobs.storage,'get_repository',lambda:storage_repo)
    def no_mysql(*args,**kwargs):raise AssertionError('vo firestore režime sa výsledok neukladá do MySQL')
    monkeypatch.setattr(analysis_jobs.MySQLAnalysisRepository,'save',no_mysql)
    return conn


def test_firestore_worker_saves_through_storage_then_completes(monkeypatch):
    saved=SavedResults()
    conn=firestore_mode(monkeypatch,'claim',saved)
    job=Queue().job
    result=analysis_jobs.analyze_text(**job['payload'],provider='local_rules')
    assert analysis_jobs.JobRepository().complete(job,result)
    assert saved.saved==[(7,result,None)]
    assert "state='completed'" in conn.cursor_.sql[-1] and conn.committed


def test_firestore_worker_with_stale_lock_does_not_save(monkeypatch):
    saved=SavedResults()
    conn=firestore_mode(monkeypatch,'other-worker',saved)
    job=Queue().job
    assert not analysis_jobs.JobRepository().complete(job,analysis_jobs.analyze_text(**job['payload'],provider='local_rules'))
    assert saved.saved==[] and not conn.committed


def test_worker_marks_too_large_analysis_as_failed(monkeypatch):
    conn=firestore_mode(monkeypatch,'claim',SavedResults(AnalysisTooLargeError('Text CV je príliš veľký na uloženie analýzy.')))
    failures=[]
    class Jobs(analysis_jobs.JobRepository):
        def claim(self):return Queue().job
        def fail(self,job,message):failures.append(message)
    assert analysis_jobs.process_one(Jobs())
    assert failures==['Text CV je príliš veľký na uloženie analýzy.']
    assert not conn.committed
