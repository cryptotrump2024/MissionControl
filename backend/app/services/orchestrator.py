"""
Orchestrator Service — Routes tasks between agents based on hierarchy and delegation chains.

This is deterministic code (NOT an LLM call). It enforces the organizational
structure defined in registry.yaml and routes tasks via Redis Streams.
"""

import json
import logging
from typing import Any
from pathlib import Path

import yaml
import redis.asyncio as redis

from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

REGISTRY_PATH = Path(__file__).parent.parent.parent.parent / "agents" / "registry.yaml"


class Orchestrator:
    """
    Task routing engine that enforces agent hierarchy and delegation chains.

    Responsibilities:
    - Accept new tasks from the API or from agents (via delegation)
    - Route tasks to the appropriate agent's Redis Stream
    - Enforce delegation rules (who can delegate to whom)
    - Handle task decomposition (parent → subtask relationships)
    - Track task lifecycle
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis_url = redis_url
        self._redis: redis.Redis | None = None
        self._registry: dict = {}
        self._load_registry()

    def _load_registry(self):
        """Load agent hierarchy from registry.yaml."""
        try:
            with open(REGISTRY_PATH) as f:
                data = yaml.safe_load(f)
                self._registry = data.get("agents", {})
            logger.info(f"Loaded registry with {len(self._registry)} agents")
        except FileNotFoundError:
            logger.warning(f"Registry not found at {REGISTRY_PATH}, using empty registry")
            self._registry = {}

    async def connect(self):
        """Connect to Redis."""
        self._redis = redis.from_url(self.redis_url, decode_responses=True)
        logger.info("Orchestrator connected to Redis")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()

    # ── Task Routing ─────────────────────────────────────────────────

    async def route_task(self, task_data: dict) -> str:
        """
        Route a task to the appropriate agent.

        If no specific agent is targeted, routes to CEO for decomposition.
        If a specific agent type is targeted, validates delegation and routes.

        Returns the target agent type.
        """
        if not self._redis:
            await self.connect()

        target_type = task_data.get("target_agent_type")
        delegated_by = task_data.get("delegated_by_type")

        # Default: route to CEO if no target specified
        if not target_type:
            target_type = "ceo"

        # Validate delegation chain
        if delegated_by and not self._can_delegate(delegated_by, target_type):
            raise ValueError(
                f"Agent '{delegated_by}' is not allowed to delegate to '{target_type}'. "
                f"Allowed targets: {self._registry.get(delegated_by, {}).get('delegation_targets', [])}"
            )

        # Validate target exists in registry
        if target_type not in self._registry:
            raise ValueError(f"Unknown agent type: '{target_type}'. Available: {list(self._registry.keys())}")

        # Publish task to the target agent's Redis Stream
        stream_name = f"tasks:{target_type}"
        await self._redis.xadd(
            stream_name,
            {"task": json.dumps(task_data, default=str)},
        )

        logger.info(
            f"Task '{task_data.get('title', 'untitled')}' routed to {target_type} "
            f"(stream={stream_name})"
        )

        # Broadcast event
        await ws_manager.broadcast("task_routed", {
            "task_id": task_data.get("id"),
            "title": task_data.get("title"),
            "target_agent": target_type,
            "delegated_by": delegated_by,
        })

        return target_type

    async def route_subtasks(self, parent_task_id: str, subtasks: list[dict]) -> list[str]:
        """
        Route multiple subtasks created by task decomposition.

        Called when CEO breaks a task into subtasks for different agents.
        """
        routes = []
        for subtask in subtasks:
            subtask["parent_task_id"] = parent_task_id
            target = await self.route_task(subtask)
            routes.append(target)
        return routes

    # ── Delegation Validation ────────────────────────────────────────

    def _can_delegate(self, from_type: str, to_type: str) -> bool:
        """Check if one agent type can delegate tasks to another."""
        if from_type not in self._registry:
            return False

        allowed = self._registry[from_type].get("delegation_targets", [])
        return to_type in allowed

    def get_delegation_targets(self, agent_type: str) -> list[str]:
        """Get the list of agent types this agent can delegate to."""
        if agent_type not in self._registry:
            return []
        return self._registry[agent_type].get("delegation_targets", [])

    # ── Registry Info ────────────────────────────────────────────────

    def get_agent_config(self, agent_type: str) -> dict | None:
        """Get the registry config for an agent type."""
        return self._registry.get(agent_type)

    def get_hierarchy(self) -> dict:
        """Get the full agent hierarchy for visualization."""
        hierarchy = {}
        for agent_type, config in self._registry.items():
            hierarchy[agent_type] = {
                "name": config.get("name", agent_type),
                "tier": config.get("tier", 2),
                "reports_to": config.get("reports_to"),
                "delegation_targets": config.get("delegation_targets", []),
                "capabilities": config.get("capabilities", []),
            }
        return hierarchy

    def get_all_agent_types(self) -> list[str]:
        """Get all registered agent types."""
        return list(self._registry.keys())


# Singleton
orchestrator = Orchestrator()
