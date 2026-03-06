"""
LLM Client — Anthropic Claude SDK wrapper with cost tracking and model tiering.

Uses the Anthropic Python SDK directly for native tool_use support.
Tracks token usage and reports costs back to Mission Control.
"""

import logging
import asyncio
from dataclasses import dataclass, field
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

# Claude model pricing per 1M tokens (as of March 2026)
MODEL_PRICING = {
    # Anthropic Claude (direct)
    "claude-opus-4-0": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5": {"input": 0.80, "output": 4.0},
    # OpenRouter — Moonshot Kimi K2
    "moonshotai/kimi-k2": {"input": 1.0, "output": 3.0},
}


@dataclass
class LLMResponse:
    """Structured response from an LLM call."""
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    model: str = ""
    stop_reason: str = ""

    @property
    def has_tool_call(self) -> bool:
        return len(self.tool_calls) > 0

    @property
    def first_tool_call(self) -> dict | None:
        return self.tool_calls[0] if self.tool_calls else None


class LLMClient:
    """
    Anthropic Claude LLM client with:
    - Native tool_use support
    - Automatic cost tracking
    - Retry with exponential backoff
    - Model tiering (haiku/sonnet/opus)
    - Backup OAuth token failover (automatically switches if primary auth fails)
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        api_key: str | None = None,
        backup_api_key: str | None = None,
    ):
        self.model = model
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        # Backup client created lazily only if a backup key is provided
        self._backup_client: anthropic.AsyncAnthropic | None = (
            anthropic.AsyncAnthropic(api_key=backup_api_key)
            if backup_api_key
            else None
        )
        self._using_backup = False
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_cost_usd = 0.0

    async def chat(
        self,
        messages: list[dict],
        system: str | None = None,
        tools: list[dict] | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Send a chat request to Claude.

        Args:
            messages: List of message dicts with 'role' and 'content'
            system: Optional system prompt
            tools: Optional list of tool definitions (Claude tool_use format)
            model: Override model for this specific call
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            LLMResponse with text, tool calls, and cost info
        """
        use_model = model or self.model

        kwargs: dict[str, Any] = {
            "model": use_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        response = await self._call_with_retry(kwargs)
        return self._parse_response(response, use_model)

    async def _call_with_retry(
        self, kwargs: dict, max_retries: int = 3, base_delay: float = 1.0
    ) -> anthropic.types.Message:
        """
        Call Claude API with exponential backoff retry for rate limits.

        Token failover: if the primary OAuth token fails with AuthenticationError
        and a backup token was configured, automatically retries once with the
        backup token. Logs which token path is active (never logs token values).
        """
        active_client = self.client

        for attempt in range(max_retries):
            try:
                response = await active_client.messages.create(**kwargs)
                return response
            except anthropic.AuthenticationError as e:
                # Primary token rejected — try backup once before giving up
                if not self._using_backup and self._backup_client is not None:
                    logger.warning(
                        "Primary OAuth token failed authentication. "
                        "Switching to backup token."
                    )
                    self._using_backup = True
                    active_client = self._backup_client
                    # Retry immediately with backup (don't count as a retry attempt)
                    continue
                logger.error(
                    "Authentication failed on %s token. Check your OAuth token.",
                    "backup" if self._using_backup else "primary",
                )
                raise
            except anthropic.RateLimitError:
                if attempt == max_retries - 1:
                    raise
                delay = base_delay * (2 ** attempt)
                logger.warning(f"Rate limited, retrying in {delay}s (attempt {attempt + 1})")
                await asyncio.sleep(delay)
            except anthropic.APIError as e:
                logger.error(f"Anthropic API error: {e}")
                raise

    def _parse_response(self, response: anthropic.types.Message, model: str) -> LLMResponse:
        """Parse Claude API response into our standardized format."""
        text_parts = []
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append({
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                })

        # Calculate cost
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        pricing = MODEL_PRICING.get(model, {"input": 3.0, "output": 15.0})
        cost_usd = (
            (input_tokens / 1_000_000) * pricing["input"]
            + (output_tokens / 1_000_000) * pricing["output"]
        )

        # Track cumulative usage
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_cost_usd += cost_usd

        return LLMResponse(
            text="\n".join(text_parts),
            tool_calls=tool_calls,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            model=model,
            stop_reason=response.stop_reason,
        )

    def get_usage_stats(self) -> dict:
        """Return cumulative usage statistics."""
        return {
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_cost_usd": round(self.total_cost_usd, 6),
            "model": self.model,
        }
