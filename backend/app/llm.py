"""LLM provider layer: builds the tone-aware system prompt and streams text chunks."""
from typing import AsyncIterator, Literal

from .config import settings

Tone = Literal["professional", "casual", "concise"]

BASE_SYSTEM = (
    "You are a helpful, accurate AI assistant. Use Markdown (lists, tables, fenced "
    "code blocks) when it improves clarity. If you are unsure, say so."
)

# The "Tone Toggle": each preference becomes a system-instruction modifier.
TONE_INSTRUCTIONS: dict[str, str] = {
    "professional": (
        "Respond in a polished, professional register: precise vocabulary, well-structured "
        "paragraphs, no slang or emojis. Be courteous and authoritative."
    ),
    "casual": (
        "Respond in a warm, relaxed, conversational voice, like a friendly colleague. "
        "Contractions and light humor are fine; keep it natural and approachable."
    ),
    "concise": (
        "Respond as briefly as possible. Lead with the answer, use at most a few short "
        "sentences or bullets, and omit preamble, filler and repetition unless asked to elaborate."
    ),
}


def build_system_prompt(tone: str) -> str:
    return f"{BASE_SYSTEM}\n\nResponse style: {TONE_INSTRUCTIONS[tone]}"


async def _stream_openai_compatible(
    system: str, history: list[dict], *, api_key: str, model: str, base_url: str | None
) -> AsyncIterator[str]:
    """Shared by OpenAI and Groq (Groq exposes an OpenAI-compatible API)."""
    from importlib import import_module

    AsyncOpenAI = import_module("openai").AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key or "not-needed", base_url=base_url)
    stream = await client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, *history],
        max_tokens=settings.max_tokens,
        stream=True,
    )
    async for event in stream:
        if event.choices and event.choices[0].delta.content:
            yield event.choices[0].delta.content


async def stream_reply(history: list[dict], tone: str) -> AsyncIterator[str]:
    system = build_system_prompt(tone)
    history = history[-settings.max_history:]

    if settings.provider == "groq":
        async for t in _stream_openai_compatible(
            system, history,
            api_key=settings.groq_key,
            model=settings.groq_model,
            base_url="https://api.groq.com/openai/v1",
        ):
            yield t
    elif settings.provider == "openai":
        async for t in _stream_openai_compatible(
            system, history,
            api_key=settings.openai_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url,
        ):
            yield t
    else:
        from importlib import import_module

        AsyncAnthropic = import_module("anthropic").AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.anthropic_key)
        async with client.messages.stream(
            model=settings.anthropic_model,
            max_tokens=settings.max_tokens,
            system=system,
            messages=history,
        ) as stream:
            async for text in stream.text_stream:
                yield text