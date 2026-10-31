"""Copy MySQL analyses and score history into Firestore. Source is never modified.

python -m app.migrate_firestore           # counts only
python -m app.migrate_firestore --apply   # copies only absent applications
Run with analysis writes paused. Re-running skips completed applications.
"""

import argparse
from datetime import timezone
from types import SimpleNamespace

from . import db
from .firestore_db import get_client
from .firestore_repository import DEFAULTS, RESULT_FIELDS, analysis_document
from .repository import MySQLAnalysisRepository, _json, _num

# Polia viazané na jeden výpočet skóre (z analysis_json snapshotu daného riadku match_scores).
RUN_FIELDS = ("provider", "model_version", "scoring_version", "skill_evidence", "uncertain_skills",
              "requirements_snapshot", "requirements_sha256", "document_sha256", "analysis_metadata")


def migrate(apply: bool = False) -> dict:
    client = get_client()
    source = MySQLAnalysisRepository()
    counts = {"applications": 0, "history": 0, "skipped": 0, "copied": 0}
    with db.get_connection() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT DISTINCT application_id FROM match_scores ORDER BY application_id")
        application_ids = [row["application_id"] for row in cur.fetchall()]
        for application_id in application_ids:
            counts["applications"] += 1
            ref = client.collection("cv_analyses").document(str(application_id))
            if ref.get(timeout=10, retry=None).exists:
                counts["skipped"] += 1
                continue
            latest = source.get_latest(application_id)
            cur.execute("SELECT raw_text FROM cv_analyses WHERE application_id = %s", (application_id,))
            text_row = cur.fetchone()
            # Staršie riadky (bez analysis_json) nemajú nové polia – doplnia sa legacy hodnoty.
            payload = SimpleNamespace(**{**DEFAULTS, **latest}, raw_text=(text_row or {}).get("raw_text") or "")
            latest_document = analysis_document(application_id, payload,
                                                latest["analyzed_at"].replace(tzinfo=timezone.utc))
            cur.execute("SELECT * FROM match_scores WHERE application_id = %s ORDER BY analyzed_at, id",
                        (application_id,))
            scores = cur.fetchall()
            counts["history"] += len(scores)
            if not apply:
                continue
            for start in range(0, len(scores), 400):
                batch = client.batch()
                for score in scores[start:start + 400]:
                    history = {field: latest_document[field] for field in RESULT_FIELDS}
                    # Provider, dôkazy a požiadavky patria ku konkrétnemu výpočtu, nie k poslednej analýze.
                    history.update({field: DEFAULTS[field] for field in RUN_FIELDS})
                    snapshot = _json(score.get("analysis_json"), None) or {}
                    history.update({field: value for field, value in snapshot.items() if field in RESULT_FIELDS})
                    history.update(
                        analyzed_at=score["analyzed_at"].replace(tzinfo=timezone.utc),
                        score_percentage=_num(score["score_percentage"]),
                        skill_coverage=_num(score["skill_coverage"]),
                        text_similarity=_num(score["text_similarity"]),
                        matched_skills=_json(score["matched_skills_json"], []),
                        missing_skills=_json(score["missing_skills_json"], []),
                    )
                    # Stable source IDs make partial migrations safe to retry.
                    batch.set(ref.collection("history").document(f"mysql-{score['id']}"), history)
                batch.commit(timeout=20, retry=None)
            # Publish the latest result only after the full history has been copied.
            ref.create(latest_document, timeout=20, retry=None)
            counts["copied"] += 1
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print({"mode": "copy" if args.apply else "dry-run", **migrate(args.apply)})
