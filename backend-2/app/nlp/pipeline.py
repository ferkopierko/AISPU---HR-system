"""Celé spracovanie: súbor CV + požiadavky pozície -> výsledok analýzy."""

import json
import re
from dataclasses import dataclass

from . import extract, matcher, parser, preprocess


@dataclass
class AnalysisResult:
    raw_text: str
    cv_skills: list[str]
    education: dict
    experience_years: float | None
    required_skills: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    text_similarity: float  # 0..100
    skill_coverage: float | None  # 0..100
    score_percentage: float  # 0..100


def parse_requirements(requirements: str) -> tuple[str, list[str]]:
    """Požiadavky môžu byť voľný text alebo JSON pole (ako jobs.requirements v Azure SQL).

    Vráti (text na porovnanie, položky JSON poľa – prázdne pri voľnom texte).
    """
    stripped = requirements.strip()
    if stripped.startswith("["):
        try:
            items = json.loads(stripped)
        except json.JSONDecodeError:
            items = None
        if isinstance(items, list) and all(isinstance(i, str) for i in items):
            items = [i.strip() for i in items if i.strip()]
            return ", ".join(items), items
    return stripped, []


def _required_skills(job_doc, listed_items: list[str]) -> list[str]:
    """Zručnosti z textu požiadaviek. Položka JSON poľa, ktorú slovník nepozná
    (napr. „team leadership“), sa berie ako vlastná zručnosť malými písmenami."""
    required = extract.extract_skills(job_doc)
    for item in listed_items:
        item_skills = extract.extract_skills(preprocess.analyze(item))
        if not item_skills:
            custom = item.lower()
            if custom not in required:
                required.append(custom)
    return required


def _contains_phrase(text_lower: str, phrase: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text_lower) is not None


def analyze_cv(filename: str, data: bytes, requirements: str) -> AnalysisResult:
    raw_text = preprocess.clean_text(parser.extract_text(filename, data))
    job_text, listed_items = parse_requirements(requirements)

    cv_doc = preprocess.analyze(raw_text)
    job_doc = preprocess.analyze(job_text)

    cv_skills = extract.extract_skills(cv_doc)
    required = _required_skills(job_doc, listed_items)

    # vlastné (neslovníkové) zručnosti sa v CV hľadajú ako fráza
    cv_lower = raw_text.lower()
    found = cv_skills + [s for s in required if s not in cv_skills and _contains_phrase(cv_lower, s)]

    matched, missing, coverage = matcher.skill_match(required, found)
    similarity = matcher.text_similarity(
        preprocess.tokens_for_vectorizer(job_doc), preprocess.tokens_for_vectorizer(cv_doc)
    )

    return AnalysisResult(
        raw_text=raw_text,
        cv_skills=cv_skills,
        education=extract.extract_education(cv_doc),
        experience_years=extract.extract_experience_years(raw_text),
        required_skills=required,
        matched_skills=matched,
        missing_skills=missing,
        text_similarity=round(100 * similarity, 2),
        skill_coverage=None if coverage is None else round(100 * coverage, 2),
        score_percentage=matcher.final_score(similarity, coverage),
    )
