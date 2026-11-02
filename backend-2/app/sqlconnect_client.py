"""Python transport for the same IAM endpoints used by Firebase's Node Admin SDK."""

from functools import lru_cache
import re

import google.auth
from google.auth.transport.requests import AuthorizedSession
from requests import Session, RequestException

from .config import settings


class SQLConnectError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _credentials():
    return google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])[0]


class SQLConnectClient:
    def __init__(self, config=None, session_factory=None):
        self.config = config or settings
        identifiers = [self.config.firebase_project_id, self.config.dataconnect_location,
                       self.config.dataconnect_service_id, self.config.dataconnect_connector_id]
        if any(not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", value) for value in identifiers):
            raise SQLConnectError("Neplatná konfigurácia identifikátorov SQL Connect")
        emulator = self.config.dataconnect_emulator_host
        if emulator:
            if not identifiers[0].startswith("demo-") or not re.fullmatch(r"[a-zA-Z0-9.\-]+:[0-9]{1,5}", emulator):
                raise SQLConnectError("SQL Connect emulátor vyžaduje demo- projekt a host:port bez protokolu")
            origin = f"http://{emulator}"
            self.session_factory = session_factory or Session
        else:
            origin = "https://firebasedataconnect.googleapis.com"
            self.session_factory = session_factory or (lambda: AuthorizedSession(_credentials()))
        project, location, service, connector = identifiers
        self.service_url = f"{origin}/v1/projects/{project}/locations/{location}/services/{service}"
        self.url = (f"{origin}/v1/projects/{project}/locations/{location}/services/"
                    f"{service}/connectors/{connector}")

    def require_postgresql(self):
        if self.config.dataconnect_emulator_host:
            return  # The official demo emulator is only used for tests.
        with self.session_factory() as session:
            response = session.get(f"{self.service_url}/schemas/main", timeout=20, allow_redirects=False)
        if response.status_code != 200:
            raise SQLConnectError("Nemožno overiť dostupnosť PostgreSQL databázy")
        data = response.json()
        sources = data.get("datasources", [])
        pg = sources[0].get("postgresql", {}) if sources else {}
        # Protobuf JSON omits false-valued fields for a real PostgreSQL source.
        if pg.get("ephemeral", False) or not pg.get("cloudSql", {}).get("instance"):
            raise SQLConnectError("PostgreSQL sa ešte pripravuje. Dočasná onboarding databáza nie je povolená pre ostré dáta.")

    def execute(self, operation: str, variables=None, *, mutation=False) -> dict:
        # The admin SDK uses impersonateQuery/Mutation without an impersonated
        # user for IAM server access, including @auth(NO_ACCESS) operations.
        endpoint = "impersonateMutation" if mutation else "impersonateQuery"
        try:
            with self.session_factory() as session:
                response = session.post(f"{self.url}:{endpoint}",
                                        json={"operationName": operation, "variables": variables or {}},
                                        timeout=30, allow_redirects=False)
            if response.status_code != 200:
                raise SQLConnectError(f"SQL Connect operácia zlyhala (HTTP {response.status_code})")
            body = response.json()
            if not isinstance(body, dict) or body.get("errors") or not isinstance(body.get("data"), dict):
                raise SQLConnectError("SQL Connect vrátil neúplný alebo chybný výsledok")
            return body["data"]
        except (RequestException, ValueError) as exc:
            # Do not leak remote GraphQL errors: they may contain CVs or variables.
            raise SQLConnectError("SQL Connect je nedostupný alebo vrátil neplatný formát") from exc


def ping() -> bool:
    client = SQLConnectClient()
    client.require_postgresql()
    client.execute("StorageHealth")
    return True
