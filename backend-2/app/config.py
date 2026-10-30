"""Načítanie a validácia konfigurácie z premenných prostredia.

Lokálne sa číta spoločný .env v koreni projektu (ako pri Backende 1);
v kontajneri / cloude sa premenné nastavujú priamo a .env netreba.
"""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DB_PROVIDER = os.getenv("ANALYSIS_DB_PROVIDER", "mysql").strip().lower()
if DB_PROVIDER not in {"mysql", "firestore"}:
    raise RuntimeError("ANALYSIS_DB_PROVIDER musí byť mysql alebo firestore")

REQUIRED = (["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD"] if DB_PROVIDER == "mysql"
            else ["FIREBASE_PROJECT_ID"])

missing = [name for name in REQUIRED if not os.getenv(name)]
if missing:
    raise RuntimeError(f"Chýbajú premenné prostredia: {', '.join(missing)} (pozri .env.example)")


@dataclass(frozen=True)
class Settings:
    db_provider: str
    firebase_project_id: str
    firestore_database_id: str
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


settings = Settings(
    db_provider=DB_PROVIDER,
    firebase_project_id=os.getenv("FIREBASE_PROJECT_ID", ""),
    firestore_database_id=os.getenv("FIRESTORE_DATABASE_ID") or "(default)",
    mysql_host=os.getenv("MYSQL_HOST", "localhost"),
    mysql_port=int(os.getenv("MYSQL_PORT") or 3306),
    mysql_database=os.getenv("MYSQL_DATABASE") or "hr_analysis",
    mysql_user=os.getenv("MYSQL_USER", ""),
    mysql_password=os.getenv("MYSQL_PASSWORD", ""),
    port=int(os.getenv("BACKEND2_PORT") or 8000),
    # viac adries sa oddeľuje čiarkou
    cors_origins=[o.strip() for o in (os.getenv("CORS_ORIGIN") or "http://localhost:5173").split(",") if o.strip()],
    max_upload_mb=int(os.getenv("MAX_UPLOAD_MB") or 5),
    # Backend 1 – sem sa po analýze pošle CV a kontakt (v Dockeri http://backend-1:3001).
    # Bez INTERNAL_API_KEY sa CV neposiela (iba analýza, napr. pri lokálnom vývoji).
    backend1_url=(os.getenv("BACKEND1_URL") or "http://localhost:3001").rstrip("/"),
    internal_api_key=os.getenv("INTERNAL_API_KEY") or None,
)
