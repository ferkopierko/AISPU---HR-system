"""Backend 2 – FastAPI: analýza CV (NLP) a výpočet zhody s pozíciou.

Spustenie (z priečinka backend-2):  uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .config import settings
from .nlp.preprocess import get_nlp
from .routers import ml

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_nlp()  # načítať spaCy model hneď, nie pri prvej požiadavke
    try:
        db.ensure_schema()
        log.info("Pripojené na MySQL (%s:%s/%s)", settings.mysql_host, settings.mysql_port, settings.mysql_database)
    except Exception as err:  # server beží ďalej, /health ukáže výpadok
        log.error("MySQL nedostupná: %s", err)
    yield


app = FastAPI(title="AISPU HR – Backend 2 (ML/NLP)", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(ml.router)


@app.get("/health", tags=["health"])
def health():
    try:
        db.ping()
        return {"status": "ok", "database": "connected"}
    except Exception as err:
        log.error("[health] MySQL nedostupná: %s", err)
        return JSONResponse({"status": "error", "database": "unavailable"}, status_code=503)
