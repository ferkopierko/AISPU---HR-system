"""Firestore server client: ADC in the cloud, read-only mounted credentials locally."""

from functools import lru_cache
import os

from google.cloud import firestore

from .config import settings


@lru_cache(maxsize=1)
def get_client():
    # FIRESTORE_EMULATOR_HOST is handled by the SDK; no credentials needed there.
    # The SDK treats even an empty string as an emulator endpoint. Compose uses
    # an empty value to override inherited local settings for cloud deployments.
    if os.environ.get("FIRESTORE_EMULATOR_HOST") == "":
        os.environ.pop("FIRESTORE_EMULATOR_HOST", None)
    return firestore.Client(project=settings.firebase_project_id,
                            database=settings.firestore_database_id)


def ping() -> bool:
    # Reading a missing document also verifies connectivity and IAM permissions.
    get_client().document("_health/backend2").get(timeout=10, retry=None)
    return True
