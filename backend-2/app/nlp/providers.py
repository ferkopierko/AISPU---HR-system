"""Skill extraction providers. Azure is opt-in; failures never silently use rules."""

import math
import re
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from .skills import SKILLS, CASE_SENSITIVE


class ProviderError(Exception):
    """Safe public error; do not include CV text, keys or remote response bodies."""


@dataclass(frozen=True)
class SkillEntity:
    skill: str
    text: str
    offset: int
    length: int
    confidence: float | None
    source: str
    assertion: str = "supported"
    verified_context: str | None = None


def canonical_skill(text: str) -> str:
    normalized = " ".join(text.casefold().split())
    for skill, aliases in SKILLS.items():
        if normalized in {s.casefold() for s in [skill, *aliases, *CASE_SENSITIVE.get(skill, [])]}:
            return skill
    return normalized


def local_entities(text: str, skills: list[str]) -> list[SkillEntity]:
    entities = []
    for skill in skills:
        for alias in [skill, *SKILLS.get(skill, []), *CASE_SENSITIVE.get(skill, [])]:
            for match in re.finditer(rf"(?<!\w){re.escape(alias)}(?!\w)", text, re.IGNORECASE):
                entities.append(SkillEntity(skill, match.group(), match.start(), len(match.group()), None, "local_rules"))
    return entities


def evidence_context(text: str, entity: SkillEntity) -> str:
    if entity.verified_context:
        return entity.verified_context
    start = max(text.rfind("\n", 0, entity.offset), text.rfind(". ", 0, entity.offset)) + 1
    end = text.find("\n", entity.offset + entity.length)
    end = len(text) if end < 0 else end
    return text[max(start, entity.offset - 180):min(end, entity.offset + entity.length + 180)].strip()


def is_uncertain(text: str, entity: SkillEntity, threshold: float) -> bool:
    # Conservative guard, not a negation/experience model. HR sees the full context.
    context = evidence_context(text, entity).casefold()
    return entity.assertion != "supported" or (entity.confidence is not None and entity.confidence < threshold) or bool(re.search(
        r"\b(no experience|not experienced|never used|without experience|want to learn|plan to learn|"
        r"nemám|nemam|neovládam|neovladam|nepoznám|nepoznam|bez skúseností|bez skusenosti|"
        r"chcem sa naučiť|plánujem sa naučiť)\b", context))


class AzureCustomNer:
    """REST 2022-05-01 long-running prediction; bounded polling, no automatic POST retry."""

    def __init__(self, settings, *, transport=None, clock=time.monotonic, sleep=time.sleep):
        self.settings = settings
        self.endpoint = settings.azure_language_endpoint.rstrip("/")
        self.transport, self.clock, self.sleep = transport, clock, sleep

    def extract(self, text: str) -> tuple[list[SkillEntity], str]:
        if len(text) > self.settings.azure_max_characters:
            raise ProviderError("Text CV prekračuje nastavený limit pre Azure. Skráťte dokument.")
        deadline = self.clock() + self.settings.azure_timeout_seconds
        headers = {"Ocp-Apim-Subscription-Key": self.settings.azure_language_key}
        parameters = {
            "projectName": self.settings.azure_ner_project,
            "deploymentName": self.settings.azure_ner_deployment,
            "stringIndexType": "UnicodeCodePoint",
            "loggingOptOut": True,
        }
        document = {"id": "cv", "text": text}
        if self.settings.azure_ner_language:
            document["language"] = self.settings.azure_ner_language
        try:
            with httpx.Client(headers=headers, transport=self.transport, follow_redirects=False, timeout=15) as client:
                response = client.post(
                    self.endpoint + "/language/analyze-text/jobs",
                    params={"api-version": "2022-05-01"},
                    json={"analysisInput": {"documents": [document]}, "tasks": [{"kind": "CustomEntityRecognition", "parameters": parameters}]},
                )
                self._check_http(response)
                if response.status_code != 202:
                    raise ProviderError("Azure nevrátilo potvrdenie prijatia úlohy.")
                location = response.headers.get("operation-location", "")
                origin, target = urlparse(self.endpoint), urlparse(location)
                if (target.scheme, target.netloc) != (origin.scheme, origin.netloc) or not target.path.startswith("/language/analyze-text/jobs/") or target.username or target.password or target.fragment:
                    raise ProviderError("Azure vrátilo neplatnú adresu výsledku.")
                while self.clock() < deadline:
                    response = client.get(location, timeout=min(15, max(.1, deadline - self.clock())))
                    if response.status_code in (429, 503):
                        self._pause(response, deadline)
                        continue
                    self._check_http(response)
                    body = response.json()
                    state = str(body.get("status", "")).casefold()
                    if state == "succeeded":
                        return self._entities(body, text)
                    if state in ("failed", "cancelled", "canceled", "partiallycompleted"):
                        raise ProviderError("Azure analýza zlyhala. Prihláška a CV zostali uložené.")
                    if state not in ("notstarted", "running", "cancelling"):
                        raise ProviderError("Azure vrátilo neznámy stav analýzy.")
                    self._pause(response, deadline)
        except (httpx.HTTPError, ValueError, TypeError, KeyError) as exc:
            raise ProviderError("Azure je nedostupné alebo vrátilo neplatnú odpoveď. Skúste analýzu neskôr.") from exc
        raise ProviderError("Vypršal čas čakania na Azure. Prihláška a CV zostali uložené.")

    def _pause(self, response, deadline):
        try:
            wait = float(response.headers.get("retry-after", "1"))
        except ValueError:
            wait = 1
        self.sleep(min(max(1, wait if math.isfinite(wait) else 1), 10, max(0, deadline - self.clock())))

    @staticmethod
    def _check_http(response):
        if 200 <= response.status_code < 300:
            return
        if response.status_code in (401, 403):
            raise ProviderError("Azure odmietlo prístup. Správca musí skontrolovať konfiguráciu služby.")
        if response.status_code == 429:
            raise ProviderError("Azure dosiahlo limit požiadaviek alebo kvótu. Skúste neskôr.")
        raise ProviderError("Volanie Azure sa nepodarilo. Prihláška a CV zostali uložené.")

    def _entities(self, body, text):
        tasks = body.get("tasks", {})
        items = tasks.get("items", [])
        if tasks.get("failed", 0) or len(items) != 1:
            raise ProviderError("Azure nedokončilo rozpoznávanie entít.")
        task = items[0]
        if str(task.get("status", "succeeded")).casefold() != "succeeded":
            raise ProviderError("Azure nedokončilo rozpoznávanie entít.")
        result = task.get("results", {})
        docs = result.get("documents", [])
        if result.get("errors") or len(docs) != 1 or docs[0].get("id") != "cv" or "entities" not in docs[0]:
            raise ProviderError("Azure neposkytlo úplný výsledok pre CV.")
        entities = []
        for item in docs[0]["entities"]:
            if item.get("category") not in self.settings.azure_ner_skill_categories:
                continue
            offset, length = item.get("offset"), item.get("length")
            confidence = item.get("confidenceScore")
            if (type(offset) is not int or type(length) is not int or offset < 0 or length < 1 or offset + length > len(text)
                or text[offset:offset + length] != item.get("text") or isinstance(confidence, bool)
                or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1):
                raise ProviderError("Azure vrátilo neplatný textový podklad. Výsledok vyžaduje opakovanie analýzy.")
            entities.append(SkillEntity(canonical_skill(item["text"]), item["text"], offset, length, float(confidence), "azure_custom_ner"))
        # Deployment is mutable; preserve explicit release label + Azure modelVersion if supplied.
        version = result.get("modelVersion") or self.settings.azure_ner_model_version
        return entities, str(version)
