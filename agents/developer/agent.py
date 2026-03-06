"""Code Assistant Agent — Generates, reviews, and analyzes code."""

from agents.sdk.base_agent import BaseAgent, AgentConfig
from agents.developer.prompts import SYSTEM_PROMPT


class DeveloperAgent(BaseAgent):
    """
    The Code Assistant Agent handles software development tasks.
    Generates code, performs reviews, designs architectures, and debugs issues.
    Reports to the CEO Agent.
    """

    def __init__(self, **kwargs):
        config = AgentConfig(
            name="Code Assistant Agent",
            type="developer",
            tier=2,
            model="claude-sonnet-4-6",
            capabilities=[
                "Code generation",
                "Code review",
                "Bug fixing",
                "Architecture design",
                "Documentation",
            ],
            delegation_targets=[],
            allowed_tools=["write_code", "read_file", "analyze_data", "review_output"],
            token_budget_daily=75000,
            max_steps=15,
            reports_to="ceo",
            description="Full-stack developer agent for code generation, review, and architecture.",
        )
        super().__init__(config, **kwargs)

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list:
        return []
