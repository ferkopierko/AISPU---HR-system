"""Klient pre interné API Backendu 1 – odovzdanie CV a kontaktu po analýze.

Súbor CV sa ukladá v Azure SQL pri prihláške (Backend 1), odkiaľ si ho HR stiahne.
Preposiela sa session cookie uchádzača, Backend 1 podľa nej overí, že prihláška
patrí prihlásenému používateľovi.
"""

import base64
import logging

import httpx

from .config import settings

log = logging.getLogger("uvicorn.error")

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
SESSION_COOKIE = "hr.sid"


class Backend1Error(Exception):
    """Backend 1 CV neprijal (status sa pošle ďalej klientovi) alebo je nedostupný."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class Backend1Client:
    def __init__(self, base_url: str, api_key: str | None):
        self.base_url = base_url
        self.api_key = api_key

    @property
    def enabled(self) -> bool:
        return self.api_key is not None

    def store_cv(self, application_id: int, session_cookie: str | None, filename: str, kind: str,
                 data: bytes, candidate_name: str | None, candidate_phone: str | None) -> None:
        if not self.enabled:
            log.warning("INTERNAL_API_KEY nie je nastavený – CV sa do Backendu 1 neposiela")
            return
        if not session_cookie:
            raise Backend1Error(401, "Neprihlásený používateľ")
        try:
            res = httpx.put(
                f"{self.base_url}/api/internal/applications/{application_id}/cv",
                headers={"X-Internal-Key": self.api_key},
                cookies={SESSION_COOKIE: session_cookie},
                json={
                    "filename": filename,
                    "contentType": CONTENT_TYPES[kind],
                    "data": base64.b64encode(data).decode("ascii"),
                    "candidateName": candidate_name,
                    "candidatePhone": candidate_phone,
                },
                timeout=15,
            )
        except httpx.HTTPError as err:
            log.error("Backend 1 nedostupný: %s", err)
            raise Backend1Error(502, "Backend 1 je nedostupný, CV sa nepodarilo uložiť") from err
        if res.status_code != 204:
            try:
                message = res.json().get("error") or res.text
            except ValueError:
                message = res.text
            if res.status_code >= 500:
                log.error("Backend 1 odmietol CV: %s %s", res.status_code, message)
                raise Backend1Error(502, "CV sa nepodarilo uložiť v Backende 1")
            raise Backend1Error(res.status_code, message)


def get_backend1() -> Backend1Client:
    return Backend1Client(settings.backend1_url, settings.internal_api_key)
