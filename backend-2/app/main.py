"""Backend 2 – FastAPI: analýza CV (NLP) a výpočet zhody s pozíciou.

Spustenie (z priečinka backend-2):  uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import storage
from .config import settings
from .nlp.preprocess import get_nlp
from .analysis_jobs import AnalysisWorker
from .routers import internal, ml

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_nlp()  # načítať spaCy model hneď, nie pri prvej požiadavke
    try:
        storage.initialize()
        log.info("Pripojené na databázu analýz (%s)", settings.db_provider)
    except Exception as err:  # server beží ďalej, /health ukáže výpadok
        log.error("Databáza analýz (%s) nedostupná: %s", settings.db_provider, err)
    worker = AnalysisWorker() if settings.analysis_worker_enabled else None
    if worker:
        worker.start()
    try:
        yield
    finally:
        if worker:
            worker.stop()


app = FastAPI(title="AISPU HR – Backend 2 (ML/NLP)", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(ml.router)
app.include_router(internal.router)


@app.get("/health", tags=["health"])
def health():
    try:
        storage.ping()
        return {"status": "ok", "database": "connected", "provider": settings.db_provider}
    except Exception as err:
        log.error("[health] Databáza analýz nedostupná: %s", err)
        return JSONResponse({"status": "error", "database": "unavailable", "provider": settings.db_provider}, status_code=503)
