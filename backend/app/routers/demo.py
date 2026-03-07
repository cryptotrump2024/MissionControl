"""
Demo simulation engine.
POST /api/demo/start  -- launches background agent activity loop
POST /api/demo/stop   -- cancels it
GET  /api/demo/status -- { running: bool, tick: int }
"""
import asyncio
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Request
from app.database import async_session

router = APIRouter()


@router.get("/api/demo/status")
async def demo_status(request: Request):
    running = getattr(request.app.state, "demo_running", False)
    tick = getattr(request.app.state, "demo_tick", 0)
    return {"running": running, "tick": tick}


@router.post("/api/demo/start")
async def demo_start(request: Request):
    if getattr(request.app.state, "demo_running", False):
        return {"status": "already_running"}
    request.app.state.demo_running = True
    request.app.state.demo_tick = 0
    request.app.state.demo_task = asyncio.create_task(_demo_loop(request.app))
    return {"status": "started"}


@router.post("/api/demo/stop")
async def demo_stop(request: Request):
    task = getattr(request.app.state, "demo_task", None)
    if task:
        task.cancel()
    request.app.state.demo_running = False
    return {"status": "stopped"}


async def _demo_loop(app):
    """Runs indefinitely, simulating agent activity every 4 seconds."""
    from app.models.agent import Agent
    from app.models.task import Task
    from app.models.log_entry import LogEntry
    from app.models.cost_record import CostRecord
    from app.models.alert import Alert
    from sqlalchemy import select

    AGENT_DEFS = [
        {"name": "CEO Agent",       "type": "ceo",        "tier": 1},
        {"name": "Research Agent",  "type": "researcher", "tier": 2},
        {"name": "Writer Agent",    "type": "writer",     "tier": 2},
        {"name": "Developer Agent", "type": "developer",  "tier": 2},
        {"name": "Auditor Agent",   "type": "auditor",    "tier": 3},
    ]
    TASK_POOL = [
        "Analyze competitor landscape", "Draft Q4 report", "Review PR #142",
        "Research LLM pricing trends", "Write API documentation", "Debug auth flow",
        "Summarize meeting notes", "Generate test cases", "Audit cost records",
        "Plan sprint backlog", "Investigate latency spike", "Write blog post draft",
        "Optimize database queries", "Review security policies", "Benchmark model performance",
    ]
    LOG_MSGS = {
        "queued":    ["Task received, queuing for processing", "Added to work queue"],
        "running":   ["Starting task execution", "Fetching required context",
                      "Processing input data", "Running analysis", "Calling external API"],
        "completed": ["Task completed successfully", "Output validated and stored", "Results ready"],
        "failed":    ["Unexpected error encountered", "Timeout after 30s", "Context limit reached"],
    }

    try:
        while True:
            await asyncio.sleep(4)
            app.state.demo_tick = getattr(app.state, "demo_tick", 0) + 1
            tick = app.state.demo_tick

            async with async_session() as db:
                # 1. Ensure demo agents exist
                result = await db.execute(
                    select(Agent).where(Agent.type.in_(["ceo","researcher","writer","developer","auditor"]))
                )
                existing = result.scalars().all()
                agent_map = {a.type: a for a in existing}

                for adef in AGENT_DEFS:
                    if adef["type"] not in agent_map:
                        agent = Agent(
                            name=adef["name"],
                            type=adef["type"],
                            tier=adef["tier"],
                            status="idle",
                            model="moonshotai/kimi-k2",
                            model_preference="moonshotai/kimi-k2",
                            capabilities=[],
                            delegation_targets=[],
                            allowed_tools=[],
                        )
                        db.add(agent)
                        agent_map[adef["type"]] = agent
                await db.flush()

                agents_list = list(agent_map.values())

                # 2. Advance running tasks -> completed or failed
                running_result = await db.execute(
                    select(Task).where(Task.status == "running").limit(3)
                )
                running_tasks = running_result.scalars().all()
                for rtask in running_tasks:
                    new_status = "completed" if random.random() < 0.8 else "failed"
                    rtask.status = new_status
                    rtask.completed_at = datetime.now(timezone.utc)
                    if new_status == "failed":
                        rtask.error_message = random.choice([
                            "Timeout after 30s", "Context limit exceeded", "LLM API error"
                        ])
                    # Update agent stats
                    for a in agents_list:
                        if a.id == rtask.agent_id:
                            a.status = "idle"
                            a.total_tasks = (a.total_tasks or 0) + 1
                    # Log entry
                    db.add(LogEntry(
                        agent_id=rtask.agent_id,
                        task_id=rtask.id,
                        level="info" if new_status == "completed" else "error",
                        message=random.choice(LOG_MSGS[new_status]),
                    ))
                    # Cost record
                    tokens_in = random.randint(200, 2000)
                    tokens_out = random.randint(50, 500)
                    cost = round((tokens_in * 0.0000015) + (tokens_out * 0.000002), 6)
                    db.add(CostRecord(
                        agent_id=rtask.agent_id,
                        task_id=rtask.id,
                        model="moonshotai/kimi-k2",
                        input_tokens=tokens_in,
                        output_tokens=tokens_out,
                        cost_usd=cost,
                    ))

                # 3. Advance queued tasks -> running
                queued_result = await db.execute(
                    select(Task).where(Task.status == "queued").limit(2)
                )
                queued_tasks = queued_result.scalars().all()
                idle_agents = [a for a in agents_list if a.status == "idle"]
                for qtask in queued_tasks[:len(idle_agents)]:
                    assigned = random.choice(idle_agents)
                    qtask.status = "running"
                    qtask.agent_id = assigned.id
                    qtask.started_at = datetime.now(timezone.utc)
                    assigned.status = "working"
                    idle_agents.remove(assigned)
                    db.add(LogEntry(
                        agent_id=assigned.id,
                        task_id=qtask.id,
                        level="info",
                        message=random.choice(LOG_MSGS["running"]),
                    ))

                # 4. Create new task every other tick
                if tick % 2 == 0:
                    new_task = Task(
                        title=random.choice(TASK_POOL),
                        status="queued",
                        priority=random.randint(1, 5),
                        input_data={},
                    )
                    db.add(new_task)
                    await db.flush()
                    db.add(LogEntry(
                        task_id=new_task.id,
                        level="info",
                        message=random.choice(LOG_MSGS["queued"]),
                    ))

                # 5. Every 10 ticks: fire a random alert
                if tick % 10 == 0:
                    db.add(Alert(
                        type="demo_event",
                        severity=random.choice(["info", "warning", "critical"]),
                        message=random.choice([
                            "Agent memory usage above threshold",
                            "Task failure rate spike detected",
                            "Daily cost approaching budget limit",
                            "New agent registered in fleet",
                            "Redis stream lag detected",
                        ]),
                        acknowledged=False,
                    ))

                await db.commit()

    except asyncio.CancelledError:
        app.state.demo_running = False
