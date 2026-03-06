"""Content Writer Agent — Creates written content including articles, docs, and copy."""

from agents.sdk.base_agent import BaseAgent, AgentConfig
from agents.writer.prompts import SYSTEM_PROMPT


class WriterAgent(BaseAgent):
    """
    The Content Writer Agent handles all written content creation.
    Produces blog posts, documentation, copy, and reports.
    Reports to the CEO Agent.
    """

    def __init__(self, **kwargs):
        config = AgentConfig(
            name="Content Writer Agent",
            type="writer",
            tier=2,
            model="claude-sonnet-4-6",
            capabilities=[
                "Content writing",
                "Copywriting",
                "Blog posts",
                "Technical writing",
                "Editing",
            ],
            delegation_targets=[],
            allowed_tools=["write_draft", "read_file", "web_search"],
            token_budget_daily=50000,
            max_steps=10,
            reports_to="ceo",
            description="Creates high-quality written content including articles, docs, and marketing copy.",
        )
        super().__init__(config, **kwargs)

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list:
        return []
