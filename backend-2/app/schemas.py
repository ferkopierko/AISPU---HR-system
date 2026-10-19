"""Pydantic modely odpovedí API."""

from datetime import datetime

from pydantic import BaseModel, Field


class Education(BaseModel):
    degrees: list[str] = Field(description="Dosiahnuté stupne od najvyššieho: phd, master, bachelor, high school")
    institutions: list[str]


class AnalysisResponse(BaseModel):
    application_id: int
    score_percentage: float = Field(description="Výsledná zhoda 0–100 %")
    text_similarity: float | None = Field(description="Kosínusová podobnosť textov 0–100 %")
    skill_coverage: float | None = Field(description="Podiel splnených požadovaných zručností 0–100 % (null = pozícia nemá rozpoznané zručnosti)")
    matched_skills: list[str]
    missing_skills: list[str]
    cv_skills: list[str] = Field(description="Všetky zručnosti nájdené v CV")
    education: Education
    experience_years: float | None
    analyzed_at: datetime


class ErrorResponse(BaseModel):
    detail: str
