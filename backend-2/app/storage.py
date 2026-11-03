"""Storage selection is explicit; failures never fall back to another database."""

from .config import settings
from .repository import AnalysisRepository, MySQLAnalysisRepository


def get_repository() -> AnalysisRepository:
    if settings.db_provider == "sqlconnect":
        from .sqlconnect_repository import SQLConnectAnalysisRepository
        return SQLConnectAnalysisRepository()
    if settings.db_provider == "firestore":
        from .firestore_repository import FirestoreAnalysisRepository
        return FirestoreAnalysisRepository()
    return MySQLAnalysisRepository()


def initialize() -> None:
    # MySQL (výsledky a/alebo fronta analýz) sa použije iba, ak je nastavená.
    if settings.uses_mysql:
        from . import db
        db.ensure_schema()
    if settings.db_provider in {"firestore", "sqlconnect"}:
        ping()


def ping() -> bool:
    if settings.uses_mysql:
        from . import db
        db.ping()
    if settings.db_provider == "sqlconnect":
        from . import sqlconnect_client
        return sqlconnect_client.ping()
    if settings.db_provider == "firestore":
        from . import firestore_db
        return firestore_db.ping()
    return True
