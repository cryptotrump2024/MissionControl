"""
Agent Runner — Starts all registered agents as concurrent async tasks.

Usage:
    python -m agents.runner                    # Start all agents
    python -m agents.runner --agents ceo researcher  # Start specific agents
"""

import asyncio
import argparse
import logging
import signal
import sys
from pathlib import Path

import yaml

# Ensure the project root is in the Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import built-in tools to register them
import agents.sdk.builtin_tools  # noqa: F401 — registers tools on import

from agents.ceo.agent import CEOAgent
from agents.researcher.agent import ResearcherAgent
from agents.writer.agent import WriterAgent
from agents.developer.agent import DeveloperAgent
from agents.auditor.agent import AuditorAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
)
logger = logging.getLogger("agent-runner")

# Agent type → class mapping
AGENT_CLASSES = {
    "ceo": CEOAgent,
    "researcher": ResearcherAgent,
    "writer": WriterAgent,
    "developer": DeveloperAgent,
    "auditor": AuditorAgent,
}


async def run_agents(
    agent_types: list[str] | None = None,
    mc_url: str = "http://localhost:8000",
    redis_url: str = "redis://localhost:6379/0",
):
    """Start all (or selected) agents concurrently."""
    if agent_types is None:
        agent_types = list(AGENT_CLASSES.keys())

    agents = []
    tasks = []

    for agent_type in agent_types:
        if agent_type not in AGENT_CLASSES:
            logger.warning(f"Unknown agent type: '{agent_type}', skipping")
            continue

        agent_cls = AGENT_CLASSES[agent_type]
        agent = agent_cls(mc_url=mc_url, redis_url=redis_url)
        agents.append(agent)
        tasks.append(asyncio.create_task(agent.run()))
        logger.info(f"Started agent: {agent.config.name} ({agent_type})")

    logger.info(f"All {len(agents)} agents running. Press Ctrl+C to stop.")

    # Handle graceful shutdown
    shutdown_event = asyncio.Event()

    def handle_shutdown():
        logger.info("Shutdown signal received...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_shutdown)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    try:
        # Wait until shutdown is requested
        await shutdown_event.wait()
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("Shutting down agents...")
        for agent in agents:
            await agent.shutdown()
        for task in tasks:
            task.cancel()
        logger.info("All agents stopped.")


def main():
    parser = argparse.ArgumentParser(description="Mission Control Agent Runner")
    parser.add_argument(
        "--agents",
        nargs="*",
        default=None,
        help=f"Agent types to start. Available: {list(AGENT_CLASSES.keys())}. Default: all",
    )
    parser.add_argument(
        "--mc-url",
        default="http://localhost:8000",
        help="Mission Control backend URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--redis-url",
        default="redis://localhost:6379/0",
        help="Redis URL (default: redis://localhost:6379/0)",
    )
    args = parser.parse_args()

    asyncio.run(run_agents(
        agent_types=args.agents,
        mc_url=args.mc_url,
        redis_url=args.redis_url,
    ))


if __name__ == "__main__":
    main()
