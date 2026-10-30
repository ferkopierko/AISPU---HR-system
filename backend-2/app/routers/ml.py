"""/api/ml – analýza CV a výsledky zhody."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Path, UploadFile, status

from ..backend1 import SESSION_COOKIE, Backend1Client, Backend1Error, get_backend1
from ..config import settings
from ..nlp.parser import FileParseError, UnsupportedFileError
from ..nlp.pipeline import analyze_cv
from ..repository import AnalysisRepository
from ..storage import get_repository
from ..schemas import AnalysisResponse, ErrorResponse

router = APIRouter(prefix="/api/ml", tags=["ml"])

MAX_BYTES = settings.max_upload_mb * 1024 * 1024
ApplicationId = Annotated[int, Path(gt=0, le=2_147_483_647)]


# Synchrónne (def) endpointy – FastAPI ich spúšťa v threadpoole, takže
# CPU-náročné NLP ani blokujúci databázový ovládač neblokujú event loop.

@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    status_code=status.HTTP_201_CREATED,
    responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 413, 415, 422, 502)},
)
def analyze(
    file: Annotated[UploadFile, File(description="CV vo formáte PDF alebo DOCX")],
    application_id: Annotated[int, Form(gt=0, le=2_147_483_647, description="applications.id z Azure SQL")],
    requirements: Annotated[str, Form(min_length=1, max_length=20_000, description="Požiadavky pozície – text alebo JSON pole")],
    repo: Annotated[AnalysisRepository, Depends(get_repository)],
    backend1: Annotated[Backend1Client, Depends(get_backend1)],
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
):
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Súbor je väčší ako {settings.max_upload_mb} MB")
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Súbor je prázdny")

    try:
        result = analyze_cv(file.filename or "", data, requirements)
    except UnsupportedFileError as err:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(err)) from err
    except FileParseError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(err)) from err

    # CV + kontakt do Backendu 1 (Azure SQL). Backend 1 zároveň overí, že prihláška
    # patrí prihlásenému uchádzačovi – ak nie, analýza sa neuloží.
    try:
        backend1.store_cv(application_id, session_cookie, file.filename or f"cv.{result.file_kind}",
                          result.file_kind, data, result.candidate_name, result.candidate_phone)
    except Backend1Error as err:
        raise HTTPException(err.status, err.message) from err

    from ..firestore_repository import AnalysisTooLargeError
    try:
        analyzed_at = repo.save(application_id, result)
    except AnalysisTooLargeError as err:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(err)) from err
    return AnalysisResponse(
        application_id=application_id,
        score_percentage=result.score_percentage,
        text_similarity=result.text_similarity,
        skill_coverage=result.skill_coverage,
        matched_skills=result.matched_skills,
        missing_skills=result.missing_skills,
        cv_skills=result.cv_skills,
        education=result.education,
        experience_years=result.experience_years,
        analyzed_at=analyzed_at,
    )


@router.get(
    "/results/{application_id}",
    response_model=AnalysisResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_result(
    application_id: ApplicationId,
    repo: Annotated[AnalysisRepository, Depends(get_repository)],
):
    row = repo.get_latest(application_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pre túto prihlášku zatiaľ nie je analýza")
    return row
