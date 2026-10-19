"""Pripojenie na MySQL (lokálny Docker kontajner) cez connection pool.

- údaje iba z premenných prostredia (config.py),
- pool sa vytvorí pri prvom použití a zdieľa sa,
- hodnoty do SQL sa predávajú výhradne ako parametre (%s) – ochrana pred SQL injection.
"""

import threading
from contextlib import contextmanager

import mysql.connector
from mysql.connector import pooling

from .config import settings

_pool: pooling.MySQLConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = pooling.MySQLConnectionPool(
                pool_name="hr_analysis",
                pool_size=5,
                host=settings.mysql_host,
                port=settings.mysql_port,
                database=settings.mysql_database,
                user=settings.mysql_user,
                password=settings.mysql_password,
                charset="utf8mb4",
                collation="utf8mb4_unicode_ci",
                connection_timeout=10,
                autocommit=False,
            )
        return _pool


@contextmanager
def get_connection():
    """Spojenie z poolu; pri chybe rollback, vždy sa vráti do poolu."""
    conn = _get_pool().get_connection()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()  # pri pooled spojení = vrátenie do poolu


def ping() -> bool:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        return cur.fetchone()[0] == 1


# Stĺpce pridané vo fáze 3. init.sql beží iba pri prvom štarte kontajnera,
# preto sa do existujúcej databázy doplnia pri štarte aplikácie.
_MIGRATIONS = [
    ("cv_analyses", "education_json", "ALTER TABLE cv_analyses ADD COLUMN education_json JSON NULL AFTER skills_json"),
    ("match_scores", "text_similarity", "ALTER TABLE match_scores ADD COLUMN text_similarity DECIMAL(5,2) NULL AFTER score_percentage"),
    ("match_scores", "skill_coverage", "ALTER TABLE match_scores ADD COLUMN skill_coverage DECIMAL(5,2) NULL AFTER text_similarity"),
]


def ensure_schema() -> None:
    with get_connection() as conn:
        cur = conn.cursor()
        for table, column, ddl in _MIGRATIONS:
            cur.execute(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
                (table, column),
            )
            if cur.fetchone()[0] == 0:
                cur.execute(ddl)
        conn.commit()


__all__ = ["get_connection", "ping", "ensure_schema", "mysql"]
