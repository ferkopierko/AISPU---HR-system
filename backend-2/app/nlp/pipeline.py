"""Celé spracovanie: súbor CV + požiadavky pozície -> výsledok analýzy."""

import json
import re
from dataclasses import dataclass

from . import contact, extract, matcher, parser, preprocess
from .skills import DISPLAY


@dataclass
class AnalysisResult:
    raw_text: str
    file_kind: str  # pdf | docx
    candidate_name: str | None
    candidate_phone: str | None
    cv_skills: list[str]
    education: dict
    experience_years: float | None
    required_skills: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    text_similarity: float  # 0..100
    skill_coverage: float | None  # 0..100
    score_percentage: float  # 0..100


def parse_requirements(requirements: str) -> tuple[str, list[str], dict[str, float] | None]:
    """Požiadavky v rovnakých formátoch ako jobs.requirements v Azure SQL:

    - voľný text                    "Java, SQL, 2 roky praxe"
    - pole zručností                ["Java", "SQL"]
    - pole zručností s váhou        [{"skill": "Java", "weight": 60}, {"skill": "SQL", "weight": 40}]

    Vráti (text na porovnanie, položky poľa, váhy {položka: váha} alebo None).
    """
    stripped = requirements.strip()
    if stripped.startswith("["):
        try:
            items = json.loads(stripped)
        except json.JSONDecodeError:
            items = None
        if isinstance(items, list) and items and all(isinstance(i, str) for i in items):
            names = [i.strip() for i in items if i.strip()]
            return ", ".join(names), names, None
        if isinstance(items, list) and items and all(_is_weighted_item(i) for i in items):
            weights: dict[str, float] = {}
            for i in items:
                name = i["skill"].strip()
                weights[name] = weights.get(name, 0) + float(i["weight"])
            return ", ".join(weights), list(weights), weights
    return stripped, [], None


def _is_weighted_item(item) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("skill"), str) and item["skill"].strip() != ""
        and isinstance(item.get("weight"), (int, float)) and not isinstance(item["weight"], bool)
        and item["weight"] > 0
    )


def _item_skills(item: str) -> list[str]:
    """Kanonické zručnosti položky; neznáma položka (napr. „team leadership“)
    je vlastná zručnosť malými písmenami."""
    return extract.extract_skills(preprocess.analyze(item)) or [item.lower()]


def _required_skills(job_doc, listed_items: list[str]) -> list[str]:
    """Zručnosti z textu požiadaviek + neznáme položky poľa ako vlastné zručnosti."""
    required = extract.extract_skills(job_doc)
    for item in listed_items:
        for skill in _item_skills(item):
            if skill not in required:
                required.append(skill)
    return required


def _weighted_skills(item_weights: dict[str, float]) -> dict[str, float]:
    """{položka: váha} -> {kanonická zručnosť: váha}. Ak položka obsahuje viac
    zručností („Docker a Kubernetes“), váha sa medzi ne rozdelí rovnakým dielom."""
    weights: dict[str, float] = {}
    for item, weight in item_weights.items():
        skills = _item_skills(item)
        for skill in skills:
            weights[skill] = weights.get(skill, 0) + weight / len(skills)
    return weights


def _display_names(listed_items: list[str]) -> dict[str, str]:
    """{kanonická zručnosť: tvar z požiadaviek pozície} – položka, ktorá je presne
    jedna zručnosť („REST API“, „Postgres“), sa zobrazí tak, ako ju napísal HR."""
    names: dict[str, str] = {}
    for item in listed_items:
        skills = _item_skills(item)
        if len(skills) == 1:
            names.setdefault(skills[0], item.strip())
    return names


def _contains_phrase(text_lower: str, phrase: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text_lower) is not None


def analyze_cv(filename: str, data: bytes, requirements: str) -> AnalysisResult:
    kind = parser.detect_type(filename, data)
    raw_text = preprocess.clean_text(parser.extract_text(filename, data))
    job_text, listed_items, item_weights = parse_requirements(requirements)

    cv_doc = preprocess.analyze(raw_text)
    job_doc = preprocess.analyze(job_text)

    cv_skills = extract.extract_skills(cv_doc)
    if item_weights:
        # pri váhach presne zručnosti z poľa (nie ďalšie nájdené v texte – nemali by váhu)
        weights = _weighted_skills(item_weights)
        required = list(weights)
    else:
        weights = None
        required = _required_skills(job_doc, listed_items)

    # vlastné (neslovníkové) zručnosti sa v CV hľadajú ako fráza
    cv_lower = raw_text.lower()
    found = cv_skills + [s for s in required if s not in cv_skills and _contains_phrase(cv_lower, s)]

    matched, missing, coverage = matcher.skill_match(required, found, weights)
    similarity = matcher.text_similarity(
        preprocess.tokens_for_vectorizer(job_doc), preprocess.tokens_for_vectorizer(cv_doc)
    )

    names = _display_names(listed_items)

    def label(skills: list[str]) -> list[str]:
        return [names.get(s) or DISPLAY.get(s, s) for s in skills]

    return AnalysisResult(
        raw_text=raw_text,
        file_kind=kind,
        candidate_name=contact.extract_name(cv_doc),
        candidate_phone=contact.extract_phone(raw_text),
        cv_skills=label(cv_skills),
        education=extract.extract_education(cv_doc),
        experience_years=extract.extract_experience_years(raw_text),
        required_skills=label(required),
        matched_skills=label(matched),
        missing_skills=label(missing),
        text_similarity=round(100 * similarity, 2),
        skill_coverage=None if coverage is None else round(100 * coverage, 2),
        score_percentage=matcher.final_score(similarity, coverage),
    )
