"""Latest analysis and immutable score history, committed atomically in Firestore."""

import gzip
import json
from datetime import datetime, timezone

from .firestore_db import get_client
from .nlp.pipeline import AnalysisResult

RESULT_FIELDS = (
    "application_id", "score_percentage", "text_similarity", "skill_coverage",
    "matched_skills", "missing_skills", "cv_skills", "education",
    "experience_years", "analyzed_at",
)


class AnalysisTooLargeError(ValueError):
    pass


def analysis_document(application_id: int, result: AnalysisResult, at: datetime) -> dict:
    document = {field: getattr(result, field) for field in RESULT_FIELDS
                if field not in {"application_id", "analyzed_at"}}
    document.update(application_id=application_id, analyzed_at=at)
    # A document has a 1 MiB limit. Reserve room for Firestore field encoding.
    text = gzip.compress(result.raw_text.encode("utf-8"), mtime=0)
    if len(text) > 700_000 or len(json.dumps(document, default=str).encode("utf-8")) > 200_000:
        raise AnalysisTooLargeError("Text CV je príliš veľký na uloženie analýzy. Použite kratšie CV.")
    document.update(raw_text_gzip=text, schema_version=1)
    return document


class FirestoreAnalysisRepository:
    def __init__(self, client=None):
        self.client = client if client is not None else get_client()

    def save(self, application_id: int, result: AnalysisResult) -> datetime:
        at = datetime.now(timezone.utc)
        document = analysis_document(application_id, result, at)
        ref = self.client.collection("cv_analyses").document(str(application_id))
        batch = self.client.batch()
        batch.set(ref, document)
        batch.create(ref.collection("history").document(),
                     {field: document[field] for field in RESULT_FIELDS})
        batch.commit(timeout=20, retry=None)
        return at

    def get_latest(self, application_id: int) -> dict | None:
        snapshot = self.client.collection("cv_analyses").document(str(application_id)).get(
            field_paths=list(RESULT_FIELDS), timeout=10, retry=None)
        if not snapshot.exists:
            return None
        document = snapshot.to_dict()
        return {field: document[field] for field in RESULT_FIELDS}

    def delete(self, application_ids: list[int]) -> int:
        found = 0
        for application_id in sorted(set(application_ids)):
            ref = self.client.collection("cv_analyses").document(str(application_id))
            exists = ref.get(field_paths=["application_id"], timeout=10, retry=None).exists
            # Explicit batches propagate failures to the GDPR caller. Delete the
            # parent last, so an interrupted operation remains visible and retryable.
            while True:
                history = list(ref.collection("history").select([]).limit(400).stream(
                    timeout=20, retry=None))
                if not history:
                    break
                exists = True
                batch = self.client.batch()
                for snapshot in history:
                    batch.delete(snapshot.reference)
                batch.commit(timeout=20, retry=None)
            ref.delete(timeout=10, retry=None)
            found += int(exists)
        return found
