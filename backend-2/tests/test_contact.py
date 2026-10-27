import httpx
import pytest

from app.backend1 import Backend1Client, Backend1Error
from app.nlp import contact, preprocess


def name_of(text):
    return contact.extract_name(preprocess.analyze(preprocess.clean_text(text)))


# --- meno -----------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("Jan Novak\njan@novak.sk\nEXPERIENCE", "Jan Novak"),
    ("CURRICULUM VITAE\nJán Kováč\nBratislava", "Ján Kováč"),
    ("Mgr. Lucia Horňáková\n+421 900 000 000", "Lucia Horňáková"),  # spaCy PERSON bez titulu
    ("Peter Novak (+421 905 111 222)", "Peter Novak"),
    ("Lucia Hornakova\nJunior Data Analyst\n+421 900 000 222", "Lucia Hornakova"),  # NER spája riadky
    ("Backend developer with 5 years of experience\nSkills: Java", None),
    ("EXPERIENCE\nAcme 2019 - 2021", None),
])
def test_name(text, expected):
    assert name_of(text) == expected


def test_name_only_in_header():
    text = "\n".join(["Skills: Java"] * 10 + ["Peter Novak"])
    assert name_of(text) is None


# --- telefón --------------------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("jan@x.sk | +421 905 123 456 | github", "+421 905 123 456"),
    ("Tel.: 0905 123 456", "0905 123 456"),
    ("Mobil: 0905/123456", "0905/123456"),
    ("Phone: (02) 1234 5678", "(02) 1234 5678"),
    ("Peter Novak (0905 111 222)", "0905 111 222"),
    # obdobia a dátumy nie sú telefón
    ("Acme 2015 - 2019\nFoo 03/2019 - 05/2021", None),
    ("ID 12345", None),
    # pri viacerých má prednosť číslo pri slove „tel“
    ("IČO 12345678901\nTel: 0905 111 222", "0905 111 222"),
])
def test_phone(text, expected):
    assert contact.extract_phone(text) == expected


# --- klient Backendu 1 ----------------------------------------------------

def test_backend1_disabled_without_key():
    Backend1Client("http://x", None).store_cv(1, None, "cv.pdf", "pdf", b"%PDF-", None, None)  # nič nespraví


def test_backend1_requires_session():
    with pytest.raises(Backend1Error) as e:
        Backend1Client("http://x", "key").store_cv(1, None, "cv.pdf", "pdf", b"%PDF-", None, None)
    assert e.value.status == 401


def test_backend1_request_and_errors(monkeypatch):
    sent = {}

    def fake_put(url, headers, cookies, json, timeout):
        sent.update(url=url, headers=headers, cookies=cookies, json=json)
        return httpx.Response(sent.get("status", 204), json={"error": "Prihláška neexistuje"})

    monkeypatch.setattr(httpx, "put", fake_put)
    client = Backend1Client("http://b1:3001", "tajny")
    client.store_cv(7, "s%3Aabc", "cv.pdf", "pdf", b"%PDF-1.4", "Jan Novak", "+421 905")
    assert sent["url"] == "http://b1:3001/api/internal/applications/7/cv"
    assert sent["headers"] == {"X-Internal-Key": "tajny"}
    assert sent["cookies"] == {"hr.sid": "s%3Aabc"}
    assert sent["json"]["contentType"] == "application/pdf"
    assert sent["json"]["data"] == "JVBERi0xLjQ="  # base64 z %PDF-1.4
    assert sent["json"]["candidateName"] == "Jan Novak"

    sent["status"] = 404
    with pytest.raises(Backend1Error) as e:
        client.store_cv(7, "s%3Aabc", "cv.pdf", "pdf", b"%PDF-", None, None)
    assert (e.value.status, e.value.message) == (404, "Prihláška neexistuje")

    sent["status"] = 500
    with pytest.raises(Backend1Error) as e:
        client.store_cv(7, "s%3Aabc", "cv.pdf", "pdf", b"%PDF-", None, None)
    assert e.value.status == 502


def test_backend1_unreachable(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "put", boom)
    with pytest.raises(Backend1Error) as e:
        Backend1Client("http://b1", "k").store_cv(1, "c", "cv.pdf", "pdf", b"%PDF-", None, None)
    assert e.value.status == 502
