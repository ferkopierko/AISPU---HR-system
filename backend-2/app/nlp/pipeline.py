"""Celé spracovanie: súbor CV + požiadavky pozície -> výsledok analýzy."""

import json
import re
import hashlib
from dataclasses import dataclass, field

from . import contact, extract, matcher, parser, preprocess
from .providers import AzureCustomNer, local_entities, evidence_context, is_uncertain
from .azure_llm import AzureLlm


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
    score_percentage: float | None  # weighted coverage; unavailable without requirements
    provider: str = "local_rules"
    model_version: str = "local-rules-v1"
    scoring_version: str = "weighted-coverage-v1"
    skill_evidence: list[dict] = field(default_factory=list)
    uncertain_skills: list[str] = field(default_factory=list)
    requirements_snapshot: str = ""
    requirements_sha256: str = ""
    document_sha256: str = ""
    analysis_metadata: dict = field(default_factory=dict)


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


def _contains_phrase(text_lower: str, phrase: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text_lower) is not None


def analyze_cv(filename: str, data: bytes, requirements: str) -> AnalysisResult:
    kind = parser.detect_type(filename, data)
    raw_text = preprocess.clean_text(parser.extract_text(filename, data))
    return analyze_text(raw_text, kind, requirements, document_sha256=hashlib.sha256(data).hexdigest())


def analyze_text(raw_text: str, kind: str, requirements: str, *, provider: str | None = None,
                 document_sha256: str = "", azure_client=None) -> AnalysisResult:
    from ..config import settings
    selected = provider or settings.ai_provider
    job_text, listed_items, item_weights = parse_requirements(requirements)

    cv_doc = preprocess.analyze(raw_text)
    job_doc = preprocess.analyze(job_text)

    rule_skills = extract.extract_skills(cv_doc)
    if item_weights:
        # pri váhach presne zručnosti z poľa (nie ďalšie nájdené v texte – nemali by váhu)
        weights = _weighted_skills(item_weights)
        required = list(weights)
    else:
        weights = None
        required = _required_skills(job_doc, listed_items)

    # vlastné (neslovníkové) zručnosti sa v CV hľadajú ako fráza
    metadata = {}
    if selected == "azure_custom_ner":
        entities, model_version = (azure_client or AzureCustomNer(settings)).extract(raw_text)
    elif selected == "azure_llm":
        client = azure_client or AzureLlm(settings)
        entities, model_version = client.extract(raw_text)
        metadata = getattr(client, "metadata", {})
    elif selected == "local_rules":
        rule_skills += [s for s in required if s not in rule_skills and _contains_phrase(raw_text.lower(), s)]
        entities, model_version = local_entities(raw_text, rule_skills), "local-rules-v1"
    else:
        raise ValueError("Neznámy poskytovateľ AI")
    cv_skills = sorted({e.skill for e in entities})
    accepted = {e.skill for e in entities if not is_uncertain(raw_text, e, settings.azure_confidence_threshold)}
    uncertain = [s for s in required if s in cv_skills and s not in accepted]
    matched, missing, coverage = matcher.skill_match(required, list(accepted), weights)
    evidence = []
    for skill in required:
        mentions = [e for e in entities if e.skill == skill]
        evidence.append({"skill": skill, "weight": weights[skill] if weights else 1,
                         "status": "found" if skill in matched else "uncertain" if skill in uncertain else "missing",
                         "mentions": [{"text": e.text, "context": evidence_context(raw_text, e), "offset": e.offset,
                                       "length": e.length, "confidence": e.confidence, "source": e.source,
                                       "assertion": e.assertion} for e in mentions]})
    similarity = matcher.text_similarity(
        preprocess.tokens_for_vectorizer(job_doc), preprocess.tokens_for_vectorizer(cv_doc)
    )

    return AnalysisResult(
        raw_text=raw_text,
        file_kind=kind,
        candidate_name=contact.extract_name(cv_doc),
        candidate_phone=contact.extract_phone(raw_text),
        cv_skills=cv_skills,
        education=extract.extract_education(cv_doc),
        experience_years=extract.extract_experience_years(raw_text),
        required_skills=required,
        matched_skills=matched,
        missing_skills=[s for s in missing if s not in uncertain],
        text_similarity=round(100 * similarity, 2),
        skill_coverage=None if coverage is None else round(100 * coverage, 2),
        score_percentage=None if coverage is None else round(100 * coverage, 2),
        provider=selected,
        model_version=model_version,
        skill_evidence=evidence,
        uncertain_skills=uncertain,
        requirements_snapshot=requirements,
        requirements_sha256=hashlib.sha256(requirements.encode()).hexdigest(),
        document_sha256=document_sha256 or hashlib.sha256(raw_text.encode()).hexdigest(),
        analysis_metadata=metadata,
    )
