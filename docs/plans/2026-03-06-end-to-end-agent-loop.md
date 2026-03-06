# End-to-End Agent Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the missing pieces so a task created in the UI is picked up by agents from Redis, executed via ReAct, and streamed live to the dashboard.

**Architecture:** Four minimal changes close the gaps: generate the Alembic migration so the DB schema exists, create a shared Redis client the backend can use, start APScheduler in `main.py` to run heartbeat/alert checks on intervals, and push newly-created tasks into a Redis Stream so agents can consume them. Everything else (agent SDK, ReAct loop, WebSocket, frontend) is already complete.

**Tech Stack:** FastAPI, APScheduler (AsyncIOScheduler), Redis Streams (redis.asyncio), SQLAlchemy AsyncSession, Alembic

---

### Task 1: Generate the initial Alembic migration

**Files:**
- Create: `backend/alembic/versions/<hash>_initial_schema.py` (auto-generated)

**Context:** The DB schema lives in `backend/app/models/` (5 models). Alembic's `env.py` already imports them. The Dockerfile runs `alembic upgrade head` on every start—so once a migration file exists, tables are created automatically. Currently `alembic/versions/` is empty.

**Step 1: Run autogenerate inside the backend container context**

From the worktree root (`C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden`), with Docker Compose running (or just with the virtualenv active and Postgres reachable):

```bash
cd backend
alembic revision --autogenerate -m "initial schema"
```

If Docker isn't running, use the compose service directly:
```bash
docker-compose run --rm backend alembic revision --autogenerate -m "initial schema"
```

Expected output:
```
Generating /app/alembic/versions/xxxxxxxxxxxx_initial_schema.py ... done
```

**Step 2: Verify the migration file looks correct**

Open `backend/alembic/versions/<hash>_initial_schema.py`. The `upgrade()` function must contain `op.create_table(...)` calls for: `agents`, `tasks`, `log_entries`, `cost_records`, `alerts`. The `downgrade()` must `op.drop_table(...)` all five in reverse order.

If the file is empty or missing tables, the models may not be importable. Check that `backend/app/models/__init__.py` imports all five models.

**Step 3: Run upgrade to verify it works**

```bash
docker-compose run --rm backend alembic upgrade head
```

Expected: no errors, tables created in Postgres.

**Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: add initial Alembic migration - create all 5 DB tables

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Create the shared Redis client module

**Files:**
- Create: `backend/app/services/redis_client.py`

**Context:** `base_agent.py` uses `redis.from_url(redis_url, decode_responses=True)`. The backend needs the same client to push task messages into streams. We create a simple module-level singleton so routers can import `get_redis()` without passing it through every function signature. The Redis URL comes from `settings.redis_url` (already in `config.py`).

**Step 1: Create the file**

```python
# backend/app/services/redis_client.py
"""Shared async Redis client for backend services.

Usage:
    from app.services.redis_client import get_redis
    r = get_redis()
    await r.xadd("tasks:ceo", {"task": json_str})
"""
import redis.asyncio as redis

from app.config import get_settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Return a module-level Redis client (created on first call)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Close the Redis connection. Call on app shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
```

**Step 2: Verify syntax**

```bash
cd backend && python -c "from app.services.redis_client import get_redis; print('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/services/redis_client.py
git commit -m "feat: add shared async Redis client module

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Wire APScheduler + Redis in `main.py`

**Files:**
- Modify: `backend/app/main.py` (lines 57–67, the startup/shutdown events)

**Context:** `heartbeat.py` exports `check_heartbeats(db, timeout_seconds)`. `alert_engine.py` exports `check_alerts(db)`. Both need an `AsyncSession`. APScheduler's `AsyncIOScheduler` can run async jobs using the event loop. We wrap each check in a short-lived session created from the `async_session` factory in `database.py`.

**Current `main.py` startup (lines 57–67):**
```python
@app.on_event("startup")
async def startup_event():
    logger.info("Mission Control starting up...")
    # TODO: Run Alembic migrations
    # TODO: Start background services (heartbeat, cost aggregator, alerts)
    logger.info("Mission Control ready.")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Mission Control shutting down...")
```

**Step 1: Replace startup/shutdown with the full implementation**

Replace those 10 lines with:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import async_session
from app.services.heartbeat import check_heartbeats
from app.services.alert_engine import check_alerts
from app.services.redis_client import get_redis, close_redis

_scheduler = AsyncIOScheduler()


async def _heartbeat_job() -> None:
    async with async_session() as db:
        await check_heartbeats(db, settings.heartbeat_timeout_seconds)


async def _alert_job() -> None:
    async with async_session() as db:
        await check_alerts(db)


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Mission Control starting up...")
    # Verify Redis is reachable
    r = get_redis()
    await r.ping()
    logger.info("Redis connection OK")
    # Start background jobs
    _scheduler.add_job(_heartbeat_job, "interval", seconds=30, id="heartbeat")
    _scheduler.add_job(_alert_job, "interval", seconds=settings.alert_check_interval_seconds, id="alerts")
    _scheduler.start()
    logger.info("Background services started (heartbeat=30s, alerts=%ds)", settings.alert_check_interval_seconds)
    logger.info("Mission Control ready.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("Mission Control shutting down...")
    _scheduler.shutdown(wait=False)
    await close_redis()
```

Note: The imports must go at the **top of the file** alongside the existing imports, not inside the functions.

**Step 2: Verify the app starts without errors**

```bash
docker-compose up backend
```

Watch the logs. Expected lines:
```
Mission Control starting up...
Redis connection OK
Background services started (heartbeat=30s, alerts=60s)
Mission Control ready.
```

No `ImportError`, no `ConnectionRefusedError`.

**Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: wire APScheduler for heartbeat and alert background services

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Push new tasks into Redis Streams on task create

**Files:**
- Modify: `backend/app/routers/tasks.py` (the `create_task` function, after line 54)

**Context:** `base_agent.py` reads from stream `tasks:{agent_type}` (e.g. `tasks:ceo`). It calls `xreadgroup` and reads the message field `"task"`, which must be a JSON string of the task dict with keys: `id`, `title`, `description`, `input_data`, `priority`, `agent_id`.

When a task is created without `delegated_to` set, it goes to `tasks:ceo`. When CEO creates a subtask delegating to a researcher, it sets `delegated_to="researcher"`, so the subtask goes to `tasks:researcher`. This matches exactly how `base_agent.py` dispatches delegated tasks.

**Current end of `create_task()` (lines 48–56):**
```python
    await ws_manager.broadcast("task_created", {
        "id": str(task.id),
        "title": task.title,
        "status": task.status,
        "agent_id": str(task.agent_id) if task.agent_id else None,
        "priority": task.priority,
    })

    return task
```

**Step 1: Add imports at the top of `tasks.py`**

Add these two lines after the existing imports:

```python
import json
import logging

from app.services.redis_client import get_redis
```

(If `logging` is already imported, skip it. Add `logger = logging.getLogger(__name__)` if not present.)

**Step 2: Push to Redis after the WebSocket broadcast**

Replace the `return task` at the end of `create_task()` with:

```python
    # Push to Redis Stream so the appropriate agent picks it up
    stream_key = f"tasks:{task.delegated_to or 'ceo'}"
    task_payload = json.dumps({
        "id": str(task.id),
        "title": task.title,
        "description": task.description or "",
        "priority": task.priority,
        "input_data": task.input_data or {},
        "agent_id": str(task.agent_id) if task.agent_id else None,
        "delegated_by": task.delegated_by,
        "delegated_to": task.delegated_to,
        "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
    })
    redis_client = get_redis()
    await redis_client.xadd(stream_key, {"task": task_payload})
    logger.info("Task '%s' queued on stream '%s'", task.title, stream_key)

    return task
```

**Step 3: Verify task creation hits Redis**

Start the stack and create a task via the API:

```bash
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Test task", "description": "Hello from curl"}'
```

Then inspect the Redis stream:

```bash
docker-compose exec redis redis-cli XLEN tasks:ceo
```

Expected: `(integer) 1`

Read the message:
```bash
docker-compose exec redis redis-cli XRANGE tasks:ceo - +
```

Expected: one entry with `task` field containing the JSON.

**Step 4: Commit**

```bash
git add backend/app/routers/tasks.py
git commit -m "feat: push new tasks to Redis Stream for agent consumption

Task creation now pushes to tasks:{delegated_to|ceo} so agents
can pick up work immediately via xreadgroup.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end smoke test

**Context:** Verify the full loop works: task created → CEO picks it up → logs stream in → task completes.

**Prerequisites:**
- `.env` must contain valid `ANTHROPIC_API_KEY`
- Docker Compose running: `make dev`
- Seed data loaded: `make seed`

**Step 1: Start the full stack**

```bash
make dev        # starts postgres, redis, backend, frontend
make seed       # creates demo agents and tasks in DB
```

Open http://localhost:5173 — dashboard should show 5 agents.

**Step 2: Start the agent runner**

In a second terminal:

```bash
make agents
```

Expected output:
```
[CEO Agent] Registered with Mission Control (id=...)
[CEO Agent] Listening for tasks on stream 'tasks:ceo'
[Researcher Agent] Registered...
...
```

Dashboard should show all 5 agents as `idle`.

**Step 3: Create a real task**

In the dashboard UI → Tasks page → New Task:
- Title: `Research the top 3 AI agent frameworks in 2026`
- Description: `Find LangChain, CrewAI, and any new frameworks. Write a brief comparison.`

Or via curl:
```bash
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Research top 3 AI agent frameworks in 2026",
    "description": "Find LangChain, CrewAI, and any emerging frameworks. Write a brief comparison."
  }'
```

**Step 4: Watch it run**

- Tasks page: task status changes `queued → running`
- Logs page: real-time entries appear from CEO agent
- CEO delegates → subtasks appear in Tasks list
- Agent status: CEO shows `working`, then `idle`
- Task completes: output appears in task detail view
- Costs page: new cost record for the run

**Step 5: Commit (if any fixes were needed during smoke test)**

```bash
git add -A
git commit -m "fix: smoke test corrections

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Final commit — bump version and update memory

**Step 1: Update MEMORY.md**

Update `C:\Users\Atlas_SSD\.claude\projects\...\memory\MEMORY.md` to reflect:
- Phase 1 complete
- End-to-end loop wired
- GitHub push still pending (needs `gh auth refresh --scopes repo`)

**Step 2: Commit all remaining changes**

```bash
git add -A
git commit -m "chore: Phase 1 complete - full end-to-end agent loop wired

- Initial Alembic migration created
- APScheduler wires heartbeat + alert background services
- Redis client module added
- Task create pushes to Redis Stream for agent pickup

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Quick Reference — Stream Key Conventions

| Agent type | Redis stream key |
|------------|-----------------|
| CEO | `tasks:ceo` |
| Researcher | `tasks:researcher` |
| Writer | `tasks:writer` |
| Developer | `tasks:developer` |
| Auditor | `tasks:auditor` |

Consumer group name: `agent:{type}` (e.g. `agent:ceo`)
Consumer name: `{type}:{agent_id}` (set by `base_agent.py`)

## APScheduler Package

`apscheduler` is already in `backend/requirements.txt`. If missing:
```bash
pip install apscheduler==3.10.4
echo "apscheduler==3.10.4" >> backend/requirements.txt
```
