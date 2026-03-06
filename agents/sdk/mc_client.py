"""
Mission Control API Client — Thin HTTP wrapper for agent-to-MC communication.

Handles agent registration, heartbeat, task management, logging, and cost reporting.
Used internally by BaseAgent — agent developers rarely need to touch this directly.
"""

import logging
import asyncio
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class MCClient:
    """
    HTTP client for Mission Control API.
    Manages agent lifecycle: registration, heartbeats, task updates, logs, costs.
    """

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        self.agent_id: str | None = None
        self._heartbeat_task: asyncio.Task | None = None

    # ── Agent Lifecycle ──────────────────────────────────────────────

    async def register(self, config: dict) -> dict:
        """Register this agent with Mission Control. Returns created agent data."""
        response = await self.client.post("/api/agents/register", json=config)
        response.raise_for_status()
        data = response.json()
        self.agent_id = data["id"]
        logger.info(f"Registered with Mission Control as '{data['name']}' (id={self.agent_id})")
        return data

    async def heartbeat(self) -> dict:
        """Send a heartbeat ping to Mission Control."""
        if not self.agent_id:
            raise RuntimeError("Agent not registered — call register() first")
        response = await self.client.post(f"/api/agents/{self.agent_id}/heartbeat")
        response.raise_for_status()
        return response.json()

    async def start_heartbeat(self, interval: int = 30):
        """Start a background heartbeat loop."""
        async def _loop():
            while True:
                try:
                    await self.heartbeat()
                except Exception as e:
                    logger.warning(f"Heartbeat failed: {e}")
                await asyncio.sleep(interval)

        self._heartbeat_task = asyncio.create_task(_loop())
        logger.info(f"Heartbeat started (interval={interval}s)")

    async def stop_heartbeat(self):
        """Stop the background heartbeat."""
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

    async def update_status(self, status: str) -> dict:
        """Update this agent's status in Mission Control."""
        if not self.agent_id:
            raise RuntimeError("Agent not registered")
        response = await self.client.patch(
            f"/api/agents/{self.agent_id}/status",
            json={"status": status},
        )
        response.raise_for_status()
        return response.json()

    # ── Task Management ──────────────────────────────────────────────

    async def create_task(self, task_data: dict) -> dict:
        """Create a new task in Mission Control."""
        response = await self.client.post("/api/tasks", json=task_data)
        response.raise_for_status()
        return response.json()

    async def update_task(self, task_id: str, **updates) -> dict:
        """Update a task's status, output, or other fields."""
        response = await self.client.patch(f"/api/tasks/{task_id}", json=updates)
        response.raise_for_status()
        return response.json()

    async def complete_task(self, task_id: str, output: Any) -> dict:
        """Mark a task as completed with output data."""
        return await self.update_task(
            task_id,
            status="completed",
            output_data={"result": output} if isinstance(output, str) else output,
        )

    async def fail_task(self, task_id: str, error: str) -> dict:
        """Mark a task as failed with an error message."""
        return await self.update_task(
            task_id,
            status="failed",
            error_message=error,
        )

    async def get_task(self, task_id: str) -> dict:
        """Fetch a task by ID."""
        response = await self.client.get(f"/api/tasks/{task_id}")
        response.raise_for_status()
        return response.json()

    # ── Logging ──────────────────────────────────────────────────────

    async def log(
        self,
        message: str,
        level: str = "info",
        task_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        """Send a log entry to Mission Control."""
        payload = {
            "agent_id": self.agent_id,
            "level": level,
            "message": message,
        }
        if task_id:
            payload["task_id"] = task_id
        if metadata:
            payload["metadata"] = metadata

        response = await self.client.post("/api/logs", json=payload)
        response.raise_for_status()
        return response.json()

    # ── Cost Reporting ───────────────────────────────────────────────

    async def report_cost(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        task_id: str | None = None,
    ) -> dict:
        """Report a cost record to Mission Control."""
        payload = {
            "agent_id": self.agent_id,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
        }
        if task_id:
            payload["task_id"] = task_id

        response = await self.client.post("/api/costs", json=payload)
        response.raise_for_status()
        return response.json()

    # ── Cleanup ──────────────────────────────────────────────────────

    async def close(self):
        """Shutdown the client and stop heartbeat."""
        await self.stop_heartbeat()
        await self.update_status("offline")
        await self.client.aclose()
