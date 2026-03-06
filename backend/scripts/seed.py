"""
Seed Script — Populates Mission Control with demo data for development.
Run: python -m scripts.seed
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session, engine
from app.models import Agent, Task, LogEntry, CostRecord, Alert
from app.database import Base


DEMO_AGENTS = [
    {
        "name": "CEO Agent",
        "type": "ceo",
        "tier": 1,
        "status": "idle",
        "model": "claude-sonnet-4-6",
        "capabilities": ["Strategic planning", "Task decomposition", "Delegation"],
        "delegation_targets": ["researcher", "writer", "developer"],
        "allowed_tools": ["delegate_task", "review_output", "plan_tasks"],
        "token_budget_daily": 100000,
        "description": "Master orchestrator that decomposes and delegates complex tasks.",
    },
    {
        "name": "Research Agent",
        "type": "researcher",
        "tier": 2,
        "status": "idle",
        "model": "claude-haiku-4-5",
        "capabilities": ["Web search", "Data gathering", "Summarization"],
        "delegation_targets": [],
        "allowed_tools": ["web_search", "read_file", "summarize", "analyze_data"],
        "token_budget_daily": 50000,
        "description": "Gathers information and produces structured research reports.",
    },
    {
        "name": "Content Writer Agent",
        "type": "writer",
        "tier": 2,
        "status": "working",
        "model": "claude-sonnet-4-6",
        "capabilities": ["Content writing", "Copywriting", "Technical writing"],
        "delegation_targets": [],
        "allowed_tools": ["write_draft", "read_file", "web_search"],
        "token_budget_daily": 50000,
        "description": "Creates high-quality written content.",
    },
    {
        "name": "Code Assistant Agent",
        "type": "developer",
        "tier": 2,
        "status": "idle",
        "model": "claude-sonnet-4-6",
        "capabilities": ["Code generation", "Code review", "Architecture design"],
        "delegation_targets": [],
        "allowed_tools": ["write_code", "read_file", "analyze_data", "review_output"],
        "token_budget_daily": 75000,
        "description": "Full-stack developer for code generation and review.",
    },
    {
        "name": "Auditor Agent",
        "type": "auditor",
        "tier": 0,
        "status": "idle",
        "model": "claude-sonnet-4-6",
        "capabilities": ["Quality review", "Accuracy verification", "Compliance checking"],
        "delegation_targets": [],
        "allowed_tools": ["read_file", "review_output", "flag_issue"],
        "token_budget_daily": 30000,
        "description": "Governance agent that reviews all outputs for quality and compliance.",
    },
]

TASK_TITLES = [
    "Research competitor pricing strategies",
    "Write blog post about AI agent orchestration",
    "Review and refactor authentication module",
    "Analyze Q1 marketing campaign performance",
    "Generate API documentation for v2 endpoints",
    "Create landing page copy for new feature",
    "Audit security compliance report",
    "Design database schema for user analytics",
]

LOG_MESSAGES = [
    "Agent started and ready for tasks",
    "Received task assignment",
    "Using tool: web_search",
    "Using tool: write_draft",
    "Task completed successfully",
    "Processing research results",
    "Generating content outline",
    "Reviewing output quality",
]


async def seed():
    """Seed the database with demo data."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Check if already seeded
        from sqlalchemy import select, func
        count = await db.execute(select(func.count(Agent.id)))
        if count.scalar() > 0:
            print("Database already has data. Skipping seed.")
            return

        print("Seeding database...")
        now = datetime.now(timezone.utc)

        # Create agents
        agents = []
        for agent_data in DEMO_AGENTS:
            agent = Agent(
                **agent_data,
                config={},
                model_preference=agent_data["model"],
                last_heartbeat=now - timedelta(seconds=random.randint(0, 60)),
                total_tasks=random.randint(5, 50),
                total_cost=random.uniform(0.01, 2.0),
            )
            db.add(agent)
            agents.append(agent)
        await db.flush()

        # Set CEO as parent of Tier 2 agents
        ceo = agents[0]
        for agent in agents[1:4]:
            agent.parent_agent_id = ceo.id
        await db.flush()

        # Create tasks
        statuses = ["completed", "completed", "completed", "running", "queued", "failed"]
        for i, title in enumerate(TASK_TITLES):
            agent = random.choice(agents)
            status = random.choice(statuses)
            task = Task(
                agent_id=agent.id,
                title=title,
                description=f"Demo task for testing Mission Control functionality.",
                status=status,
                priority=random.randint(1, 8),
                input_data={"source": "seed_script"},
                output_data={"result": "Demo output"} if status == "completed" else None,
                error_message="Simulated error for testing" if status == "failed" else None,
                cost=random.uniform(0.001, 0.05) if status == "completed" else 0,
                tokens_used=random.randint(500, 5000) if status == "completed" else 0,
                created_at=now - timedelta(hours=random.randint(1, 48)),
                started_at=(now - timedelta(hours=random.randint(0, 24))) if status != "queued" else None,
                completed_at=now - timedelta(minutes=random.randint(1, 120)) if status in ("completed", "failed") else None,
            )
            db.add(task)
        await db.flush()

        # Create log entries
        for _ in range(100):
            agent = random.choice(agents)
            log = LogEntry(
                agent_id=agent.id,
                level=random.choice(["info", "info", "info", "debug", "warn", "error"]),
                message=random.choice(LOG_MESSAGES),
                timestamp=now - timedelta(minutes=random.randint(0, 1440)),
            )
            db.add(log)

        # Create cost records
        models = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-sonnet-4-6"]
        for _ in range(50):
            agent = random.choice(agents)
            model = random.choice(models)
            input_tokens = random.randint(100, 5000)
            output_tokens = random.randint(50, 2000)
            cost = CostRecord(
                agent_id=agent.id,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=(input_tokens * 3 + output_tokens * 15) / 1_000_000,
                timestamp=now - timedelta(hours=random.randint(0, 72)),
            )
            db.add(cost)

        # Create a few alerts
        alert_types = [
            ("agent_offline", "warning", "Agent 'Research Agent' went offline"),
            ("cost_threshold", "critical", "Daily cost ($5.23) exceeds threshold ($5.00)"),
        ]
        for alert_type, severity, message in alert_types:
            alert = Alert(
                type=alert_type,
                severity=severity,
                message=message,
                created_at=now - timedelta(hours=random.randint(1, 24)),
            )
            db.add(alert)

        await db.commit()
        print(f"Seeded: {len(DEMO_AGENTS)} agents, {len(TASK_TITLES)} tasks, 100 logs, 50 cost records, {len(alert_types)} alerts")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(seed())
