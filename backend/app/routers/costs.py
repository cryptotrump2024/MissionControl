from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.cost_record import CostRecord
from app.schemas.cost_record import CostRecordCreate, CostRecordResponse, CostSummary
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.post("", response_model=CostRecordResponse, status_code=201)
async def create_cost_record(
    cost_in: CostRecordCreate, db: AsyncSession = Depends(get_db)
):
    """Record a cost entry for an agent/task."""
    record = CostRecord(
        agent_id=cost_in.agent_id,
        task_id=cost_in.task_id,
        model=cost_in.model,
        input_tokens=cost_in.input_tokens,
        output_tokens=cost_in.output_tokens,
        cost_usd=cost_in.cost_usd,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    await ws_manager.broadcast("cost_update", {
        "agent_id": str(record.agent_id) if record.agent_id else None,
        "model": record.model,
        "cost_usd": record.cost_usd,
        "input_tokens": record.input_tokens,
        "output_tokens": record.output_tokens,
    })

    return record


@router.get("", response_model=list[CostRecordResponse])
async def list_cost_records(
    agent_id: UUID | None = None,
    task_id: UUID | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List individual cost records."""
    query = select(CostRecord).order_by(CostRecord.timestamp.desc())
    if agent_id:
        query = query.where(CostRecord.agent_id == agent_id)
    if task_id:
        query = query.where(CostRecord.task_id == task_id)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/today")
async def today_cost(db: AsyncSession = Depends(get_db)):
    """Get today's total cost and breakdown."""
    from datetime import date
    from sqlalchemy import cast, Date

    today = date.today()

    result = await db.execute(
        select(
            func.sum(CostRecord.cost_usd).label('total'),
            func.sum(CostRecord.input_tokens).label('input_tokens'),
            func.sum(CostRecord.output_tokens).label('output_tokens'),
            func.count(CostRecord.id).label('records'),
        )
        .where(cast(CostRecord.timestamp, Date) == today)
    )
    row = result.one()

    return {
        "date": str(today),
        "total_usd": round(float(row.total or 0), 6),
        "input_tokens": int(row.input_tokens or 0),
        "output_tokens": int(row.output_tokens or 0),
        "record_count": int(row.records or 0),
        "budget_remaining_usd": max(0.0, round(1.0 - float(row.total or 0), 6)),
    }


@router.get("/summary", response_model=CostSummary)
async def cost_summary(
    period: str = Query(default="today", pattern="^(today|week|month|all)$"),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated cost summary for a time period."""
    now = datetime.now(timezone.utc)
    if period == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)
    else:
        since = datetime.min.replace(tzinfo=timezone.utc)

    # Total cost and tokens
    query = select(
        func.coalesce(func.sum(CostRecord.cost_usd), 0),
        func.coalesce(func.sum(CostRecord.input_tokens), 0),
        func.coalesce(func.sum(CostRecord.output_tokens), 0),
    ).where(CostRecord.timestamp >= since)

    result = await db.execute(query)
    row = result.one()
    total_cost, total_input, total_output = float(row[0]), int(row[1]), int(row[2])

    # Cost by agent
    agent_query = (
        select(CostRecord.agent_id, func.sum(CostRecord.cost_usd))
        .where(CostRecord.timestamp >= since)
        .group_by(CostRecord.agent_id)
    )
    agent_result = await db.execute(agent_query)
    by_agent = {str(row[0]): float(row[1]) for row in agent_result.all() if row[0]}

    # Cost by model
    model_query = (
        select(CostRecord.model, func.sum(CostRecord.cost_usd))
        .where(CostRecord.timestamp >= since)
        .group_by(CostRecord.model)
    )
    model_result = await db.execute(model_query)
    by_model = {row[0]: float(row[1]) for row in model_result.all()}

    return CostSummary(
        total_cost=total_cost,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        by_agent=by_agent,
        by_model=by_model,
        period=period,
    )


@router.get("/daily")
async def daily_costs(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get daily cost breakdown for charting."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            func.date(CostRecord.timestamp).label("date"),
            func.sum(CostRecord.cost_usd).label("cost"),
            func.sum(CostRecord.input_tokens).label("input_tokens"),
            func.sum(CostRecord.output_tokens).label("output_tokens"),
        )
        .where(CostRecord.timestamp >= since)
        .group_by(func.date(CostRecord.timestamp))
        .order_by(func.date(CostRecord.timestamp))
    )

    result = await db.execute(query)
    return [
        {
            "date": str(row.date),
            "cost": float(row.cost),
            "input_tokens": int(row.input_tokens),
            "output_tokens": int(row.output_tokens),
        }
        for row in result.all()
    ]


@router.get("/by-agent")
async def costs_by_agent(db: AsyncSession = Depends(get_db)):
    """Cost breakdown grouped by agent, sorted by total cost descending."""
    from app.models.agent import Agent

    result = await db.execute(
        select(
            CostRecord.agent_id,
            Agent.name.label("agent_name"),
            func.sum(CostRecord.cost_usd).label("total_usd"),
            func.count(CostRecord.id).label("record_count"),
            func.sum(CostRecord.input_tokens).label("input_tokens"),
            func.sum(CostRecord.output_tokens).label("output_tokens"),
        )
        .join(Agent, Agent.id == CostRecord.agent_id, isouter=True)
        .where(CostRecord.agent_id.isnot(None))
        .group_by(CostRecord.agent_id, Agent.name)
        .order_by(func.sum(CostRecord.cost_usd).desc())
    )
    rows = result.all()

    grand_total = sum(r.total_usd for r in rows) or 1.0  # avoid division by zero

    return [
        {
            "agent_id": str(r.agent_id),
            "agent_name": r.agent_name or "Unknown",
            "total_usd": round(float(r.total_usd), 6),
            "record_count": r.record_count,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "pct_of_total": round((float(r.total_usd) / grand_total) * 100, 1),
        }
        for r in rows
    ]
