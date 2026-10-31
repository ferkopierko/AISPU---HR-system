"""Pydantic modely odpovedí API."""

from datetime import datetime

from pydantic import BaseModel, Field


class Education(BaseModel):
    degrees: list[str] = Field(description="Dosiahnuté stupne od najvyššieho: phd, master, bachelor, high school")
    institutions: list[str]


class AnalysisResponse(BaseModel):
    application_id: int
    score_percentage: float | None = Field(description="Vážené pokrytie požiadaviek 0–100 %, null bez požiadaviek")
    text_similarity: float | None = Field(description="Kosínusová podobnosť textov 0–100 %")
    skill_coverage: float | None = Field(description="Podiel splnených požadovaných zručností 0–100 % (null = pozícia nemá rozpoznané zručnosti)")
    matched_skills: list[str]
    missing_skills: list[str]
    cv_skills: list[str] = Field(description="Všetky zručnosti nájdené v CV")
    education: Education
    experience_years: float | None
    analyzed_at: datetime
    provider: str = "legacy_local"
    model_version: str = "legacy-rules"
    scoring_version: str = "legacy-60-40"
    skill_evidence: list[dict] = Field(default_factory=list)
    uncertain_skills: list[str] = Field(default_factory=list)
    requirements_snapshot: str = ""
    requirements_sha256: str = ""
    document_sha256: str = ""
    analysis_metadata: dict = Field(default_factory=dict)


class AnalysisJobResponse(BaseModel):
    application_id: int
    state: str
    provider: str | None = None
    attempts: int = 0
    error_message: str | None = None
    updated_at: datetime | None = None


class ErrorResponse(BaseModel):
    detail: str
