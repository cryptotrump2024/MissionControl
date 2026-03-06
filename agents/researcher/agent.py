"""Research Agent — Gathers information, analyzes data, and produces research reports."""

from agents.sdk.base_agent import BaseAgent, AgentConfig
from agents.researcher.prompts import SYSTEM_PROMPT


class ResearcherAgent(BaseAgent):
    """
    The Research Agent handles all information gathering and analysis tasks.
    Uses web search, file reading, and data analysis tools.
    Reports to the CEO Agent.
    """

    def __init__(self, **kwargs):
        config = AgentConfig(
            name="Research Agent",
            type="researcher",
            tier=2,
            model="moonshotai/kimi-k2",  # OpenRouter: Moonshot Kimi K2
            capabilities=[
                "Web search",
                "Data gathering",
                "Summarization",
                "Fact checking",
                "Competitive analysis",
            ],
            delegation_targets=[],
            allowed_tools=["web_search", "read_file", "summarize", "analyze_data"],
            token_budget_daily=50000,
            max_steps=15,
            reports_to="ceo",
            description="Gathers information and produces structured research reports.",
        )
        super().__init__(config, **kwargs)

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list:
        return []  # Uses built-in tools
