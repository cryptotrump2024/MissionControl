# Phase 18 Design — Agent Metrics + Bulk Operations + Task Scheduling

**Date:** 2026-03-07
**Status:** Approved

---

## Overview

Three independent tracks that deepen MissionControl's observability and power-user capabilities.

- **Track A:** Agent performance metrics — Metrics tab on AgentDetail with success rate, 7-day volume chart, cost breakdown
- **Track B:** Bulk task operations — Checkbox multi-select in Tasks, bulk cancel/reassign with sticky action bar
- **Track C:** Task scheduling — `scheduled_at` field on tasks, APScheduler job advances scheduled tasks, datetime picker in TaskCreate

---

## Track A — Agent Performance Metrics

### Problem
AgentDetail has Overview and Logs tabs but no performance data. Users cannot see at a glance whether an agent is reliable, how costly it is, or whether task volume is trending up or down.

### Design

**Backend — `GET /api/agents/{id}/metrics`:**
- No new DB tables needed — queries existing `tasks` and `cost_records`
- Computes from DB in a single async function:
  - `total_tasks`, `completed`, `failed`, `cancelled`, `running`, `queued`
  - `success_rate`: `completed / (completed + failed)` × 100, guards division by zero
  - `avg_cost_usd`: average of `cost_records.cost_usd` for this agent
  - `total_cost_usd`: sum of `cost_records.cost_usd` for this agent
  - `daily_volume`: list of `{date, count}` for last 7 days (UTC dates, fills zeros for missing days)
- Returns 404 if agent not found
- Added to `backend/app/routers/agents.py` (new endpoint on existing router)

**Frontend — AgentDetail.tsx:**
- Tab switcher gains third option: `'overview' | 'logs' | 'metrics'`
- New `AgentMetricsTab` component:
  - 4 stat cards: Total Tasks, Success Rate (%), Avg Cost ($), Total Cost ($)
  - 7-day SVG bar chart: same approach as `CostSparkline` — no external library, pure SVG with `viewBox`
  - Status breakdown: horizontal segmented bar — green (completed) + red (failed) + gray (other), with legend
- Query: `useQuery(['agent-metrics', agentId], () => agentsApi.metrics(agentId), { refetchInterval: 30_000 })`
- `agentsApi.metrics(id)` added to `frontend/src/api/client.ts`

### Files Changed
- `backend/app/routers/agents.py` — new `GET /{agent_id}/metrics` endpoint
- `frontend/src/api/client.ts` — `agentsApi.metrics(id)`
- `frontend/src/pages/AgentDetail.tsx` — third tab + `AgentMetricsTab` component

---

## Track B — Bulk Task Operations

### Problem
Users managing many tasks must cancel or reassign them one by one. There is no multi-select or bulk action capability.

### Design

**Backend — `POST /api/tasks/bulk`:**
- Body: `{ action: "cancel" | "reassign", task_ids: list[UUID], agent_id?: UUID }`
- Validates: `action` must be in allowed set, `task_ids` must be 1–100 items, `agent_id` required for reassign
- Single DB transaction: fetches all tasks by IDs, applies action:
  - `cancel`: sets `status = "cancelled"` for tasks in `queued` or `running` state only; skips others
  - `reassign`: sets `agent_id` for all specified tasks regardless of status
- Returns: `{ updated: N, skipped: N }`
- Added to `backend/app/routers/tasks.py`

**Frontend — Tasks.tsx:**
- New `selected` state: `Set<string>` of task IDs
- Leftmost column: checkbox — header checkbox selects/deselects all currently visible tasks (`pagedTasks`)
- Sticky action bar (rendered above table, visible when `selected.size > 0`):
  - `"N selected"` count
  - `[Cancel Selected]` button — calls `tasksApi.bulk({ action: 'cancel', task_ids: [...selected] })`
  - `[Reassign ▾]` button — opens inline agent dropdown, on select calls `tasksApi.bulk({ action: 'reassign', task_ids: [...selected], agent_id })`
  - `[Clear]` button — clears selection
- On success: invalidate `['tasks']` query, clear selection, show toast
- Selection clears automatically when status filter or page changes

### Files Changed
- `backend/app/routers/tasks.py` — new `POST /bulk` endpoint
- `frontend/src/api/client.ts` — `tasksApi.bulk(...)`
- `frontend/src/pages/Tasks.tsx` — checkbox column, selected state, action bar

---

## Track C — Task Scheduling

### Problem
All tasks start immediately when created (`status = 'queued'`). There is no way to schedule a task to start at a future time — users must manually create tasks at the right moment.

### Design

**Backend:**
- Alembic migration 004: adds `scheduled_at TIMESTAMPTZ NULL` to `tasks` table
- `TaskCreate` Pydantic schema: add `scheduled_at: datetime | None = None`
- `create_task()` endpoint: stores `scheduled_at` on the Task object
- New APScheduler job `check_scheduled_tasks()` runs every 60s:
  - Finds tasks where `status = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW() AT TIME ZONE 'UTC'`
  - Sets `status = 'running'` and clears `scheduled_at` (task is now live)
  - Broadcasts `task_update` WebSocket event for each activated task
- Scheduler registered in `backend/app/main.py` alongside existing heartbeat/alerts jobs

**Frontend:**
- `TaskCreate.tsx`: optional "Schedule for later" section, collapsed by default
  - Toggle button reveals `<input type="datetime-local">`
  - Value converted to ISO string before sending to API
  - Min value = now (cannot schedule in the past)
- `Tasks.tsx`: scheduled tasks show a `🕐` badge next to status badge, `title` attribute shows formatted scheduled time
- `TaskDetail.tsx`: shows `Scheduled for: <datetime>` field if `scheduled_at` is set

### Files Changed
- `backend/alembic/versions/004_add_scheduled_at.py` — migration
- `backend/app/schemas/task.py` — `TaskCreate.scheduled_at`
- `backend/app/routers/tasks.py` — store `scheduled_at`, `POST /bulk` (Track B shares this file)
- `backend/app/main.py` — register `check_scheduled_tasks` APScheduler job
- `frontend/src/api/client.ts` — `TaskCreate` type gets `scheduled_at?: string`
- `frontend/src/pages/TaskCreate.tsx` — datetime picker
- `frontend/src/pages/Tasks.tsx` — 🕐 badge on scheduled tasks
- `frontend/src/pages/TaskDetail.tsx` — display `scheduled_at`

---

## Execution Strategy

All three tracks are independent:
- A only touches `agents.py` (backend) and `AgentDetail.tsx` (frontend)
- B only touches `tasks.py` (backend endpoint) and `Tasks.tsx` (frontend)
- C touches `tasks.py` (schema + scheduler) and `TaskCreate.tsx` / `Tasks.tsx` / `TaskDetail.tsx`

**Note:** Tracks B and C both modify `tasks.py` and `Tasks.tsx` — execute sequentially (B then C) to avoid conflicts.

**Deployment:**
1. Merge worktree → master
2. `railway up --service backend` (migrations run on startup)
3. `railway up --service frontend`
4. Verify: `GET /api/agents/{id}/metrics`, `POST /api/tasks/bulk`, scheduled task activation
