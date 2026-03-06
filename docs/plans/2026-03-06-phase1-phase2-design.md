# Phase 1 Completion + Phase 2 End-to-End Agent Loop — Design

**Date:** 2026-03-06
**Status:** Approved

## Goal

Complete Phase 1 (make the app run-ready) and wire the full end-to-end agent loop so a task created in the UI is picked up by the CEO agent, executed via ReAct, delegated to specialists, and streamed live to the dashboard.

## Architecture

**Phase 1** closes three gaps: auto-generating the Alembic DB migration, starting background services (heartbeat + alerts) via APScheduler on startup, and pushing new tasks from the REST API into Redis Streams so agents can consume them.

**Phase 2** is just connecting the existing wires: the agent SDK's ReAct loop, Redis consumer groups, and WebSocket broadcasts are all implemented — they just aren't plumbed together through the task creation path.

## Tech Stack

FastAPI + APScheduler (AsyncIOScheduler) + Redis Streams + SQLAlchemy AsyncSession + Alembic

---

## Exact Code Changes

### 1. Initial Alembic Migration

**Command to run:**
```bash
cd backend && alembic revision --autogenerate -m "initial schema"
```

Creates `backend/alembic/versions/<hash>_initial_schema.py` with `upgrade()` and `downgrade()` for all 5 tables:
- `agents` (from `app.models.agent`)
- `tasks` (from `app.models.task`)
- `log_entries` (from `app.models.log_entry`)
- `cost_records` (from `app.models.cost_record`)
- `alerts` (from `app.models.alert`)

The Dockerfile already runs `alembic upgrade head` before starting uvicorn, so once this file exists the DB will be initialised automatically.

---

### 2. Shared Redis Client (`backend/app/services/redis_client.py`)

New file — provides a single Redis client the backend can use:

```python
import redis.asyncio as redis
from app.config import get_settings

_redis_client: redis.Redis | None = None

def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client
```

---

### 3. `backend/app/main.py` — wire APScheduler + Redis on startup

Replace the empty `startup_event()`:

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import async_session
from app.services.heartbeat import check_heartbeats
from app.services.alert_engine import check_alerts
from app.services.redis_client import get_redis

scheduler = AsyncIOScheduler()

async def _run_heartbeat():
    async with async_session() as db:
        await check_heartbeats(db, settings.heartbeat_timeout_seconds)

async def _run_alert_check():
    async with async_session() as db:
        await check_alerts(db)

@app.on_event("startup")
async def startup_event():
    logger.info("Mission Control starting up...")
    # Warm up Redis connection
    await get_redis().ping()
    # Start background schedulers
    scheduler.add_job(_run_heartbeat, "interval", seconds=settings.heartbeat_timeout_seconds // 4)
    scheduler.add_job(_run_alert_check, "interval", seconds=settings.alert_check_interval_seconds)
    scheduler.start()
    logger.info("Mission Control ready — background services running.")

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown(wait=False)
    logger.info("Mission Control shutting down.")
```

---

### 4. `backend/app/routers/tasks.py` — push to Redis on task create

After saving task to DB and broadcasting WebSocket, add Redis push:

```python
import json
from app.services.redis_client import get_redis

# At end of create_task(), after ws_manager.broadcast():
redis_client = get_redis()
stream_name = f"tasks:{task.delegated_to or 'ceo'}"
task_payload = {
    "id": str(task.id),
    "title": task.title,
    "description": task.description or "",
    "priority": task.priority,
    "input_data": json.dumps(task.input_data or {}),
    "agent_id": str(task.agent_id) if task.agent_id else "",
}
await redis_client.xadd(stream_name, {"task": json.dumps(task_payload)})
logger.info(f"Task '{task.title}' queued to stream '{stream_name}'")
```

The base agent reads from `tasks:{agent_type}` and expects `data.get("task")` to be a JSON string. This matches exactly.

---

## End-to-End Flow (after changes)

```
1. User opens dashboard, clicks "New Task"
   POST /api/tasks {title: "Research AI agent frameworks", description: "..."}

2. tasks.py router:
   - Saves Task to DB (status="queued")
   - Broadcasts task_created via WebSocket → dashboard updates
   - XADD tasks:ceo {"task": "{id, title, description, ...}"}

3. CEO agent (running via `make agents`):
   - XREADGROUP tasks:ceo → receives message
   - Calls mc.update_status("working") → agent shows "working" in dashboard
   - ReAct loop: LLM reasons about task
   - Calls delegate_task("researcher", "Find information about AI agent frameworks")
   - POST /api/tasks (subtask, delegated_to="researcher")
   - tasks.py pushes subtask to tasks:researcher stream

4. Researcher agent:
   - XREADGROUP tasks:researcher → receives subtask
   - Executes web_search tool, summarizes results
   - POST /api/tasks/{id} PATCH status="completed", output={...}
   - ws_manager broadcasts task_completed → Logs page updates live

5. CEO agent receives researcher output (via MCClient polling or callback):
   - Delegates to writer: POST /api/tasks (subtask for writer)
   - tasks.py pushes to tasks:writer

6. Writer agent:
   - Produces final draft
   - Updates task completed

7. CEO synthesizes final output:
   - PATCH /api/tasks/{root_task_id} status="completed", output="Final report..."
   - WebSocket broadcasts → dashboard shows completed task + cost

8. All along: logs stream in real-time, costs recorded, heartbeats maintained
```

---

## Files to Create/Modify

| File | Action | Change |
|------|--------|--------|
| `backend/alembic/versions/` | Create | Auto-generated migration via `alembic revision --autogenerate` |
| `backend/app/services/redis_client.py` | Create | Shared Redis client singleton |
| `backend/app/main.py` | Modify | Wire APScheduler, Redis ping on startup |
| `backend/app/routers/tasks.py` | Modify | Push to Redis stream on task create |

**No changes needed to:**
- Agent SDK (ReAct loop complete)
- All 5 agent implementations (complete)
- `agents/runner.py` (complete)
- `agents/registry.yaml` (complete)
- Frontend pages (all show real data from API)
- WebSocket system (complete)

---

## Out of Scope

- No new UI pages
- No new agent types
- No auth changes
- No schema changes to models
- No new npm packages

---

## Success Criteria

1. `docker-compose up` → DB tables created by Alembic, no errors
2. `make seed` → 5 agents visible in dashboard
3. `make agents` → agents register, show as "idle" in dashboard
4. Create task via UI → task appears in dashboard, CEO picks it up within 5s
5. Logs page → shows real-time log entries as agents execute
6. Task completes → cost record visible in Costs page
7. Background: heartbeat check marks agents offline if runner is stopped
