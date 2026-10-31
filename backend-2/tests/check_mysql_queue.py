"""Opt-in integration check in a randomly named, disposable database. Never uses main DB."""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import mysql.connector


def main():
    name='hr_azure_test_'+uuid.uuid4().hex
    root=mysql.connector.connect(host=os.environ['MYSQL_HOST'],port=int(os.getenv('MYSQL_PORT','3306')),
                                 user='root',password=os.environ['MYSQL_ROOT_PASSWORD'])
    cur=root.cursor()
    try:
        cur.execute(f'CREATE DATABASE `{name}` CHARACTER SET utf8mb4')
        cur.execute(f'USE `{name}`')
        cur.execute('CREATE TABLE cv_analyses (application_id INT UNSIGNED PRIMARY KEY,raw_text LONGTEXT,skills_json JSON,experience_years DECIMAL(4,1))')
        cur.execute('''CREATE TABLE match_scores (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,application_id INT UNSIGNED,
                      score_percentage DECIMAL(5,2) NOT NULL,missing_skills_json JSON,matched_skills_json JSON,
                      analyzed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        cur.execute('INSERT INTO match_scores (application_id,score_percentage) VALUES (999,42)')
        root.commit()
        os.environ.update(MYSQL_DATABASE=name,MYSQL_USER='root',MYSQL_PASSWORD=os.environ['MYSQL_ROOT_PASSWORD'])
        from app import db
        from app.analysis_jobs import JobRepository
        from app.nlp.pipeline import analyze_text
        from app.repository import MySQLAnalysisRepository
        db.ensure_schema();db.ensure_schema()  # idempotent additive upgrade, existing score retained
        queue=JobRepository()
        payload={'raw_text':'Skills: Python and SQL','kind':'pdf','requirements':'[{"skill":"Python","weight":5},{"skill":"Docker","weight":5}]'}
        assert queue.enqueue(7,payload,'local_rules')['state']=='queued'
        assert queue.enqueue(7,dict(payload,requirements='tampered'),'local_rules')['state']=='queued'
        with ThreadPoolExecutor(max_workers=2) as workers:
            jobs=list(workers.map(lambda _:queue.claim(),range(2)))
        assert sum(job is not None for job in jobs)==1
        job=next(j for j in jobs if j)
        assert job['payload']['requirements']==payload['requirements']
        result=analyze_text(**job['payload'],provider='local_rules')
        assert queue.complete(job,result)
        assert queue.complete(job,result) is False
        assert queue.status(7)['state']=='completed'
        assert MySQLAnalysisRepository().get_latest(7)['score_percentage']==50
        assert MySQLAnalysisRepository().get_latest(999)['score_percentage']==42
        assert queue.retry(7) is False
        queue.enqueue(8,payload,'local_rules');failed=queue.claim();queue.fail(failed,'Test failure')
        assert queue.status(8)['state']=='failed' and queue.retry(8)
        resumed=queue.claim();assert resumed['application_id']==8
        queue.complete(resumed,result)
        # Null scores remain unavailable, not zero; snapshot doesn't mix with a newer extraction.
        MySQLAnalysisRepository().save(9,analyze_text('Skills: SQL','pdf','',provider='local_rules'))
        assert MySQLAnalysisRepository().get_latest(9)['score_percentage'] is None
        print('PASS: real MySQL migrations, preserved data, concurrent claim, idempotency, retry, immutable snapshots, nullable score')
    finally:
        cur.execute(f'DROP DATABASE IF EXISTS `{name}`')
        root.commit();cur.close();root.close()


if __name__=='__main__':main()
