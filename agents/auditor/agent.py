"""Auditor Agent — Governance layer agent that reviews all outputs for quality and compliance."""

from agents.sdk.base_agent import BaseAgent, AgentConfig
from agents.auditor.prompts import SYSTEM_PROMPT


class AuditorAgent(BaseAgent):
    """
    The Auditor Agent is part of the Governance Layer (Tier 0).
    Reviews outputs from all other agents for quality, accuracy, and compliance.
    Reports to nobody — has independent oversight authority.
    """

    def __init__(self, **kwargs):
        config = AgentConfig(
            name="Auditor Agent",
            type="auditor",
            tier=0,
            model="moonshotai/kimi-k2",
            capabilities=[
                "Quality review",
                "Accuracy verification",
                "Bias detection",
                "Compliance checking",
                "Output validation",
            ],
            delegation_targets=[],
            allowed_tools=["read_file", "review_output", "flag_issue"],
            token_budget_daily=30000,
            max_steps=5,
            reports_to=None,  # Governance — reports to nobody
            description="Governance agent that reviews all outputs for quality, accuracy, and compliance.",
        )
        super().__init__(config, **kwargs)

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list:
        return []
