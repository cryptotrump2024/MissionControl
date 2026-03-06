from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse, AgentListResponse
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.post("/register", response_model=AgentResponse, status_code=201)
async def register_agent(agent_in: AgentCreate, db: AsyncSession = Depends(get_db)):
    """Register a new AI agent with Mission Control."""
    agent = Agent(
        name=agent_in.name,
        type=agent_in.type,
        status="idle",
        capabilities=agent_in.capabilities,
        model=agent_in.model,
        config=agent_in.config,
        tier=agent_in.tier,
        parent_agent_id=agent_in.parent_agent_id,
        delegation_targets=agent_in.delegation_targets,
        allowed_tools=agent_in.allowed_tools,
        model_preference=agent_in.model_preference,
        token_budget_daily=agent_in.token_budget_daily,
        description=agent_in.description,
        last_heartbeat=datetime.now(timezone.utc),
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    await ws_manager.broadcast("agent_registered", {
        "id": str(agent.id),
        "name": agent.name,
        "type": agent.type,
        "status": agent.status,
        "tier": agent.tier,
    })

    return agent


@router.get("", response_model=AgentListResponse)
async def list_agents(
    status: str | None = None,
    tier: int | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all registered agents with optional filtering."""
    query = select(Agent)
    count_query = select(func.count(Agent.id))

    if status:
        query = query.where(Agent.status == status)
        count_query = count_query.where(Agent.status == status)
    if tier is not None:
        query = query.where(Agent.tier == tier)
        count_query = count_query.where(Agent.tier == tier)

    query = query.offset(skip).limit(limit).order_by(Agent.tier, Agent.name)
    result = await db.execute(query)
    agents = result.scalars().all()

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    return AgentListResponse(agents=agents, total=total)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get full details for a single agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}/status", response_model=AgentResponse)
async def update_agent_status(
    agent_id: UUID,
    update: AgentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an agent's status and/or config."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)

    if "status" in update_data:
        await ws_manager.broadcast("agent_status_change", {
            "id": str(agent.id),
            "name": agent.name,
            "status": agent.status,
        })

    return agent


@router.post("/{agent_id}/heartbeat")
async def heartbeat(agent_id: UUID, db: AsyncSession = Depends(get_db)):
    """Receive a heartbeat ping from an agent."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.last_heartbeat = datetime.now(timezone.utc)
    if agent.status == "offline":
        agent.status = "idle"
        await ws_manager.broadcast("agent_status_change", {
            "id": str(agent.id),
            "name": agent.name,
            "status": "idle",
        })

    await db.commit()
    return {"status": "ok", "timestamp": agent.last_heartbeat.isoformat()}
