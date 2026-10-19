"""Extrakcia entít z CV: zručnosti, vzdelanie, dĺžka praxe."""

import re
from datetime import date

from spacy.tokens import Doc

from .skills import DEGREES

# „5 years“, „3+ yrs“, „2.5 years“, „4 roky“, „10 rokov“
_YEARS_RE = re.compile(
    r"(?<![\d.])(\d{1,2}(?:[.,]\d)?)\s*\+?\s*(?:years?|yrs?|rokov|roky|rok)\b", re.I
)
# „2018 - 2021“, „03/2019 - present“, „2020 - súčasnosť“
_RANGE_RE = re.compile(
    r"(?:\d{1,2}[/.])?((?:19|20)\d{2})\s*(?:-|to|až|do)\s*"
    r"(?:(?:\d{1,2}[/.])?((?:19|20)\d{2})|(present|current|now|today|súčasnosť|súčasnost|teraz|doteraz))",
    re.I,
)
_EDUCATION_LINE_RE = re.compile(
    r"universit|univerzit|college|school|škola|fakult|faculty|degree|bachelor|master|ph\.?d|"
    r"\b(?:bc|ing|mgr|msc|bsc)\b\.?|štúdi|education|vzdelan",
    re.I,
)
_INSTITUTION_RE = re.compile(r"universit|univerzit|college|institute|fakult|faculty|vysoká škola", re.I)
_PART_SPLIT_RE = re.compile(r"\s[-|]\s|,|;|\t")

MAX_YEARS = 50.0
DEGREE_ORDER = list(DEGREES)  # od najvyššieho


def extract_skills(doc: Doc) -> list[str]:
    """Kanonické názvy zručností v poradí prvého výskytu."""
    seen: dict[str, None] = {}
    for ent in doc.ents:
        if ent.label_ == "SKILL":
            seen.setdefault(ent.ent_id_, None)
    return list(seen)


def extract_education(doc: Doc) -> dict:
    """Dosiahnuté stupne (od najvyššieho) a názvy škôl (spaCy ORG / riadky so školou)."""
    degrees = {ent.ent_id_ for ent in doc.ents if ent.label_ == "DEGREE"}

    institutions: dict[str, None] = {}
    for ent in doc.ents:
        if ent.label_ == "ORG" and _INSTITUTION_RE.search(ent.text):
            institutions.setdefault(ent.text.strip(), None)
    # štatistické NER slovenské názvy často nespozná – doplniť z riadkov,
    # riadok sa rozdelí na časti („Ing. - TU Košice, Fakulta…, 2011 - 2016“)
    for line in doc.text.splitlines():
        for part in _PART_SPLIT_RE.split(line):
            part = part.strip(" •")
            if _INSTITUTION_RE.search(part) and len(part) <= 100:
                if not any(part in known or known in part for known in institutions):
                    institutions.setdefault(part, None)

    return {
        "degrees": [d for d in DEGREE_ORDER if d in degrees],
        "institutions": list(institutions)[:5],
    }


def extract_experience_years(text: str, today: date | None = None) -> float | None:
    """Dĺžka praxe v rokoch.

    1. Explicitná zmienka („5+ years of experience“) – berie sa najväčšia.
    2. Inak súčet období „2018 - 2021“ (prekrývajúce sa sa zlúčia); riadky,
       ktoré vyzerajú ako vzdelanie, sa preskočia.
    3. Nič nenájdené -> None.
    """
    today = today or date.today()

    explicit = [float(m.group(1).replace(",", ".")) for m in _YEARS_RE.finditer(text)]
    explicit = [y for y in explicit if 0 < y <= MAX_YEARS]
    if explicit:
        return round(max(explicit), 1)

    intervals = []
    for line in text.splitlines():
        if _EDUCATION_LINE_RE.search(line):
            continue
        for m in _RANGE_RE.finditer(line):
            start = int(m.group(1))
            end = today.year if m.group(3) else int(m.group(2))
            if start <= end <= today.year:
                intervals.append((start, end))
    if not intervals:
        return None

    intervals.sort()
    total, (cur_start, cur_end) = 0, intervals[0]
    for start, end in intervals[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
        else:
            total += cur_end - cur_start
            cur_start, cur_end = start, end
    total += cur_end - cur_start
    return round(min(float(total), MAX_YEARS), 1)
