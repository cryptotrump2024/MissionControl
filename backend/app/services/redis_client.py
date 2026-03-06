"""Shared async Redis client for backend services.

Usage:
    from app.services.redis_client import get_redis
    r = get_redis()
    await r.xadd("tasks:ceo", {"task": json_str})
"""
from redis.asyncio import Redis as AsyncRedis
from redis.asyncio import from_url

from app.config import get_settings

_client: AsyncRedis | None = None


def get_redis() -> AsyncRedis:
    """Return a module-level Redis client (created on first call).

    Thread-safe for pre-warming: call once in startup_event before
    accepting requests to avoid concurrent-init races.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the Redis connection pool. Call on app shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
