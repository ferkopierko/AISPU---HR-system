"""Authorized CV intake, durable jobs, status and results. No client-supplied requirements."""

import hashlib
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Path, UploadFile

from ..analysis_jobs import JobRepository
from ..backend1 import SESSION_COOKIE, Backend1Client, Backend1Error, get_backend1
from ..config import settings
from ..nlp import contact, parser, preprocess
from ..repository import AnalysisRepository
from ..schemas import AnalysisResponse, AnalysisJobResponse
from ..storage import get_repository

router = APIRouter(prefix="/api/ml", tags=["ml"])
MAX_BYTES = settings.max_upload_mb * 1024 * 1024
ApplicationId = Annotated[int, Path(gt=0, le=2_147_483_647)]


def get_jobs():
    return JobRepository()


def authorize(backend1, application_id, cookie):
    try:
        return backend1.analysis_context(application_id, cookie)
    except Backend1Error as exc:
        raise HTTPException(exc.status, exc.message) from exc


@router.get("/capabilities")
def capabilities():
    return {"provider": settings.ai_provider, "cloud_processing": settings.ai_provider in ("azure_custom_ner", "azure_llm"),
            "scoring_version": "weighted-coverage-v1", "max_upload_mb": settings.max_upload_mb}


@router.post("/analyze", response_model=AnalysisJobResponse, status_code=202)
def analyze(
    file: Annotated[UploadFile, File()],
    application_id: Annotated[int, Form(gt=0, le=2_147_483_647)],
    jobs: Annotated[JobRepository, Depends(get_jobs)],
    backend1: Annotated[Backend1Client, Depends(get_backend1)],
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
):
    context = authorize(backend1, application_id, session_cookie)
    existing = jobs.status(application_id)
    if existing:
        return existing
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"Súbor je väčší ako {settings.max_upload_mb} MB")
    if not data:
        raise HTTPException(422, "Súbor je prázdny")
    try:
        kind = parser.detect_type(file.filename or "", data)
        raw = preprocess.clean_text(parser.extract_text(file.filename or "", data))
        doc = preprocess.analyze(raw)
        backend1.store_cv(application_id, session_cookie, file.filename or f"cv.{kind}", kind, data,
                          contact.extract_name(doc), contact.extract_phone(raw))
    except parser.UnsupportedFileError as exc:
        raise HTTPException(415, str(exc)) from exc
    except parser.FileParseError as exc:
        raise HTTPException(422, str(exc)) from exc
    except preprocess.TextLimitError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Backend1Error as exc:
        raise HTTPException(exc.status, exc.message) from exc
    return jobs.enqueue(application_id, {"raw_text": raw, "kind": kind, "requirements": context["requirements"],
                                        "document_sha256": hashlib.sha256(data).hexdigest()}, settings.ai_provider)


@router.get("/status/{application_id}", response_model=AnalysisJobResponse)
def get_status(application_id: ApplicationId,
               jobs: Annotated[JobRepository, Depends(get_jobs)],
               repo: Annotated[AnalysisRepository, Depends(get_repository)],
               backend1: Annotated[Backend1Client, Depends(get_backend1)],
               session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None):
    authorize(backend1, application_id, session_cookie)
    row = jobs.status(application_id)
    if row:
        return row
    return {"application_id": application_id, "state": "completed" if repo.get_latest(application_id) else "not_started"}


@router.post("/retry/{application_id}", response_model=AnalysisJobResponse, status_code=202)
def retry(application_id: ApplicationId, jobs: Annotated[JobRepository, Depends(get_jobs)],
          backend1: Annotated[Backend1Client, Depends(get_backend1)],
          session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None):
    authorize(backend1, application_id, session_cookie)
    row = jobs.status(application_id)
    if not row:
        raise HTTPException(404, "Najprv treba nahrať CV k existujúcej prihláške")
    if row["state"] == "completed":
        raise HTTPException(409, "Analýza je už dokončená")
    if row["state"] == "failed":
        jobs.retry(application_id)
    return jobs.status(application_id)


@router.get("/results/{application_id}", response_model=AnalysisResponse)
def get_result(application_id: ApplicationId, repo: Annotated[AnalysisRepository, Depends(get_repository)],
               backend1: Annotated[Backend1Client, Depends(get_backend1)],
               session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None):
    authorize(backend1, application_id, session_cookie)
    row = repo.get_latest(application_id)
    if row is None:
        raise HTTPException(404, "Pre túto prihlášku zatiaľ nie je analýza")
    return row
