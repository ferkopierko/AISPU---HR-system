"""Fronta analýz vo Firestore – rovnaké správanie ako MySQL fronta v analysis_jobs.py.

Dokument analysis_jobs/{application_id}. Pole lease_until určuje, kedy si úlohu môže worker
vziať: pri zaradení je to čas zaradenia, počas spracovania koniec prenájmu (300 s) a hotové
alebo zlyhané úlohy ho nemajú. Výber úlohy tak stačí jediným dotazom lease_until <= teraz,
na ktorý postačuje automatický jednopoľový index (bez nasadzovania zložených indexov).
Payload obsahuje text CV, preto je komprimovaný gzip a pri GDPR mazaní sa maže.
"""

import gzip
import json
import uuid
from datetime import datetime, timedelta, timezone

from google.api_core.exceptions import AlreadyExists
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from .firestore_db import get_client
from .repository import AnalysisTooLargeError

COLLECTION = "analysis_jobs"
LEASE = timedelta(seconds=300)
MAX_ATTEMPTS = 3
MAX_PAYLOAD_BYTES = 900_000  # dokument má limit 1 MiB
STATUS_FIELDS = ("application_id", "state", "provider", "attempts", "error_message", "updated_at")


def _now():
    return datetime.now(timezone.utc)


def _finished(state, message=None):
    return {"state": state, "lock_token": None, "lease_until": firestore.DELETE_FIELD,
            "error_message": message, "updated_at": firestore.SERVER_TIMESTAMP}


class FirestoreJobRepository:
    def __init__(self, client=None, analyses=None):
        self.client = client if client is not None else get_client()
        self._analyses = analyses

    @property
    def analyses(self):
        if self._analyses is None:
            from .firestore_repository import FirestoreAnalysisRepository
            self._analyses = FirestoreAnalysisRepository(self.client, jobs=self)
        return self._analyses

    def _ref(self, application_id):
        return self.client.collection(COLLECTION).document(str(application_id))

    def status(self, application_id):
        snapshot = self._ref(application_id).get(field_paths=list(STATUS_FIELDS), timeout=10, retry=None)
        if not snapshot.exists:
            return None
        row = snapshot.to_dict()
        return {field: row.get(field) for field in STATUS_FIELDS}

    def enqueue(self, application_id, payload, provider):
        data = gzip.compress(json.dumps(payload, ensure_ascii=False).encode("utf-8"), mtime=0)
        if len(data) > MAX_PAYLOAD_BYTES:
            raise AnalysisTooLargeError("Text CV je príliš veľký na uloženie analýzy. Použite kratšie CV.")
        now = _now()
        try:
            # Idempotentné zaradenie: existujúcu úlohu (aj hotovú/zlyhanú) mení iba explicitný retry.
            self._ref(application_id).create({
                "application_id": application_id, "state": "queued", "payload_gzip": data,
                "provider": provider, "attempts": 0, "lock_token": None, "lease_until": now,
                "error_message": None, "created_at": now, "updated_at": firestore.SERVER_TIMESTAMP,
            }, timeout=10, retry=None)
        except AlreadyExists:
            pass
        return self.status(application_id)

    def retry(self, application_id):
        ref = self._ref(application_id)

        @firestore.transactional
        def run(transaction):
            snapshot = ref.get(transaction=transaction)
            if not snapshot.exists or snapshot.get("state") != "failed":
                return False
            transaction.update(ref, {"state": "queued", "attempts": 0, "lock_token": None, "lease_until": _now(),
                                     "error_message": None, "updated_at": firestore.SERVER_TIMESTAMP})
            return True

        return run(self.client.transaction())

    def claim(self):
        query = (self.client.collection(COLLECTION)
                 .where(filter=FieldFilter("lease_until", "<=", _now()))
                 .order_by("lease_until").limit(1))

        @firestore.transactional
        def run(transaction):
            snapshots = list(transaction.get(query))
            if not snapshots:
                return None
            snapshot = snapshots[0]
            row = snapshot.to_dict()
            if row.get("attempts", 0) >= MAX_ATTEMPTS:
                transaction.update(snapshot.reference, _finished(
                    "failed", "Spracovanie bolo opakovane prerušené. Analýzu môže HR zopakovať."))
                return None
            token = str(uuid.uuid4())
            transaction.update(snapshot.reference, {
                "state": "processing", "attempts": row.get("attempts", 0) + 1, "lock_token": token,
                "lease_until": _now() + LEASE, "error_message": None, "updated_at": firestore.SERVER_TIMESTAMP,
            })
            return {"application_id": row["application_id"], "provider": row["provider"],
                    "attempts": row.get("attempts", 0), "lock_token": token,
                    "payload": json.loads(gzip.decompress(row["payload_gzip"]).decode("utf-8"))}

        return run(self.client.transaction())

    def delete(self, application_ids):
        """Zmaže úlohy (payload obsahuje text CV – GDPR). Vráti ID prihlášok, ktoré úlohu mali."""
        found = set()
        for application_id in sorted(set(application_ids)):
            ref = self._ref(application_id)
            if ref.get(field_paths=["state"], timeout=10, retry=None).exists:
                found.add(application_id)
                ref.delete(timeout=10, retry=None)
        return found

    def complete(self, job, result):
        ref = self._ref(job["application_id"])

        # Výsledok, história aj stav úlohy v jednej transakcii: ak medzitým úlohu zmazalo GDPR
        # mazanie alebo ju prevzal iný worker (vypršaný prenájom), nezapíše sa nič.
        @firestore.transactional
        def run(transaction):
            snapshot = ref.get(transaction=transaction)
            if (not snapshot.exists or snapshot.get("state") != "processing"
                    or snapshot.get("lock_token") != job["lock_token"]):
                return False
            self.analyses.stage(transaction, job["application_id"], result)
            transaction.update(ref, _finished("completed"))
            return True

        return run(self.client.transaction())

    def fail(self, job, message):
        ref = self._ref(job["application_id"])

        @firestore.transactional
        def run(transaction):
            snapshot = ref.get(transaction=transaction)
            if (snapshot.exists and snapshot.get("state") == "processing"
                    and snapshot.get("lock_token") == job["lock_token"]):
                transaction.update(ref, _finished("failed", message[:500]))

        run(self.client.transaction())
