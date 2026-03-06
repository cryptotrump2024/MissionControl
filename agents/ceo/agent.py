"""CEO Agent — Master orchestrator that decomposes tasks and delegates to specialists."""

from agents.sdk.base_agent import BaseAgent, AgentConfig
from agents.ceo.prompts import SYSTEM_PROMPT


class CEOAgent(BaseAgent):
    """
    The CEO Agent is the entry point for all user tasks.
    It analyzes complex requests, creates execution plans,
    and delegates subtasks to specialist agents (researcher, writer, developer).
    """

    def __init__(self, **kwargs):
        config = AgentConfig(
            name="CEO Agent",
            type="ceo",
            tier=1,
            model="moonshotai/kimi-k2",
            capabilities=[
                "Strategic planning",
                "Task decomposition",
                "Cross-department orchestration",
                "Decision making",
                "Delegation",
            ],
            delegation_targets=["researcher", "writer", "developer"],
            allowed_tools=["delegate_task", "review_output", "plan_tasks"],
            token_budget_daily=100000,
            max_steps=10,
            description="Master orchestrator that decomposes and delegates complex tasks.",
        )
        super().__init__(config, **kwargs)

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list:
        return []  # Uses built-in tools (delegate_task, review_output, plan_tasks)
