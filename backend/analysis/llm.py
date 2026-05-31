"""OpenAI-compatible LLM client with a configurable provider fallback chain.

Order comes from env LLM_CHAIN (default: nvidia -> deepseek -> ds2api). On any
per-call failure the next provider is tried. Each provider is just a base_url +
api_key + model, so anything OpenAI-compatible works.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()


@dataclass
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str


def _load_providers() -> list[Provider]:
    # Reads the UI-editable config (llm_config.json), falling back to .env.
    from analysis.config import active_providers
    return [Provider(pid, base, key, model)
            for pid, base, key, model in active_providers()]


class LLMChain:
    def __init__(self, providers: Optional[list[Provider]] = None):
        self.providers = providers if providers is not None else _load_providers()
        if not self.providers:
            raise RuntimeError(
                "No LLM providers configured. Set keys in .env for at least one of "
                "the providers listed in LLM_CHAIN."
            )

    def chat_json(self, system: str, user: str, temperature: float = 0.2,
                  max_tokens: int = 1024) -> tuple[dict, str]:
        """Return (parsed_json, model_label). Tries providers in order."""
        last_err: Optional[Exception] = None
        for p in self.providers:
            try:
                client = OpenAI(base_url=p.base_url, api_key=p.api_key, timeout=60)
                resp = client.chat.completions.create(
                    model=p.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
                content = resp.choices[0].message.content or "{}"
                return json.loads(content), f"{p.name}:{p.model}"
            except Exception as e:  # noqa: BLE001 - fall through to next provider
                last_err = e
                continue
        raise RuntimeError(f"All LLM providers failed. Last error: {last_err}")


if __name__ == "__main__":
    chain = LLMChain()
    print("Providers:", [p.name for p in chain.providers])
    out, model = chain.chat_json(
        "You are a JSON echo bot.",
        'Return {"ok": true}.',
    )
    print(model, out)
