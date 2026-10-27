"""Match Score Model – vektorizácia textu a kosínusová podobnosť.

Porovnávajú sa vždy len 2 dokumenty (požiadavky pozície a CV). Klasické IDF
naučené na týchto dvoch textoch by výrazy prítomné v OBOCH (= práve zhody)
váhovalo nižšie než výrazy iba v jednom, a zhodu by tým penalizovalo.
Preto TfidfVectorizer s use_idf=False a sublinear_tf=True: vektor = log-normalizovaná
frekvencia termov (L2), kosínus potom meria podobnosť slovníka oboch textov.
Termy sú lemy + zjednotené zručnosti (preprocess.tokens_for_vectorizer), unigramy aj bigramy.

Výsledné skóre kombinuje:
- text_similarity – kosínusová podobnosť celých textov,
- skill_coverage  – podiel požadovaných zručností, ktoré CV obsahuje.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

SKILL_WEIGHT = 0.6  # váha pokrytia zručností vo výslednom skóre
TEXT_WEIGHT = 1 - SKILL_WEIGHT


def text_similarity(job_tokens: list[str], cv_tokens: list[str]) -> float:
    """Kosínusová podobnosť v rozsahu 0..1."""
    if not job_tokens or not cv_tokens:
        return 0.0
    vectorizer = TfidfVectorizer(
        analyzer=lambda tokens: tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:])],
        use_idf=False,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform([job_tokens, cv_tokens])
    return float(cosine_similarity(matrix[0], matrix[1])[0, 0])


def skill_match(
    required: list[str], found: list[str], weights: dict[str, float] | None = None
) -> tuple[list[str], list[str], float | None]:
    """(nájdené, chýbajúce, pokrytie 0..1); pokrytie None, ak pozícia nemá rozpoznané zručnosti.

    S váhami je pokrytie = súčet váh nájdených / súčet všetkých váh
    (Java 60 + SQL 40, CV má iba Javu -> 0.6). Bez váh má každá zručnosť rovnakú váhu.
    """
    found_set = set(found)
    matched = [s for s in required if s in found_set]
    missing = [s for s in required if s not in found_set]
    if not required:
        return matched, missing, None
    weight = (lambda s: weights[s]) if weights else (lambda s: 1.0)
    coverage = sum(weight(s) for s in matched) / sum(weight(s) for s in required)
    return matched, missing, coverage


def final_score(similarity: float, coverage: float | None) -> float:
    """Percentuálna zhoda 0..100."""
    score = similarity if coverage is None else SKILL_WEIGHT * coverage + TEXT_WEIGHT * similarity
    return round(100 * score, 2)
