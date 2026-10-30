"""Storage selection is explicit; failures never fall back to another database."""

from .config import settings
from .repository import AnalysisRepository, MySQLAnalysisRepository


def get_repository() -> AnalysisRepository:
    if settings.db_provider == "firestore":
        from .firestore_repository import FirestoreAnalysisRepository
        return FirestoreAnalysisRepository()
    return MySQLAnalysisRepository()


def initialize() -> None:
    if settings.db_provider == "mysql":
        from . import db
        db.ensure_schema()
    else:
        ping()


def ping() -> bool:
    if settings.db_provider == "firestore":
        from . import firestore_db
        return firestore_db.ping()
    from . import db
    return db.ping()
