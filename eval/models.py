"""Per-model run settings from models.json, keyed by the openrouter/… model id."""

import json
from pathlib import Path

MODELS_PATH = Path(__file__).resolve().parent / "models.json"
MODEL_KEYS = {"name", "provider", "reasoning", "tool_choice", "max_tokens"}


def model_settings(model: str) -> dict:
    """`name`, plus optional `provider` (OpenRouter tags, no fallback), `reasoning: true` and
    `tool_choice: "required"` (for models that otherwise write commands as text) and `max_tokens`
    (for providers whose default output cap plus the prompt overflows the context)."""
    models = json.loads(MODELS_PATH.read_text(encoding="utf-8"))
    if model not in models:
        raise SystemExit(f"{model} is not in {MODELS_PATH.name}; add it with its display name")
    settings = models[model]
    unknown = settings.keys() - MODEL_KEYS
    if unknown or not isinstance(settings.get("name"), str):
        raise SystemExit(f"{MODELS_PATH.name} {model}: needs a name and only {sorted(MODEL_KEYS)}, got {settings}")
    provider = settings.get("provider")
    if provider is not None and not (isinstance(provider, list) and provider and all(isinstance(p, str) and p for p in provider)):
        raise SystemExit(f"{MODELS_PATH.name} {model}: provider must be a non-empty list of tags, got {provider!r}")
    if settings.get("reasoning", True) is not True:
        raise SystemExit(f"{MODELS_PATH.name} {model}: reasoning must be true when present")
    if settings.get("tool_choice", "required") != "required":
        raise SystemExit(f"{MODELS_PATH.name} {model}: tool_choice must be \"required\" when present")
    max_tokens = settings.get("max_tokens")
    if max_tokens is not None and not (type(max_tokens) is int and max_tokens > 0):
        raise SystemExit(f"{MODELS_PATH.name} {model}: max_tokens must be a positive integer, got {max_tokens!r}")
    return settings


def extra_body(settings: dict) -> dict:
    """OpenRouter request fields for these settings."""
    body = {}
    if "provider" in settings:
        body["provider"] = {"only": settings["provider"], "allow_fallbacks": False}
    if settings.get("reasoning"):
        body["reasoning"] = {"enabled": True}
    if "tool_choice" in settings:
        body["tool_choice"] = settings["tool_choice"]
    if "max_tokens" in settings:
        body["max_tokens"] = settings["max_tokens"]
    return body
