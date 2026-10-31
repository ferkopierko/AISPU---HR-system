"""Načítanie a validácia konfigurácie z premenných prostredia.

Lokálne sa číta spoločný .env v koreni projektu (ako pri Backende 1);
v kontajneri / cloude sa premenné nastavujú priamo a .env netreba.
"""

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
import math
import re

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

REQUIRED = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD"]

missing = [name for name in REQUIRED if not os.getenv(name)]
if missing:
    raise RuntimeError(f"Chýbajú premenné prostredia: {', '.join(missing)} (pozri .env.example)")


@dataclass(frozen=True)
class Settings:
    mysql_host: str
    mysql_port: int
    mysql_database: str
    mysql_user: str
    mysql_password: str
    port: int
    cors_origins: list[str]
    max_upload_mb: int
    backend1_url: str
    internal_api_key: str | None
    ai_provider: str = "local_rules"
    azure_language_endpoint: str = ""
    azure_language_key: str = ""
    azure_ner_project: str = ""
    azure_ner_deployment: str = ""
    azure_ner_model_version: str = ""
    azure_ner_language: str = ""
    azure_ner_skill_categories: tuple[str, ...] = ("Skill",)
    azure_confidence_threshold: float = .75
    azure_timeout_seconds: float = 90
    azure_max_characters: int = 100_000
    analysis_worker_enabled: bool = True
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = ""
    azure_llm_timeout_seconds: float = 60
    azure_llm_max_characters: int = 30_000
    azure_llm_max_output_tokens: int = 6000


settings = Settings(
    mysql_host=os.environ["MYSQL_HOST"],
    mysql_port=int(os.getenv("MYSQL_PORT") or 3306),
    mysql_database=os.getenv("MYSQL_DATABASE") or "hr_analysis",
    mysql_user=os.environ["MYSQL_USER"],
    mysql_password=os.environ["MYSQL_PASSWORD"],
    port=int(os.getenv("BACKEND2_PORT") or 8000),
    # viac adries sa oddeľuje čiarkou
    cors_origins=[o.strip() for o in (os.getenv("CORS_ORIGIN") or "http://localhost:5173").split(",") if o.strip()],
    max_upload_mb=int(os.getenv("MAX_UPLOAD_MB") or 5),
    # Backend 1 – sem sa po analýze pošle CV a kontakt (v Dockeri http://backend-1:3001).
    # Bez INTERNAL_API_KEY sa CV neposiela (iba analýza, napr. pri lokálnom vývoji).
    backend1_url=(os.getenv("BACKEND1_URL") or "http://localhost:3001").rstrip("/"),
    internal_api_key=os.getenv("INTERNAL_API_KEY") or None,
    ai_provider=os.getenv("AI_PROVIDER", "local_rules"),
    azure_language_endpoint=os.getenv("AZURE_LANGUAGE_ENDPOINT", "").rstrip("/"),
    azure_language_key=os.getenv("AZURE_LANGUAGE_KEY", ""),
    azure_ner_project=os.getenv("AZURE_NER_PROJECT", ""),
    azure_ner_deployment=os.getenv("AZURE_NER_DEPLOYMENT", ""),
    azure_ner_model_version=os.getenv("AZURE_NER_MODEL_VERSION", ""),
    azure_ner_language=os.getenv("AZURE_NER_LANGUAGE", ""),
    azure_ner_skill_categories=tuple(s.strip() for s in os.getenv("AZURE_NER_SKILL_CATEGORIES", "Skill").split(",") if s.strip()),
    azure_confidence_threshold=float(os.getenv("AZURE_NER_CONFIDENCE_THRESHOLD", ".75")),
    azure_timeout_seconds=float(os.getenv("AZURE_NER_TIMEOUT_SECONDS", "90")),
    azure_max_characters=int(os.getenv("AZURE_NER_MAX_CHARACTERS", "100000")),
    analysis_worker_enabled=os.getenv("ANALYSIS_WORKER_ENABLED", "true").lower() == "true",
    azure_openai_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "").strip(),
    azure_openai_api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
    azure_openai_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT", "").strip(),
    azure_llm_timeout_seconds=float(os.getenv("AZURE_LLM_TIMEOUT_SECONDS", "60")),
    azure_llm_max_characters=int(os.getenv("AZURE_LLM_MAX_CHARACTERS", "30000")),
    azure_llm_max_output_tokens=int(os.getenv("AZURE_LLM_MAX_OUTPUT_TOKENS", "6000")),
)


def azure_responses_endpoint(value: str) -> str:
    """Accept Azure resource, v1 base, or the complete Responses URL; reject other destinations."""
    parsed = urlparse(value.strip().rstrip("/"))
    try:
        port = parsed.port
    except ValueError:
        raise RuntimeError("Neplatný port AZURE_OPENAI_ENDPOINT") from None
    if (parsed.scheme != "https" or not parsed.hostname
        or not parsed.hostname.endswith((".services.ai.azure.com", ".openai.azure.com"))
        or port not in (None, 443) or parsed.username or parsed.password or parsed.query or parsed.fragment
        or parsed.path not in ("", "/openai/v1", "/openai/v1/responses")):
        raise RuntimeError("AZURE_OPENAI_ENDPOINT musí byť HTTPS Azure adresa resource alebo /openai/v1/responses bez tokenov")
    return f"https://{parsed.netloc}/openai/v1/responses"


def validate_ai_config(value: Settings) -> None:
    if value.ai_provider not in ("local_rules", "azure_custom_ner", "azure_llm"):
        raise RuntimeError("AI_PROVIDER musí byť local_rules, azure_custom_ner alebo azure_llm")
    if not math.isfinite(value.azure_confidence_threshold) or not 0 <= value.azure_confidence_threshold <= 1:
        raise RuntimeError("AZURE_NER_CONFIDENCE_THRESHOLD musí byť medzi 0 a 1")
    if not math.isfinite(value.azure_timeout_seconds) or not 1 <= value.azure_timeout_seconds <= 180:
        raise RuntimeError("AZURE_NER_TIMEOUT_SECONDS musí byť medzi 1 a 180")
    if not 1 <= value.azure_max_characters <= 125_000:
        raise RuntimeError("AZURE_NER_MAX_CHARACTERS musí byť medzi 1 a 125000")
    if value.ai_provider == "local_rules":
        return
    if value.ai_provider == "azure_llm":
        required = {"AZURE_OPENAI_ENDPOINT": value.azure_openai_endpoint, "AZURE_OPENAI_API_KEY": value.azure_openai_api_key,
                    "AZURE_OPENAI_DEPLOYMENT": value.azure_openai_deployment, "INTERNAL_API_KEY": value.internal_api_key}
        absent = [key for key, item in required.items() if not item or str(item).startswith("<")]
        if absent:
            raise RuntimeError("Pre Azure LLM chýba konfigurácia: " + ", ".join(absent))
        azure_responses_endpoint(value.azure_openai_endpoint)
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", value.azure_openai_deployment):
            raise RuntimeError("Neplatný AZURE_OPENAI_DEPLOYMENT")
        if not math.isfinite(value.azure_llm_timeout_seconds) or not 1 <= value.azure_llm_timeout_seconds <= 180:
            raise RuntimeError("AZURE_LLM_TIMEOUT_SECONDS musí byť medzi 1 a 180")
        if not 1 <= value.azure_llm_max_characters <= 100_000:
            raise RuntimeError("AZURE_LLM_MAX_CHARACTERS musí byť medzi 1 a 100000")
        if not 256 <= value.azure_llm_max_output_tokens <= 16000:
            raise RuntimeError("AZURE_LLM_MAX_OUTPUT_TOKENS musí byť medzi 256 a 16000")
        return
    required = {"AZURE_LANGUAGE_ENDPOINT": value.azure_language_endpoint, "AZURE_LANGUAGE_KEY": value.azure_language_key,
                "AZURE_NER_PROJECT": value.azure_ner_project, "AZURE_NER_DEPLOYMENT": value.azure_ner_deployment,
                "AZURE_NER_MODEL_VERSION": value.azure_ner_model_version, "INTERNAL_API_KEY": value.internal_api_key}
    absent = [key for key, item in required.items() if not item or str(item).startswith("<")]
    if absent:
        raise RuntimeError("Pre Azure chýba konfigurácia: " + ", ".join(absent))
    url = urlparse(value.azure_language_endpoint)
    if (url.scheme != "https" or not url.hostname or not url.hostname.endswith(".cognitiveservices.azure.com")
        or url.port not in (None, 443) or url.path not in ("", "/") or url.query or url.fragment or url.username or url.password):
        raise RuntimeError("AZURE_LANGUAGE_ENDPOINT musí byť HTTPS adresa Azure Language resource (*.cognitiveservices.azure.com)")
    if not value.azure_ner_skill_categories:
        raise RuntimeError("AZURE_NER_SKILL_CATEGORIES musí obsahovať názov entity Skill")
    for name in (value.azure_ner_project, value.azure_ner_deployment):
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,50}", name):
            raise RuntimeError("Neplatný názov Azure NER projektu alebo deploymentu")


validate_ai_config(settings)
