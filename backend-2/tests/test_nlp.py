from datetime import date

import pytest

from app.nlp import extract, matcher, parser, pipeline, preprocess
from tests.conftest import SAMPLE_CV, make_docx

CV_TEXT = "\n".join(SAMPLE_CV)
TODAY = date(2026, 10, 19)


def doc(text):
    return preprocess.analyze(preprocess.clean_text(text))


# --- parser ---------------------------------------------------------------

def test_pdf_text(cv_pdf):
    text = parser.extract_text("cv.pdf", cv_pdf)
    assert "Node.js" in text and "Technical University" in text


def test_docx_text_including_tables():
    data = make_docx(["Jan Novak"], table_rows=[["Skills", "Kubernetes, Terraform"]])
    text = parser.extract_text("cv.docx", data)
    assert "Jan Novak" in text and "Kubernetes, Terraform" in text


@pytest.mark.parametrize("name,data", [
    ("cv.txt", b"plain text"),
    ("cv.pdf", b"PK\x03\x04 not a pdf"),       # prípona nesedí s obsahom
    ("cv.exe", b"%PDF-1.4 ..."),
])
def test_unsupported_types(name, data):
    with pytest.raises(parser.UnsupportedFileError):
        parser.extract_text(name, data)


def test_corrupted_files():
    with pytest.raises(parser.FileParseError):
        parser.extract_text("cv.docx", b"PK\x03\x04garbage")
    with pytest.raises(parser.FileParseError):
        parser.extract_text("cv.pdf", b"%PDF-1.4 garbage")


# --- predspracovanie ------------------------------------------------------

def test_clean_text_removes_contacts_keeps_lines():
    text = preprocess.clean_text("A  b  jan@x.sk https://x.sk\n\n\n2018 – 2021")
    assert text == "A b\n\n2018 - 2021"


def test_tokens_lemmatized_and_skills_unified():
    tokens = preprocess.tokens_for_vectorizer(doc("Developers building APIs with NodeJS and Node.js"))
    assert "developer" in tokens and "build" in tokens
    assert tokens.count("skill:node.js") == 2
    assert "with" not in tokens and "and" not in tokens


# --- extrakcia ------------------------------------------------------------

def test_skills():
    skills = extract.extract_skills(doc(CV_TEXT))
    for s in ["node.js", "express", "typescript", "docker", "sql server", "python", "django",
              "postgresql", "javascript", "react", "git", "ci/cd", "english", "rest api"]:
        assert s in skills, s
    assert "excel" not in skills  # „excel at teamwork“ nie je zručnosť


def test_ambiguous_words_need_exact_case():
    assert extract.extract_skills(doc("I react fast and go home")) == []
    assert set(extract.extract_skills(doc("React, Go and C# developer"))) == {"react", "go", "c#"}


def test_education():
    edu = extract.extract_education(doc(CV_TEXT))
    assert edu["degrees"] == ["master"]
    assert "Technical University of Kosice" in edu["institutions"]
    assert all("2011" not in i for i in edu["institutions"])
    assert extract.extract_education(doc("Bc. in 2018, Ph.D. in 2024"))["degrees"] == ["phd", "bachelor"]


def test_experience_from_ranges_skips_education():
    # 2019-present = 7 r., 2016-2018 = 2 r.; riadok so štúdiom 2011-2016 sa nepočíta
    assert extract.extract_experience_years(CV_TEXT, TODAY) == 9.0


def test_experience_explicit_and_overlaps():
    assert extract.extract_experience_years("5+ years of experience, 2 years with Go", TODAY) == 5.0
    assert extract.extract_experience_years("Prax: 3,5 roka? nie, 4 roky", TODAY) == 4.0
    assert extract.extract_experience_years("A 2015 - 2020\nB 2018 - 2022", TODAY) == 7.0
    assert extract.extract_experience_years("no dates here", TODAY) is None


# --- model zhody ----------------------------------------------------------

def test_similarity_bounds():
    assert matcher.text_similarity(["a", "b"], ["a", "b"]) == pytest.approx(1.0)
    assert matcher.text_similarity(["a"], ["b"]) == 0.0
    assert matcher.text_similarity([], ["b"]) == 0.0


def test_skill_match_and_score():
    matched, missing, cov = matcher.skill_match(["python", "docker", "aws"], ["docker", "python", "git"])
    assert matched == ["python", "docker"] and missing == ["aws"] and cov == pytest.approx(2 / 3)
    assert matcher.final_score(0.5, 1.0) == 80.0
    assert matcher.final_score(0.25, None) == 25.0


def test_requirements_json_array():
    assert pipeline.parse_requirements('["Python", " team leadership "]') == (
        "Python, team leadership", ["Python", "team leadership"], None)
    assert pipeline.parse_requirements("[not json") == ("[not json", [], None)


def test_requirements_weighted():
    text, items, weights = pipeline.parse_requirements('[{"skill":"java","weight":30},{"skill":"SQL","weight":70}]')
    assert text == "java, SQL" and items == ["java", "SQL"] and weights == {"java": 30, "SQL": 70}
    # neplatné položky (bez váhy, váha 0, bool) -> voľný text
    for raw in ['[{"skill":"java"}]', '[{"skill":"java","weight":0}]', '[{"skill":"java","weight":true}]']:
        assert pipeline.parse_requirements(raw)[2] is None


def test_weighted_skill_match():
    matched, missing, cov = matcher.skill_match(["java", "sql"], ["java"], {"java": 60, "sql": 40})
    assert matched == ["java"] and missing == ["sql"] and cov == pytest.approx(0.6)


def test_pipeline_weighted(cv_pdf):
    # CV má Node.js a Docker, nemá Kubernetes; váhy 50 + 30 = 80 zo 100
    req = '[{"skill":"Node.js","weight":50},{"skill":"Docker","weight":30},{"skill":"Kubernetes","weight":20}]'
    r = pipeline.analyze_cv("cv.pdf", cv_pdf, req)
    assert r.required_skills == ["node.js", "docker", "kubernetes"]
    assert r.matched_skills == ["node.js", "docker"] and r.missing_skills == ["kubernetes"]
    assert r.skill_coverage == 80.0
    # rovnaké zručnosti bez váh -> 2/3
    assert pipeline.analyze_cv("cv.pdf", cv_pdf, '["Node.js","Docker","Kubernetes"]').skill_coverage == pytest.approx(66.67)


def test_pipeline_weighted_multi_skill_item(cv_pdf):
    # „Docker and Kubernetes“ = 2 zručnosti, váha 40 sa delí 20 + 20
    r = pipeline.analyze_cv("cv.pdf", cv_pdf, '[{"skill":"Python","weight":60},{"skill":"Docker and Kubernetes","weight":40}]')
    assert r.skill_coverage == 80.0


def test_full_pipeline(cv_pdf):
    req = "3+ years with Node.js, TypeScript, React, Kubernetes, AWS and SQL Server. Docker, CI/CD."
    r = pipeline.analyze_cv("cv.pdf", cv_pdf, req)
    assert r.matched_skills == ["node.js", "typescript", "react", "sql server", "docker", "ci/cd"]
    assert r.missing_skills == ["kubernetes", "aws"]
    assert r.skill_coverage == 75.0
    assert 0 < r.text_similarity < 100
    assert r.score_percentage == pytest.approx(0.6 * 75 + 0.4 * r.text_similarity, abs=0.02)


def test_pipeline_custom_skill_from_json(cv_pdf):
    r = pipeline.analyze_cv("cv.pdf", cv_pdf, '["Python", "teamwork", "team leadership"]')
    assert r.matched_skills == ["python", "teamwork"]
    assert r.missing_skills == ["team leadership"]
