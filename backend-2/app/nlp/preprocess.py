"""Načítanie spaCy modelu a predspracovanie textu.

Do pipeline en_core_web_sm sa pred štatistické NER vloží EntityRuler so vzormi
zo slovníka (skills.py). Výsledok: entity SKILL a DEGREE s kanonickým názvom
v `ent.ent_id_`; štatistické NER pridá ORG, DATE… pre zvyšok textu.
"""

import re
import unicodedata
from functools import lru_cache

import spacy
from spacy.language import Language
from spacy.tokens import Doc

from .skills import CASE_SENSITIVE, DEGREES, SKILLS

MODEL = "en_core_web_sm"
MAX_CHARS = 100_000  # dlhšie CV sa oreže (ochrana pamäte / času)

_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
_EMAIL_RE = re.compile(r"\S+@\S+\.\S+")
_SPACES_RE = re.compile(r"[ \t]+")  # NBSP prevedie na medzeru už NFKC
_DASHES = str.maketrans({0x2013: "-", 0x2014: "-", 0x2212: "-"})  # en/em dash, mínus -> spojovník
_BLANK_LINES_RE = re.compile(r"\n\s*\n+")


def clean_text(text: str) -> str:
    """Normalizácia Unicode, odstránenie URL a emailov, zjednotenie medzier.

    Riadky sa zachovávajú – extrakcia praxe pracuje po riadkoch. Čísla (telefón)
    sa nemažú: regex na telefón by zmazal aj obdobia „2018 - 2021“ a do
    vektorizácie čísla aj tak nevstupujú.
    """
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_DASHES)
    text = _URL_RE.sub(" ", text)
    text = _EMAIL_RE.sub(" ", text)
    text = "\n".join(_SPACES_RE.sub(" ", line).strip() for line in text.splitlines())
    return _BLANK_LINES_RE.sub("\n\n", text).strip()[:MAX_CHARS]


def _patterns(nlp: Language) -> list[dict]:
    def lower(label, canonical, phrase):
        # tokenizér delí niektoré výrazy podľa veľkosti písmen inak („Ph.D.“ = 1 token,
        # „ph.d.“ = 2), preto vzor z každého variantu zápisu
        variants = {phrase, phrase.title(), phrase.upper(), phrase[:1].upper() + phrase[1:]}
        token_seqs = {tuple(t.lower_ for t in nlp.make_doc(v)) for v in variants}
        return [{"label": label, "id": canonical, "pattern": [{"LOWER": t} for t in seq]}
                for seq in token_seqs]

    def exact(label, canonical, phrase):
        return {"label": label, "id": canonical,
                "pattern": [{"ORTH": t.text} for t in nlp.make_doc(phrase)]}

    patterns = []
    for canonical, aliases in SKILLS.items():
        # kanonický názov, ktorý je bežným slovom („react“), sa hľadá iba v presnom tvare
        ambiguous = any(f.lower() == canonical for f in CASE_SENSITIVE.get(canonical, []))
        phrases = set(aliases) if ambiguous else {canonical, *aliases}
        patterns += [pat for p in phrases for pat in lower("SKILL", canonical, p)]
    for canonical, forms in CASE_SENSITIVE.items():
        patterns += [exact("SKILL", canonical, f) for f in forms]
    for canonical, phrases in DEGREES.items():
        patterns += [pat for p in phrases for pat in lower("DEGREE", canonical, p)]
    return patterns


@lru_cache(maxsize=1)
def get_nlp() -> Language:
    """spaCy pipeline – načíta sa raz (trvá ~1 s)."""
    try:
        nlp = spacy.load(MODEL)
    except OSError as err:
        raise RuntimeError(f"Chýba spaCy model – spusti: python -m spacy download {MODEL}") from err
    ruler = nlp.add_pipe("entity_ruler", before="ner", config={"phrase_matcher_attr": None})
    ruler.add_patterns(_patterns(nlp))
    return nlp


def analyze(text: str) -> Doc:
    return get_nlp()(text)


def tokens_for_vectorizer(doc: Doc) -> list[str]:
    """Tokenizácia + lemmatizácia pre model zhody.

    - zručnosť (SKILL) = jeden token s kanonickým názvom (napr. „Node.js“, „nodejs“
      aj „Node“ -> `skill:node.js`), aby sa varianty zápisu počítali ako to isté,
    - ostatné slová: lemma malými písmenami, bez stop-slov, interpunkcie a čísel.
    """
    out: list[str] = []
    skill_starts = {ent.start: ent for ent in doc.ents if ent.label_ == "SKILL"}
    i = 0
    while i < len(doc):
        ent = skill_starts.get(i)
        if ent is not None:
            out.append(f"skill:{ent.ent_id_}")
            i = ent.end
            continue
        tok = doc[i]
        if tok.is_alpha and not tok.is_stop and len(tok) > 1:
            out.append(tok.lemma_.lower())
        i += 1
    return out
