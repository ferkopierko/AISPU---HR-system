"""Non-destructive Firestore -> PostgreSQL migration. Pause application writes first.

python -m app.migrate_sqlconnect            # validate and count only
python -m app.migrate_sqlconnect --apply    # atomically import absent applications
"""

import argparse
import gzip
import json
from uuid import NAMESPACE_URL, uuid5

from .firestore_db import get_client
from .firestore_repository import DEFAULTS
from .schemas import AnalysisResponse
from .sqlconnect_repository import SQLConnectAnalysisRepository, storage_row


def normalize(value, application_id):
    return AnalysisResponse.model_validate({**DEFAULTS, **value, "application_id": application_id}).model_dump(mode="json")


def verify(target, application_id, latest, raw_text, runs):
    current = target.client.execute("ExportAnalysis", {"applicationId": application_id}).get("cvAnalysis")
    if current is None or current.get("rawText") != raw_text or normalize(current["result"], application_id) != latest:
        raise RuntimeError(f"Migračná kontrola prihlášky {application_id} zlyhala; zdroj zostal zachovaný")
    actual = {row["id"]: normalize(row["result"], application_id) for row in target.history(application_id)}
    expected = {row["id"]: row["result"] for row in runs}
    if actual != expected:
        raise RuntimeError(f"História prihlášky {application_id} sa nezhoduje; cieľ sa neprepisuje")


def migrate(*, apply=False, source=None, target=None):
    source = source or get_client()
    target = target or SQLConnectAnalysisRepository()
    target.client.require_postgresql()
    counts = {"applications": 0, "history": 0, "copied": 0, "verified_existing": 0}
    for document in source.collection("cv_analyses").stream():
        application_id = int(document.id)
        value = document.to_dict()
        latest = normalize(value, application_id)
        raw_text = gzip.decompress(value["raw_text_gzip"]).decode("utf-8")
        runs = []
        for history in document.reference.collection("history").stream():
            snapshot = normalize(history.to_dict(), application_id)
            stable_id = str(uuid5(NAMESPACE_URL, f"firestore/{application_id}/{history.id}"))
            runs.append(storage_row(snapshot, run_id=stable_id))
        payload = {"analysis": storage_row(latest, raw_text=raw_text), "runs": runs}
        if len(runs) > 10000 or len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > 900_000:
            raise RuntimeError(f"Prihláška {application_id} presahuje bezpečný limit jedného importu; nebola skrátená")
        counts["applications"] += 1
        counts["history"] += len(runs)
        if target.get_latest(application_id) is not None:
            # Existing data is skipped only when the entire imported snapshot matches.
            verify(target, application_id, latest, raw_text, runs)
            counts["verified_existing"] += 1
            continue
        if apply:
            target.client.execute("ImportAnalysis", payload, mutation=True)
            verify(target, application_id, latest, raw_text, runs)
            counts["copied"] += 1
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print({"mode": "copy" if args.apply else "dry-run", **migrate(apply=args.apply)})
