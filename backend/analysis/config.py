"""UI-editable LLM provider config.

Source of truth is `backend/llm_config.json` (written by the settings UI). If that
file is absent, falls back to the `.env` defaults — so your local .env keeps working
and a fresh deployer can configure everything from the web UI instead.

Each provider is just an OpenAI-compatible endpoint (base_url + api_key + model), so
ANY such service works — NVIDIA Build, DeepSeek, OpenAI, a self-hosted gateway, etc.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

CONFIG_PATH = Path(__file__).resolve().parents[1] / "llm_config.json"

# Built-in provider templates. Keys are pulled from .env on first load.
BUILTINS = {
    "nvidia": {"label": "NVIDIA Build (DeepSeek)", "base_url": "https://integrate.api.nvidia.com/v1",
               "model": "deepseek-ai/deepseek-v4-flash",
               "env": ("NVIDIA_BASE_URL", "NVIDIA_API_KEY", "NVIDIA_MODEL")},
    "deepseek": {"label": "DeepSeek 官方", "base_url": "https://api.deepseek.com/v1",
                 "model": "deepseek-chat",
                 "env": ("DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL")},
    "openai": {"label": "OpenAI", "base_url": "https://api.openai.com/v1",
               "model": "gpt-4o-mini",
               "env": ("OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL")},
    "ds2api": {"label": "ds2api (自建,可选)", "base_url": "",
               "model": "deepseek-v4-flash",
               "env": ("DS2API_BASE_URL", "DS2API_API_KEY", "DS2API_MODEL")},
}


def _from_env() -> dict:
    providers = {}
    for pid, b in BUILTINS.items():
        eb, ek, em = b["env"]
        providers[pid] = {
            "label": b["label"],
            "base_url": os.getenv(eb, b["base_url"]),
            "api_key": os.getenv(ek, ""),
            "model": os.getenv(em, b["model"]),
        }
    chain = [c.strip() for c in os.getenv("LLM_CHAIN", "nvidia,deepseek").split(",") if c.strip()]
    return {"chain": chain, "providers": providers}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            if isinstance(cfg, dict) and "providers" in cfg and "chain" in cfg:
                return cfg
        except (json.JSONDecodeError, OSError):
            pass
    return _from_env()


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2))


def active_providers() -> list[tuple[str, str, str, str]]:
    """Ordered (id, base_url, api_key, model) for chain entries that are fully filled in."""
    cfg = load_config()
    out = []
    for pid in cfg.get("chain", []):
        p = cfg.get("providers", {}).get(pid) or {}
        if p.get("base_url") and p.get("api_key") and p.get("model"):
            out.append((pid, p["base_url"], p["api_key"], p["model"]))
    return out
