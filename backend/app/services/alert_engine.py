"""Alert Engine — Checks configurable thresholds and generates alerts."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cost_record import CostRecord
from app.models.task import Task
from app.models.alert import Alert
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

# Default thresholds (configurable in Phase 2)
DAILY_COST_THRESHOLD = 10.0  # USD
ERROR_RATE_THRESHOLD = 0.20  # 20%


async def check_alerts(db: AsyncSession):
    """Run all alert checks."""
    await _check_daily_cost(db)
    await _check_error_rate(db)


async def _check_daily_cost(db: AsyncSession):
    """Alert if daily cost exceeds threshold."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    query = select(func.coalesce(func.sum(CostRecord.cost_usd), 0)).where(
        CostRecord.timestamp >= today_start
    )
    result = await db.execute(query)
    daily_cost = float(result.scalar())

    if daily_cost > DAILY_COST_THRESHOLD:
        # Check if we already alerted today
        existing = await db.execute(
            select(Alert).where(
                Alert.type == "cost_threshold",
                Alert.created_at >= today_start,
            )
        )
        if not existing.scalar_one_or_none():
            alert = Alert(
                type="cost_threshold",
                severity="critical",
                message=f"Daily cost (${daily_cost:.4f}) exceeds threshold (${DAILY_COST_THRESHOLD:.2f})",
            )
            db.add(alert)
            await db.commit()

            await ws_manager.broadcast("alert_triggered", {
                "type": "cost_threshold",
                "severity": "critical",
                "daily_cost": daily_cost,
                "threshold": DAILY_COST_THRESHOLD,
            })

            logger.warning(f"Cost alert: ${daily_cost:.4f} exceeds ${DAILY_COST_THRESHOLD:.2f}")


async def _check_error_rate(db: AsyncSession):
    """Alert if task error rate exceeds threshold."""
    last_hour = datetime.now(timezone.utc) - timedelta(hours=1)

    total_query = select(func.count(Task.id)).where(Task.created_at >= last_hour)
    failed_query = select(func.count(Task.id)).where(
        Task.created_at >= last_hour,
        Task.status == "failed",
    )

    total_result = await db.execute(total_query)
    total = total_result.scalar()

    if total < 5:  # Not enough data
        return

    failed_result = await db.execute(failed_query)
    failed = failed_result.scalar()

    error_rate = failed / total if total > 0 else 0

    if error_rate > ERROR_RATE_THRESHOLD:
        alert = Alert(
            type="error_rate",
            severity="warning",
            message=f"Task error rate ({error_rate:.1%}) exceeds threshold ({ERROR_RATE_THRESHOLD:.0%}) in the last hour",
        )
        db.add(alert)
        await db.commit()

        await ws_manager.broadcast("alert_triggered", {
            "type": "error_rate",
            "severity": "warning",
            "error_rate": error_rate,
            "threshold": ERROR_RATE_THRESHOLD,
        })
