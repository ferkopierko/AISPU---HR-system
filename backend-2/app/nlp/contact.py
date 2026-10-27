"""Meno a telefón uchádzača z textu CV.

Heuristika – CV nemá pevný formát, výsledok preto nemusí byť vždy správny:
- meno: spaCy entita PERSON v hlavičke CV, inak prvý riadok, ktorý vyzerá ako meno,
- telefón: číslo s 9–15 číslicami; prednosť má číslo pri slove „tel/phone/mobil“
  alebo s predvoľbou „+“. Obdobia „2018 - 2021“ a dátumy „03/2019“ sa vynechajú.
"""

import re

from spacy.tokens import Doc

HEADER_LINES = 6  # meno býva na začiatku CV

_PHONE_RE = re.compile(r"(?<![\w+])\+?\(?\d[\d \-/().]{7,20}\d(?!\w)")
_PHONE_LABEL_RE = re.compile(r"(?:tel|phone|mobil|mobile|telef[oó]n|kontakt)\w*\.?\s*:?\s*$", re.I)
_YEAR_RANGE_RE = re.compile(r"(?:19|20)\d{2}\s*-\s*(?:(?:19|20)\d{2}|\d{1,2}/)")
_DATE_RE = re.compile(r"\b\d{1,2}[/.](?:19|20)\d{2}\b")
_NAME_WORD_RE = re.compile(r"^[A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž'\-]+\.?$")
_NOT_NAME = {"curriculum", "vitae", "resume", "résumé", "cv", "životopis", "profile", "profil", "contact"}


def extract_phone(text: str) -> str | None:
    candidates = []
    for m in _PHONE_RE.finditer(text):
        raw = m.group(0).strip(" -/.")
        # „(0905 111 222)“ – zátvorky okolo celého čísla nie sú jeho súčasť, „(02) 1234“ áno
        if raw.startswith("(") and ")" not in raw:
            raw = raw[1:]
        if raw.endswith(")") and "(" not in raw:
            raw = raw[:-1]
        raw = raw.strip()
        digits = re.sub(r"\D", "", raw)
        if not 9 <= len(digits) <= 15 or _YEAR_RANGE_RE.search(raw) or _DATE_RE.search(raw):
            continue
        before = text[max(0, m.start() - 20):m.start()]
        priority = 0 if _PHONE_LABEL_RE.search(before) else 1 if raw.startswith("+") else 2
        candidates.append((priority, m.start(), re.sub(r"\s+", " ", raw)))
    return min(candidates)[2] if candidates else None


def _looks_like_name(line: str) -> bool:
    words = line.split()
    return (
        2 <= len(words) <= 4
        and all(_NAME_WORD_RE.match(w) for w in words)
        and not any(w.lower().strip(".") in _NOT_NAME for w in words)
    )


def extract_name(doc: Doc) -> str | None:
    header_end = sum(len(line) + 1 for line in doc.text.splitlines()[:HEADER_LINES])
    for ent in doc.ents:
        if ent.label_ != "PERSON" or ent.start_char >= header_end:
            continue
        # NER niekedy spojí meno s ďalším riadkom („Lucia Hornakova\nJunior Data“)
        name = ent.text.strip().splitlines()[0].strip()
        if _looks_like_name(name):
            return name
    # anglický model slovenské mená často nespozná – prvý riadok v tvare mena
    for line in doc.text.splitlines()[:HEADER_LINES]:
        line = line.strip(" |,")
        if _looks_like_name(line):
            return line
    return None
