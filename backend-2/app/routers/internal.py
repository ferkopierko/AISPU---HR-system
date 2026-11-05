"""/api/ml/internal – volania z Backendu 1 (nie z frontendu), chránené X-Internal-Key."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings
from ..repository import AnalysisRepository
from .ml import get_repository
from ..nlp.review_summary import summary_context, generate_summary
from ..nlp.providers import ProviderError

router = APIRouter(prefix="/api/ml/internal", tags=["internal"], include_in_schema=False)


def require_internal_key(x_internal_key: Annotated[str | None, Header()] = None) -> None:
    if not settings.internal_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Interné API nie je nakonfigurované (INTERNAL_API_KEY)")
    if not x_internal_key or not hmac.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Neplatný interný kľúč")


class DeleteRequest(BaseModel):
    application_ids: list[Annotated[int, Field(gt=0, le=2_147_483_647)]] = Field(min_length=1, max_length=1000)


@router.post("/delete", dependencies=[Depends(require_internal_key)])
def delete_analyses(body: DeleteRequest, repo: Annotated[AnalysisRepository, Depends(get_repository)]):
    """Zmaže analýzy prihlášok – pri stiahnutí prihlášky a pri vymazaní po uplynutí lehoty (GDPR)."""
    return {"deleted": repo.delete(sorted(set(body.application_ids)))}


class ReviewRequest(BaseModel):
    application_id: int = Field(gt=0, le=2_147_483_647)
    title: str = Field(min_length=1, max_length=200)
    requirements: str = Field(max_length=100000)
    description: str = Field(default="", max_length=100000)
    responsibilities: str = Field(default="", max_length=100000)
    fingerprint: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


def review_context(body, repo):
    analysis = repo.get_latest(body.application_id)
    if not analysis:
        raise HTTPException(404, "Najprv musí byť dokončená analýza CV")
    snapshot = analysis.get("requirements_snapshot")
    if snapshot and snapshot != body.requirements:
        raise HTTPException(409, "Požiadavky pozície sa od analýzy zmenili. Najprv treba aktualizovať analýzu CV.")
    position = analysis.get("analysis_metadata", {}).get("position_snapshot")
    if position is not None and position != {"title": body.title, "description": body.description,
                                            "responsibilities": body.responsibilities, "requirements": body.requirements}:
        raise HTTPException(409, "Opis pozície sa od analýzy zmenil. Najprv treba aktualizovať analýzu CV.")
    facts, fingerprint = summary_context(analysis, body.title, body.requirements)
    return facts, fingerprint, analysis.get("analysis_metadata", {}).get("review_summary")


@router.post("/review-summary/context", dependencies=[Depends(require_internal_key)])
def review_source(body: ReviewRequest, repo: Annotated[AnalysisRepository, Depends(get_repository)]):
    _, fingerprint, summary = review_context(body, repo)
    return {"fingerprint": fingerprint, "summary": summary}


@router.post("/review-summary/generate", dependencies=[Depends(require_internal_key)])
def review_generate(body: ReviewRequest, repo: Annotated[AnalysisRepository, Depends(get_repository)]):
    facts, fingerprint, existing = review_context(body, repo)
    if body.fingerprint != fingerprint:
        raise HTTPException(409, "Analýza sa medzičasom zmenila. Obnovte prihlášku.")
    if existing:
        return {**existing, "fingerprint": fingerprint}
    try:
        summary = generate_summary(facts, settings)
    except ProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    _, after, _ = review_context(body, repo)
    if after != fingerprint:
        raise HTTPException(409, "Analýza sa počas tvorby zhrnutia zmenila. Obnovte prihlášku.")
    return {**summary, "fingerprint": fingerprint}
