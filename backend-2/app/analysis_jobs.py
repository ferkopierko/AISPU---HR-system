"""Durable MySQL work queue; atomic claims, expiring leases, bounded crash recovery."""

import json
import logging
import threading
import uuid

from . import db, storage
from .config import settings
from .nlp.pipeline import analyze_text
from .nlp.providers import ProviderError
from .repository import AnalysisTooLargeError, MySQLAnalysisRepository, _json

log = logging.getLogger("uvicorn.error")


class JobRepository:
    def status(self, application_id):
        with db.get_connection() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute("SELECT application_id, state, provider, attempts, error_message, updated_at FROM analysis_jobs WHERE application_id=%s", (application_id,))
            return cur.fetchone()

    def enqueue(self, application_id, payload, provider):
        with db.get_connection() as conn:
            cur = conn.cursor()
            # Idempotent submission: existing active/completed/failed jobs require explicit retry.
            cur.execute("INSERT IGNORE INTO analysis_jobs (application_id,state,payload_json,provider) VALUES (%s,'queued',%s,%s)",
                        (application_id, json.dumps(payload, ensure_ascii=False), provider))
            conn.commit()
        return self.status(application_id)

    def retry(self, application_id):
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE analysis_jobs SET state='queued', attempts=0, lock_token=NULL, lease_until=NULL, error_message=NULL WHERE application_id=%s AND state='failed'", (application_id,))
            changed = cur.rowcount == 1
            conn.commit()
        return changed

    def claim(self):
        with db.get_connection() as conn:
            # No broad UPDATE before the claim: its range locks can deadlock workers.
            conn.start_transaction(isolation_level="READ COMMITTED")
            cur = conn.cursor(dictionary=True)
            cur.execute("""SELECT application_id,payload_json,provider,attempts FROM analysis_jobs
                           WHERE state='queued' OR (state='processing' AND lease_until < UTC_TIMESTAMP())
                           ORDER BY created_at,application_id LIMIT 1 FOR UPDATE SKIP LOCKED""")
            row = cur.fetchone()
            if row:
                if row["attempts"] >= 3:
                    cur.execute("UPDATE analysis_jobs SET state='failed',error_message='Spracovanie bolo opakovane prerušené. Analýzu môže HR zopakovať.',lock_token=NULL,lease_until=NULL WHERE application_id=%s", (row["application_id"],))
                    conn.commit()
                    return None
                row["lock_token"] = str(uuid.uuid4())
                cur.execute("""UPDATE analysis_jobs SET state='processing', attempts=attempts+1, lock_token=%s,
                               lease_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 300 SECOND), error_message=NULL WHERE application_id=%s""",
                            (row["lock_token"], row["application_id"]))
                row["payload"] = _json(row.pop("payload_json"), {})
            conn.commit()
            return row

    def delete(self, application_ids):
        """Zmaže úlohy (payload obsahuje text CV – GDPR). Vráti ID prihlášok, ktoré úlohu mali."""
        if not application_ids:
            return set()
        marks = ", ".join(["%s"] * len(application_ids))
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(f"SELECT application_id FROM analysis_jobs WHERE application_id IN ({marks}) FOR UPDATE", list(application_ids))
            found = {row[0] for row in cur.fetchall()}
            cur.execute(f"DELETE FROM analysis_jobs WHERE application_id IN ({marks})", list(application_ids))
            conn.commit()
        return found

    def complete(self, job, result):
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT lock_token FROM analysis_jobs WHERE application_id=%s AND state='processing' FOR UPDATE", (job["application_id"],))
            row = cur.fetchone()
            if not row or row[0] != job["lock_token"]:
                return False
            if settings.db_provider == "firestore":
                # Firestore nemôže byť súčasťou MySQL transakcie. Zámok riadku úlohy sa drží počas
                # zápisu (iný worker ani GDPR mazanie sa nevkliní) a úloha je completed až po
                # potvrdenom zápise; pri chybe zostane processing a fail() ju označí ako failed.
                storage.get_repository().save(job["application_id"], result)
            else:
                # Snapshot aj stav úlohy atomicky v jednej transakcii.
                MySQLAnalysisRepository().save(job["application_id"], result, connection=conn)
            cur.execute("UPDATE analysis_jobs SET state='completed', lock_token=NULL, lease_until=NULL, error_message=NULL WHERE application_id=%s", (job["application_id"],))
            conn.commit()
            return True

    def fail(self, job, message):
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE analysis_jobs SET state='failed',error_message=%s,lock_token=NULL,lease_until=NULL WHERE application_id=%s AND state='processing' AND lock_token=%s",
                        (message[:500], job["application_id"], job["lock_token"]))
            conn.commit()


def process_one(repository):
    job = repository.claim()
    if not job:
        return False
    try:
        result = analyze_text(**job["payload"], provider=job["provider"])
        repository.complete(job, result)
    except ProviderError as exc:
        repository.fail(job, str(exc))
    except AnalysisTooLargeError as exc:
        repository.fail(job, str(exc))
    except Exception:
        # Never log CV text or a remote exception body (may contain credentials/PII).
        log.error("Analýza prihlášky %s zlyhala; podrobnosti sa nezapisujú do logu", job["application_id"])
        repository.fail(job, "Analýzu sa nepodarilo dokončiť. Prihláška a CV zostali uložené.")
    return True


class AnalysisWorker:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, name="cv-analysis-worker", daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=5)

    def run(self):
        ready = False
        while not self.stop_event.is_set():
            try:
                if not ready:
                    db.ensure_schema()
                    ready = True
                if not process_one(JobRepository()):
                    self.stop_event.wait(1)
            except Exception:
                ready = False
                log.error("Rad analýz je dočasne nedostupný, ďalší pokus o 5 sekúnd")
                self.stop_event.wait(5)
