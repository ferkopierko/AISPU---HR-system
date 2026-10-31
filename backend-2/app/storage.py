"""Storage selection is explicit; failures never fall back to another database."""

from .config import settings
from .repository import AnalysisRepository, MySQLAnalysisRepository


def get_repository() -> AnalysisRepository:
    if settings.db_provider == "firestore":
        from .firestore_repository import FirestoreAnalysisRepository
        return FirestoreAnalysisRepository()
    return MySQLAnalysisRepository()


def initialize() -> None:
    # Fronta analýz (analysis_jobs) je v MySQL v oboch režimoch.
    from . import db
    db.ensure_schema()
    if settings.db_provider == "firestore":
        ping()


def ping() -> bool:
    from . import db
    db.ping()
    if settings.db_provider == "firestore":
        from . import firestore_db
        return firestore_db.ping()
    return True
