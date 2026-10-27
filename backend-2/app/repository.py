"""Mapper medzi tabuľkami cv_analyses / match_scores a objektmi aplikácie."""

import json
from datetime import datetime

from . import db
from .nlp.pipeline import AnalysisResult


class AnalysisRepository:
    def save(self, application_id: int, result: AnalysisResult) -> datetime:
        """Uloží analýzu v jednej transakcii.

        cv_analyses má 1 riadok na prihlášku (pri opakovanej analýze sa prepíše),
        match_scores uchováva históriu – každá analýza je nový riadok.
        """
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cv_analyses (application_id, raw_text, skills_json, education_json, experience_years)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    raw_text = VALUES(raw_text),
                    skills_json = VALUES(skills_json),
                    education_json = VALUES(education_json),
                    experience_years = VALUES(experience_years)
                """,
                (
                    application_id,
                    result.raw_text,
                    json.dumps(result.cv_skills),
                    json.dumps(result.education),
                    result.experience_years,
                ),
            )
            cur.execute(
                """
                INSERT INTO match_scores (application_id, score_percentage, text_similarity, skill_coverage,
                                          missing_skills_json, matched_skills_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    application_id,
                    result.score_percentage,
                    result.text_similarity,
                    result.skill_coverage,
                    json.dumps(result.missing_skills),
                    json.dumps(result.matched_skills),
                ),
            )
            score_id = cur.lastrowid
            cur.execute("SELECT analyzed_at FROM match_scores WHERE id = %s", (score_id,))
            analyzed_at = cur.fetchone()[0]
            conn.commit()
            return analyzed_at

    def delete(self, application_ids: list[int]) -> int:
        """Zmaže analýzy (text CV, zručnosti, skóre) prihlášok – GDPR. Vráti počet prihlášok s dátami."""
        if not application_ids:
            return 0
        marks = ", ".join(["%s"] * len(application_ids))
        with db.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(f"SELECT COUNT(DISTINCT application_id) FROM match_scores WHERE application_id IN ({marks})",
                        application_ids)
            found = cur.fetchone()[0]
            cur.execute(f"DELETE FROM match_scores WHERE application_id IN ({marks})", application_ids)
            cur.execute(f"DELETE FROM cv_analyses WHERE application_id IN ({marks})", application_ids)
            conn.commit()
            return found

    def get_latest(self, application_id: int) -> dict | None:
        """Posledná analýza prihlášky, alebo None."""
        with db.get_connection() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                """
                SELECT m.application_id, m.score_percentage, m.text_similarity, m.skill_coverage,
                       m.matched_skills_json, m.missing_skills_json, m.analyzed_at,
                       c.skills_json, c.education_json, c.experience_years
                FROM match_scores m
                LEFT JOIN cv_analyses c ON c.application_id = m.application_id
                WHERE m.application_id = %s
                ORDER BY m.analyzed_at DESC, m.id DESC
                LIMIT 1
                """,
                (application_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return {
            "application_id": row["application_id"],
            "score_percentage": _num(row["score_percentage"]),
            "text_similarity": _num(row["text_similarity"]),
            "skill_coverage": _num(row["skill_coverage"]),
            "matched_skills": _json(row["matched_skills_json"], []),
            "missing_skills": _json(row["missing_skills_json"], []),
            "cv_skills": _json(row["skills_json"], []),
            "education": _json(row["education_json"], {"degrees": [], "institutions": []}),
            "experience_years": _num(row["experience_years"]),
            "analyzed_at": row["analyzed_at"],
        }


def _json(value, default):
    if value is None:
        return default
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    return json.loads(value) if isinstance(value, str) else value


def _num(value):
    return None if value is None else float(value)
