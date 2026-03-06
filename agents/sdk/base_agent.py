"""
BaseAgent — The core class all AI agents inherit from.

Handles the complete agent lifecycle:
1. Registration with Mission Control
2. Heartbeat keepalive
3. Task consumption from Redis Streams
4. ReAct execution loop (Think → Act → Observe → Report)
5. LLM calls via Anthropic SDK
6. Tool execution
7. Telemetry reporting (logs, costs)
8. Memory management

Creating a new agent:
    class MyAgent(BaseAgent):
        def get_system_prompt(self) -> str:
            return "You are a research agent..."

        def get_tools(self) -> list[ToolDefinition]:
            return [my_tool_1, my_tool_2]
"""

import logging
import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import Any

import redis.asyncio as redis

from agents.sdk.llm_client import LLMClient
from agents.sdk.tools import ToolRegistry, ToolResult
from agents.sdk.mc_client import MCClient
from agents.sdk.memory import MemoryManager

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    """Configuration for an agent instance."""
    name: str
    type: str                          # e.g. "ceo", "researcher", "writer"
    tier: int = 2                      # 0=governance, 1=exec, 2=mgmt, 3=ops
    model: str = "claude-sonnet-4-6"
    capabilities: list[str] = field(default_factory=list)
    delegation_targets: list[str] = field(default_factory=list)
    allowed_tools: list[str] = field(default_factory=list)
    token_budget_daily: int = 50000
    max_steps: int = 10                # Max ReAct iterations per task
    description: str = ""
    reports_to: str | None = None      # Parent agent type
    config: dict = field(default_factory=dict)

    def to_registration_dict(self) -> dict:
        """Convert to the format expected by MC's /api/agents/register."""
        return {
            "name": self.name,
            "type": self.type,
            "tier": self.tier,
            "model": self.model,
            "capabilities": self.capabilities,
            "delegation_targets": self.delegation_targets,
            "allowed_tools": self.allowed_tools,
            "model_preference": self.model,
            "token_budget_daily": self.token_budget_daily,
            "description": self.description,
            "config": self.config,
        }


class BaseAgent:
    """
    Base class for all Mission Control AI agents.

    Subclasses must implement:
        - get_system_prompt() -> str
        - get_tools() -> list (optional, for agent-specific tools)

    The agent lifecycle:
        1. __init__() — Configure LLM, tools, memory
        2. run() — Register with MC, start heartbeat, listen for tasks
        3. execute_task() — ReAct loop for each task
        4. shutdown() — Clean up resources
    """

    def __init__(
        self,
        config: AgentConfig,
        mc_url: str = "http://localhost:8000",
        redis_url: str = "redis://localhost:6379/0",
        api_key: str | None = None,
        backup_api_key: str | None = None,
    ):
        self.config = config
        self.mc = MCClient(base_url=mc_url)

        # Resolve OAuth tokens: use explicit params, fall back to env vars
        resolved_key = api_key or os.getenv("ANTHROPIC_API_KEY") or None
        resolved_backup = backup_api_key or os.getenv("ANTHROPIC_API_KEY_BACKUP") or None

        self.llm = LLMClient(
            model=config.model,
            api_key=resolved_key,
            backup_api_key=resolved_backup,
        )
        self.memory = MemoryManager()
        self.tools = ToolRegistry(allowed_tools=config.allowed_tools)
        self.redis_url = redis_url
        self._redis: redis.Redis | None = None
        self._running = False

        # Register agent-specific tools
        for tool_def in self.get_tools():
            self.tools.register(tool_def)

        logger.info(f"Agent '{config.name}' initialized (model={config.model}, tools={self.tools.tool_names})")

    # ── Abstract Methods (Override in Subclasses) ────────────────────

    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent. Must be overridden."""
        return f"You are {self.config.name}, a helpful AI assistant."

    def get_tools(self) -> list:
        """Return agent-specific tool definitions. Override to add custom tools."""
        return []

    # ── Main Run Loop ────────────────────────────────────────────────

    async def run(self):
        """
        Main entry point: register, start heartbeat, consume tasks from Redis.
        Runs until shutdown() is called.
        """
        self._running = True

        # Connect to Redis
        self._redis = redis.from_url(self.redis_url, decode_responses=True)

        # Register with Mission Control
        reg_data = await self.mc.register(self.config.to_registration_dict())
        await self.mc.start_heartbeat(interval=30)
        await self.mc.update_status("idle")
        await self.mc.log(f"Agent '{self.config.name}' started and ready for tasks")

        # Create consumer group for this agent's stream
        stream_name = f"tasks:{self.config.type}"
        group_name = f"agent:{self.config.type}"
        consumer_name = f"{self.config.type}:{self.mc.agent_id}"

        try:
            await self._redis.xgroup_create(stream_name, group_name, id="0", mkstream=True)
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
            # Group already exists, that's fine

        logger.info(f"Listening for tasks on stream '{stream_name}'")

        # Main loop: read tasks from Redis Stream
        while self._running:
            try:
                messages = await self._redis.xreadgroup(
                    groupname=group_name,
                    consumername=consumer_name,
                    streams={stream_name: ">"},
                    count=1,
                    block=5000,  # Block for 5 seconds, then loop
                )

                if messages:
                    for stream, entries in messages:
                        for msg_id, data in entries:
                            task_data = json.loads(data.get("task", "{}"))
                            await self._handle_task(task_data, msg_id, stream_name, group_name)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in task loop: {e}")
                await asyncio.sleep(1)

    async def _handle_task(self, task_data: dict, msg_id: str, stream: str, group: str):
        """Process a single task from the queue."""
        task_id = task_data.get("id", "unknown")
        logger.info(f"Received task: {task_data.get('title', 'untitled')} (id={task_id})")

        try:
            await self.mc.update_status("working")
            await self.execute_task(task_data)
            await self.mc.update_status("idle")

            # Acknowledge the message in Redis
            await self._redis.xack(stream, group, msg_id)

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            await self.mc.fail_task(task_id, str(e))
            await self.mc.log(f"Task failed: {e}", level="error", task_id=task_id)
            await self.mc.update_status("error")
            # Still ack to prevent reprocessing
            await self._redis.xack(stream, group, msg_id)

    # ── ReAct Execution Loop ─────────────────────────────────────────

    async def execute_task(self, task_data: dict):
        """
        Execute a task using the ReAct pattern:
        Think → Act → Observe → (repeat) → Report

        This is the core agent intelligence loop.
        """
        task_id = task_data.get("id", "unknown")
        title = task_data.get("title", "")
        description = task_data.get("description", "")
        input_data = task_data.get("input_data", {})

        # Update task status to running
        await self.mc.update_task(task_id, status="running")
        await self.mc.log(f"Starting task: {title}", task_id=task_id)

        # Build initial messages
        system_prompt = self.get_system_prompt()
        user_message = self._build_task_message(title, description, input_data)

        messages = [{"role": "user", "content": user_message}]

        # Add context from memory
        context = self.memory.get_context_summary()
        if context:
            system_prompt += f"\n\n{context}"

        # ReAct loop
        total_tokens = 0
        total_cost = 0.0

        for step in range(self.config.max_steps):
            logger.info(f"Task {task_id} — Step {step + 1}/{self.config.max_steps}")

            # Call LLM
            response = await self.llm.chat(
                messages=messages,
                system=system_prompt,
                tools=self.tools.schemas if self.tools.schemas else None,
            )

            total_tokens += response.input_tokens + response.output_tokens
            total_cost += response.cost_usd

            # Report cost to Mission Control
            await self.mc.report_cost(
                model=response.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
                cost_usd=response.cost_usd,
                task_id=task_id,
            )

            if response.has_tool_call:
                # Agent wants to use a tool — execute it
                # Add assistant message with tool use
                assistant_content = []
                if response.text:
                    assistant_content.append({"type": "text", "text": response.text})
                for tc in response.tool_calls:
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tc["input"],
                    })
                messages.append({"role": "assistant", "content": assistant_content})

                # Execute all tool calls and add results
                tool_results = []
                for tc in response.tool_calls:
                    await self.mc.log(
                        f"Using tool: {tc['name']}", task_id=task_id,
                        metadata={"tool_input": tc["input"]},
                    )
                    result = await self.tools.execute(tc)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc["id"],
                        "content": result.output,
                        "is_error": result.is_error,
                    })

                messages.append({"role": "user", "content": tool_results})

            else:
                # Agent is done — has a final response
                await self.mc.log(
                    f"Task completed (steps={step + 1}, tokens={total_tokens})",
                    task_id=task_id,
                )
                await self.mc.complete_task(task_id, output=response.text)
                await self.mc.update_task(
                    task_id,
                    tokens_used=total_tokens,
                    cost=total_cost,
                )

                # Store task result in memory
                self.memory.add_message(task_id, {
                    "role": "assistant",
                    "content": response.text,
                })

                return

        # Max steps reached without completion
        await self.mc.log(
            f"Task hit max steps ({self.config.max_steps})",
            level="warn",
            task_id=task_id,
        )
        await self.mc.fail_task(
            task_id,
            f"Reached maximum steps ({self.config.max_steps}) without completing",
        )

    def _build_task_message(
        self, title: str, description: str, input_data: dict
    ) -> str:
        """Build the user message for a task."""
        parts = [f"## Task: {title}"]

        if description:
            parts.append(f"\n{description}")

        if input_data:
            parts.append(f"\n## Input Data\n```json\n{json.dumps(input_data, indent=2)}\n```")

        return "\n".join(parts)

    # ── Shutdown ─────────────────────────────────────────────────────

    async def shutdown(self):
        """Gracefully shut down the agent."""
        self._running = False
        logger.info(f"Shutting down agent '{self.config.name}'")
        await self.mc.log(f"Agent '{self.config.name}' shutting down")
        await self.mc.close()
        if self._redis:
            await self._redis.close()
