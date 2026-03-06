"""
Memory Manager — Handles short-term conversation buffers and long-term knowledge storage.

Three memory layers:
1. Short-term: Conversation buffer per task (last N messages)
2. Long-term: PostgreSQL/pgvector for persistent knowledge (Phase 2)
3. Shared: Read/write to MC knowledge base via API (Phase 2)
"""

import logging
from collections import deque
from typing import Any

logger = logging.getLogger(__name__)


class MemoryManager:
    """
    Manages agent memory across conversations and tasks.

    Phase 1: Simple conversation buffer with sliding window.
    Phase 2: Add pgvector for semantic search over past interactions.
    """

    def __init__(self, max_messages: int = 50, max_tokens_estimate: int = 100000):
        self.max_messages = max_messages
        self.max_tokens_estimate = max_tokens_estimate

        # Short-term: conversation buffer per task
        self._task_buffers: dict[str, deque] = {}

        # Working memory: key-value store for current session
        self._working_memory: dict[str, Any] = {}

        # Long-term knowledge entries (Phase 2: move to pgvector)
        self._knowledge: list[dict] = []

    # ── Short-term (Task Conversation Buffer) ────────────────────────

    def get_task_messages(self, task_id: str) -> list[dict]:
        """Get the conversation history for a task."""
        if task_id not in self._task_buffers:
            return []
        return list(self._task_buffers[task_id])

    def add_message(self, task_id: str, message: dict):
        """Add a message to a task's conversation buffer."""
        if task_id not in self._task_buffers:
            self._task_buffers[task_id] = deque(maxlen=self.max_messages)
        self._task_buffers[task_id].append(message)

    def clear_task(self, task_id: str):
        """Clear the conversation buffer for a completed task."""
        self._task_buffers.pop(task_id, None)

    # ── Working Memory (Session Key-Value Store) ─────────────────────

    def set(self, key: str, value: Any):
        """Store a value in working memory."""
        self._working_memory[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Retrieve a value from working memory."""
        return self._working_memory.get(key, default)

    def get_context_summary(self) -> str:
        """Get a summary of working memory for inclusion in prompts."""
        if not self._working_memory:
            return ""

        lines = ["## Current Context"]
        for key, value in self._working_memory.items():
            val_str = str(value)
            if len(val_str) > 200:
                val_str = val_str[:200] + "..."
            lines.append(f"- **{key}**: {val_str}")

        return "\n".join(lines)

    # ── Long-term Knowledge (Phase 2: pgvector) ─────────────────────

    def add_knowledge(self, content: str, metadata: dict | None = None):
        """Store a knowledge entry. Phase 2: will use pgvector for semantic search."""
        entry = {
            "content": content,
            "metadata": metadata or {},
        }
        self._knowledge.append(entry)
        logger.debug(f"Knowledge added. Total entries: {len(self._knowledge)}")

    def search_knowledge(self, query: str, limit: int = 5) -> list[dict]:
        """
        Search knowledge entries. Phase 1: simple substring match.
        Phase 2: pgvector semantic similarity search.
        """
        results = []
        query_lower = query.lower()
        for entry in self._knowledge:
            if query_lower in entry["content"].lower():
                results.append(entry)
                if len(results) >= limit:
                    break
        return results

    # ── Stats ────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        return {
            "active_task_buffers": len(self._task_buffers),
            "working_memory_keys": len(self._working_memory),
            "knowledge_entries": len(self._knowledge),
            "total_buffered_messages": sum(
                len(buf) for buf in self._task_buffers.values()
            ),
        }
