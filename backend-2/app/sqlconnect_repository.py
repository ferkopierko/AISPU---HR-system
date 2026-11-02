"""PostgreSQL analysis storage via authorized, compiled SQL Connect operations."""

from dataclasses import asdict
from datetime import datetime, timezone
from uuid import uuid4

from .schemas import AnalysisResponse
from .sqlconnect_client import SQLConnectClient, SQLConnectError


def normalized_result(application_id, result, at):
    return AnalysisResponse.model_validate({**asdict(result), "application_id": application_id,
                                           "analyzed_at": at}).model_dump(mode="json")


def storage_row(snapshot, *, raw_text=None, run_id=None):
    row = {"applicationId": snapshot["application_id"], "scorePercentage": snapshot["score_percentage"],
           "provider": snapshot["provider"], "modelVersion": snapshot["model_version"],
           "scoringVersion": snapshot["scoring_version"], "analyzedAt": snapshot["analyzed_at"],
           "result": snapshot}
    if raw_text is not None:
        row["rawText"] = raw_text
    if run_id is not None:
        row["id"] = run_id
    return row


class SQLConnectAnalysisRepository:
    def __init__(self, client=None, jobs=None):
        self.client = client or SQLConnectClient()
        if jobs is None:
            from .analysis_jobs import JobRepository
            jobs = JobRepository()
        self.jobs = jobs

    def save(self, application_id, result, *, connection=None):
        at = datetime.now(timezone.utc)
        snapshot = normalized_result(application_id, result, at)
        self.client.execute("SaveAnalysis", {
            "applicationId": application_id, "runId": str(uuid4()), "rawText": result.raw_text,
            "score": result.score_percentage, "provider": result.provider, "model": result.model_version,
            "scoring": result.scoring_version, "analyzedAt": snapshot["analyzed_at"], "result": snapshot,
        }, mutation=True)
        return at

    def get_latest(self, application_id):
        row = self.client.execute("GetAnalysis", {"applicationId": application_id}).get("cvAnalysis")
        if row is None:
            return None
        result = AnalysisResponse.model_validate(row["result"])
        if row["applicationId"] != application_id or result.application_id != application_id:
            raise SQLConnectError("SQL Connect vrátil výsledok inej prihlášky")
        return result.model_dump()

    def history(self, application_id):
        offset = 0
        while True:
            rows = self.client.execute("GetAnalysisHistory", {"applicationId": application_id,
                                       "offset": offset, "limit": 100}).get("analysisRuns", [])
            yield from rows
            if len(rows) < 100:
                break
            offset += len(rows)

    def delete(self, application_ids):
        if not application_ids:
            return 0
        ids = sorted(set(application_ids))
        # Queue row locks wait for an active worker before removing SQL results.
        queued = self.jobs.delete(ids)
        found = 0
        for application_id in ids:
            deleted = self.client.execute("DeleteAnalysis", {"applicationId": application_id}, mutation=True)
            found += int(deleted.get("latest") is not None or bool(deleted.get("history")) or application_id in queued)
        return found
