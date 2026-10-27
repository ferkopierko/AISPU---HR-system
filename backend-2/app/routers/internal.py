"""/api/ml/internal – volania z Backendu 1 (nie z frontendu), chránené X-Internal-Key."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings
from ..repository import AnalysisRepository
from .ml import get_repository

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
