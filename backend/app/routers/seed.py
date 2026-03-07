"""
Seed endpoint for creating demo data.
Only enabled in non-production environments (or when SEED_ENABLED=true).
"""
import random
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.agent import Agent
from app.models.task import Task
from app.models.log_entry import LogEntry
from datetime import datetime, timezone, timedelta

router = APIRouter()


@router.post("/api/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """Create demo agents, tasks, and logs for testing."""
    # Create demo agents
    agent_defs = [
        {"name": "CEO Agent", "type": "ceo", "tier": 1, "capabilities": ["planning", "delegation"]},
        {"name": "Research Agent", "type": "researcher", "tier": 2, "capabilities": ["search", "analysis"]},
        {"name": "Writer Agent", "type": "writer", "tier": 2, "capabilities": ["writing", "summarization"]},
        {"name": "Developer Agent", "type": "developer", "tier": 2, "capabilities": ["coding", "testing"]},
        {"name": "Auditor Agent", "type": "auditor", "tier": 3, "capabilities": ["verification", "compliance"]},
    ]

    agents = []
    for adef in agent_defs:
        agent = Agent(
            name=adef["name"],
            type=adef["type"],
            tier=adef["tier"],
            capabilities=adef["capabilities"],
            status=random.choice(["idle", "working", "idle"]),
            model="moonshotai/kimi-k2",
            model_preference="moonshotai/kimi-k2",
            total_tasks=random.randint(0, 50),
            total_cost=round(random.uniform(0, 5.0), 4),
        )
        db.add(agent)
        agents.append(agent)

    await db.flush()  # Get IDs

    # Create demo tasks
    task_titles = [
        "Research competitor pricing strategies",
        "Write blog post about AI trends",
        "Analyze Q4 sales data",
        "Implement authentication module",
        "Review code quality for API v2",
        "Create marketing campaign plan",
        "Debug production issue #1247",
        "Summarize research papers on LLMs",
    ]

    statuses = ["completed", "completed", "completed", "failed", "queued", "running"]
    tasks = []
    for i, title in enumerate(task_titles):
        status = random.choice(statuses)
        created = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48))
        task = Task(
            title=title,
            description=f"Demo task: {title.lower()}",
            agent_id=random.choice(agents).id if random.random() > 0.3 else None,
            status=status,
            priority=random.randint(1, 10),
            cost=round(random.uniform(0, 0.5), 6) if status == "completed" else 0.0,
            tokens_used=random.randint(100, 5000) if status == "completed" else 0,
            created_at=created,
            started_at=created + timedelta(seconds=random.randint(1, 30)) if status != "queued" else None,
            completed_at=created + timedelta(minutes=random.randint(1, 60)) if status in ("completed", "failed") else None,
        )
        db.add(task)
        tasks.append(task)

    await db.flush()

    # Create demo logs for the first few tasks
    log_messages = [
        ("info", "Task started"),
        ("info", "Fetching relevant data..."),
        ("debug", "Processing 247 items"),
        ("info", "Analysis complete"),
        ("warn", "Rate limit approaching"),
        ("info", "Task completed successfully"),
    ]

    for task in tasks[:4]:
        for level, message in log_messages[:random.randint(2, 6)]:
            log = LogEntry(
                task_id=task.id,
                agent_id=task.agent_id,
                level=level,
                message=message,
                timestamp=datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 60)),
            )
            db.add(log)

    await db.commit()

    return {
        "created": {
            "agents": len(agents),
            "tasks": len(tasks),
            "logs": len(log_messages) * 4,
        },
        "agent_ids": [str(a.id) for a in agents],
    }
