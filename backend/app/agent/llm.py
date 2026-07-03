"""
Groq LLM client wrapper for the Order Supervisor agent.
Reads GROQ_API_KEY from environment.
"""

import json
import os
import logging
from typing import Any

from groq import Groq

logger = logging.getLogger(__name__)

_client: Groq | None = None


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY environment variable is not set. "
                "Get a free key at https://console.groq.com"
            )
        _client = Groq(api_key=api_key)
    return _client


def chat_completion(
    messages: list[dict[str, str]],
    model: str = "mixtral-8x7b-32768",
    temperature: float = 0.3,
    max_tokens: int = 1024,
    response_format: str = "json_object",
) -> dict[str, Any]:
    """
    Call the Groq chat completion API and return the parsed JSON response.

    Args:
        messages: OpenAI-style message list.
        model: Groq model name.
        temperature: Sampling temperature.
        max_tokens: Maximum tokens in the response.
        response_format: 'json_object' or 'text'. When 'json_object' the
                         response is parsed and returned as a dict.

    Returns:
        Parsed JSON dict (when response_format='json_object') or raw text string
        wrapped as {'text': '...'}.
    """
    client = get_client()

    kwargs: dict[str, Any] = dict(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if response_format == "json_object":
        kwargs["response_format"] = {"type": "json_object"}

    logger.debug("Groq request model=%s messages=%d", model, len(messages))

    response = client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content or ""

    logger.debug("Groq response tokens=%s", response.usage)

    if response_format == "json_object":
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse Groq JSON response: %s", exc)
            # Best-effort: try to extract JSON from the response
            import re
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Groq response was not valid JSON: {content[:500]}") from exc

    return {"text": content}
