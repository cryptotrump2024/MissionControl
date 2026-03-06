"""Heartbeat Monitor — Marks agents as offline if no heartbeat received within threshold."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.alert import Alert
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


async def check_heartbeats(db: AsyncSession, timeout_seconds: int = 120):
    """Check all agents and mark as offline if heartbeat is stale."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds)

    # Find agents that are not offline but have stale heartbeats
    query = select(Agent).where(
        Agent.status != "offline",
        Agent.last_heartbeat < cutoff,
    )
    result = await db.execute(query)
    stale_agents = result.scalars().all()

    for agent in stale_agents:
        old_status = agent.status
        agent.status = "offline"

        # Create alert
        alert = Alert(
            type="agent_offline",
            severity="warning",
            message=f"Agent '{agent.name}' went offline (no heartbeat for {timeout_seconds}s)",
            agent_id=agent.id,
        )
        db.add(alert)

        logger.warning(f"Agent '{agent.name}' marked offline (was {old_status})")

        await ws_manager.broadcast("agent_status_change", {
            "id": str(agent.id),
            "name": agent.name,
            "status": "offline",
            "previous_status": old_status,
        })

        await ws_manager.broadcast("alert_triggered", {
            "type": "agent_offline",
            "severity": "warning",
            "agent": agent.name,
        })

    if stale_agents:
        await db.commit()
        logger.info(f"Heartbeat check: {len(stale_agents)} agents marked offline")
