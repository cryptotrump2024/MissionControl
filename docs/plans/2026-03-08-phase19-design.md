# Phase 19 Design — Task Notifications + Activity Feed + Task Search

**Date:** 2026-03-08
**Status:** Approved

---

## Overview

Three independent tracks that make MissionControl more actionable and searchable.

- **Track A:** Task Completion Notifications — fire existing webhook on task status changes, configurable per-status
- **Track B:** Activity Feed — unified `/activity` page + Dashboard widget showing all system events in chronological order
- **Track C:** Task Title Search — `search` param on `GET /api/tasks`, search input on Tasks page, live API search in CommandPalette

---

## Track A — Task Completion Notifications

### Problem
Users have no way to know a task finished without watching the dashboard.

### Design

**Backend:**
- Extract `_fire_webhook` from `app/routers/alerts.py` into new `app/services/notifications.py`
- Add shared `fire_task_event(task)` function — reuses existing `webhook_url` AppSetting (Slack incoming webhooks are plain HTTP POST, so Slack works with no extra config)
- Add two new AppSetting keys:
  - `notify_task_events_enabled` — boolean string `"true"/"false"`, default `"false"`
  - `notify_task_events` — comma-separated statuses to notify on, default `"completed,failed"`
- In `routers/tasks.py` PATCH endpoint: after status change, call `notify_service.fire_task_event(task)` as fire-and-forget asyncio task if enabled and status matches configured list
- Payload: `{"event": "task.{status}", "source": "MissionControl", "task": {id, title, status, agent_id, cost, tokens_used}}`

**Frontend — Settings page:**
- New "Task Notifications" section below existing Webhook URL field
- Toggle: "Notify on task events" → `notify_task_events_enabled`
- Checkbox group: Completed / Failed / Cancelled → `notify_task_events`
- Save button saves all three settings together

### Files Changed
- `backend/app/services/notifications.py` (new)
- `backend/app/routers/alerts.py` — import `fire_webhook` from notifications
- `backend/app/routers/tasks.py` — call notify on status change
- `frontend/src/pages/Settings.tsx` — task notification section

---

## Track B — Activity Feed

### Problem
No single place shows "what just happened" — users must check Tasks, Alerts, and Agents separately.

### Design

**Backend — `GET /api/activity?limit=50&before=<iso>`:**
- New `app/routers/activity.py` — no new DB table
- Queries `tasks` + `alerts` tables, maps to typed `ActivityEvent` dicts, merges, sorts descending by timestamp
- Task events: type = `task.{status}` (completed, failed, queued, running, cancelled)
- Alert events: type = `alert.{severity}` (critical, warning, info)
- `before` ISO timestamp cursor for pagination (next page = oldest event timestamp from previous page)
- Response: `{"events": [...], "has_more": bool}`
- `ActivityEvent` shape: `{id, type, title, timestamp, agent_id, task_id, alert_id}`

**Frontend — `/activity` page:**
- New `src/pages/Activity.tsx`
- Sidebar nav item between Logs and Alerts (icon: `⚡`)
- Chronological list newest-first
- Each row: colored dot + event type label + title + agent chip + relative timestamp
- Color coding: green=task.completed, red=task.failed, blue=task.queued/running, amber=alert.*
- Live updates via WebSocket: subscribes to `task_updated` + `alert_created` events, prepends to top
- "Load more" button (cursor-based pagination)

**Frontend — Dashboard widget:**
- "Recent Activity" card in Dashboard bottom section
- Fetches last 5 events, static query (no WebSocket)
- Each row: dot + title + time
- "View all →" links to `/activity`

### Files Changed
- `backend/app/routers/activity.py` (new)
- `backend/app/main.py` — include activity router
- `frontend/src/api/client.ts` — `activityApi.list({limit, before})`
- `frontend/src/types/index.ts` — `ActivityEvent` type
- `frontend/src/pages/Activity.tsx` (new)
- `frontend/src/pages/Dashboard.tsx` — Recent Activity widget
- `frontend/src/components/Layout.tsx` — nav item

---

## Track C — Task Title Search

### Problem
Tasks page has no search — users must scroll. CommandPalette only searches TanStack cache, missing unloaded tasks.

### Design

**Backend:**
- Add `search: str | None = None` query param to `list_tasks` in `routers/tasks.py`
- `Task.title.ilike(f"%{search}%")` applied to both data query and count query

**Frontend — Tasks page:**
- Search `<input>` next to status filter dropdown
- `useState<string>` + 300ms debounce before updating query key
- Passes `search` to `tasksApi.list(...)`, resets to page 1 on new search
- Clear (×) button when input non-empty

**Frontend — CommandPalette:**
- When query ≥ 3 chars, fire `tasksApi.list({search: q, limit: 10})` in parallel with cache scan
- Deduplicate API results against cache hits by task ID
- Spinner on task section header while fetching
- 250ms debounce

### Files Changed
- `backend/app/routers/tasks.py` — add `search` param
- `frontend/src/pages/Tasks.tsx` — search input
- `frontend/src/components/CommandPalette.tsx` — live API search

---

## Summary

| Track | New Files | Modified Files |
|-------|-----------|----------------|
| A — Notifications | `services/notifications.py` | `routers/alerts.py`, `routers/tasks.py`, `Settings.tsx` |
| B — Activity Feed | `routers/activity.py`, `pages/Activity.tsx` | `main.py`, `client.ts`, `types/index.ts`, `Dashboard.tsx`, `Layout.tsx` |
| C — Task Search | — | `routers/tasks.py`, `pages/Tasks.tsx`, `CommandPalette.tsx` |

**Total:** 3 new files, 10 modified files. No new DB tables. No new migrations.
