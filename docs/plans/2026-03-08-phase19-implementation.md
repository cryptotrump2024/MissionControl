# Phase 19 Implementation Plan — Notifications + Activity Feed + Task Search

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add task completion webhook notifications, a unified Activity Feed page, and backend task title search (wiring the existing Tasks page UI to the API).

**Architecture:** Three independent tracks: (A) extract `_fire_webhook` into a shared `notifications.py` service and fire it on task status changes; (B) a new `/api/activity` endpoint that merges tasks+alerts rows and a new `/activity` frontend page; (C) `search` query param on `GET /api/tasks` wired to the existing Tasks search input and CommandPalette.

**Tech Stack:** FastAPI + SQLAlchemy async, React 18 + TanStack Query, Zustand WebSocket store, Tailwind CSS (mc-* tokens), no new DB tables or migrations.

---

## Task 1: Extract Notification Service

**Files:**
- Create: `backend/app/services/notifications.py`
- Modify: `backend/app/routers/alerts.py`

### Step 1: Create `notifications.py`

```python
# backend/app/services/notifications.py
"""
Shared webhook notification service.
Extracted from alerts.py so tasks can also fire notifications.
"""
import asyncio
import logging
import httpx

logger = logging.getLogger(__name__)

# Strong references to prevent GC of fire-and-forget tasks
_background_tasks: set[asyncio.Task] = set()


async def _deliver(url: str, payload: dict) -> None:
    """Inner delivery — separate function so _fire can be a thin wrapper."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(url, json=payload)


async def fire_webhook(payload: dict) -> None:
    """
    Fetch webhook_url from AppSettings and POST payload.
    Fire-and-forget: logs failure, never raises.
    """
    try:
        from app.database import async_session
        from app.models.setting import AppSetting
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(
                select(AppSetting).where(AppSetting.key == "webhook_url")
            )
            row = result.scalar_one_or_none()
            url = row.value if row else ""
        if not url:
            return
        await _deliver(url, {"source": "MissionControl", **payload})
    except Exception as exc:
        logger.warning("Webhook delivery failed: %s", exc)


def schedule_webhook(payload: dict) -> None:
    """
    Schedule fire_webhook as a background asyncio task.
    Call this from sync or async contexts — keeps a strong reference.
    """
    task = asyncio.create_task(fire_webhook(payload))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def fire_task_event(task_obj) -> None:
    """
    Fire webhook for a task status change if notifications are enabled
    and this status is in the configured event list.
    Reads notify_task_events_enabled and notify_task_events from AppSettings.
    """
    try:
        from app.database import async_session
        from app.models.setting import AppSetting
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(
                select(AppSetting).where(
                    AppSetting.key.in_(["notify_task_events_enabled", "notify_task_events", "webhook_url"])
                )
            )
            rows = {r.key: r.value for r in result.scalars().all()}

        enabled = rows.get("notify_task_events_enabled", "false").lower() == "true"
        if not enabled:
            return
        url = rows.get("webhook_url", "")
        if not url:
            return
        allowed = [s.strip() for s in rows.get("notify_task_events", "completed,failed").split(",")]
        if task_obj.status not in allowed:
            return

        payload = {
            "source": "MissionControl",
            "event": f"task.{task_obj.status}",
            "task": {
                "id": str(task_obj.id),
                "title": task_obj.title,
                "status": task_obj.status,
                "agent_id": str(task_obj.agent_id) if task_obj.agent_id else None,
                "cost": float(task_obj.cost or 0),
                "tokens_used": task_obj.tokens_used or 0,
            },
        }
        await _deliver(url, payload)
    except Exception as exc:
        logger.warning("Task notification delivery failed: %s", exc)
```

### Step 2: Update `alerts.py` to import from notifications

Replace the current `_fire_webhook` function and `_background_tasks` set in `alerts.py` with imports:

```python
# At the top of alerts.py, replace the _background_tasks set and _fire_webhook function with:
from app.services.notifications import schedule_webhook, _background_tasks
```

And replace the `create_alert` webhook call:
```python
# OLD (in create_alert):
_task = asyncio.create_task(_fire_webhook({...}))
_background_tasks.add(_task)
_task.add_done_callback(_background_tasks.discard)

# NEW:
schedule_webhook({
    "event": "alert",
    "alert_id": str(alert.id),
    "type": alert.type,
    "severity": alert.severity,
    "message": alert.message,
})
```

Also remove the now-unused `import asyncio` and `import httpx` if they're no longer needed in alerts.py (check first — `asyncio` may still be used elsewhere in the file).

### Step 3: Verify no import errors

```bash
cd C:\Z_projects\MissionControl
docker compose exec backend python -c "from app.services.notifications import fire_task_event; print('OK')"
```
Expected: `OK`

### Step 4: Commit

```bash
git add backend/app/services/notifications.py backend/app/routers/alerts.py
git commit -m "feat: extract shared notification service from alerts"
```

---

## Task 2: Wire Task Notifications in tasks.py

**Files:**
- Modify: `backend/app/routers/tasks.py`

### Step 1: Add notification call to `update_task`

In `routers/tasks.py`, add import at top:
```python
from app.services.notifications import fire_task_event
```

In `update_task`, after `await db.refresh(task)` and before the WebSocket broadcast, add:
```python
    # Fire task event notification (fire-and-forget)
    if "status" in update_data and update_data["status"] in ("completed", "failed", "cancelled"):
        asyncio.create_task(fire_task_event(task))
```

Also ensure `import asyncio` is at the top of `tasks.py` (add if missing).

### Step 2: Smoke test via API

Start backend locally OR use Railway:
```bash
# Create a task then update it to completed:
curl -s -X POST https://backend-production-a6b7.up.railway.app/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Notify test","priority":5}' | python -c "import sys,json; print(json.load(sys.stdin)['id'])"

# Then PATCH status to completed (use task ID from above):
curl -s -X PATCH https://backend-production-a6b7.up.railway.app/api/tasks/<ID> \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```
Expected: task returns with `"status": "completed"`. Notification would only fire if `notify_task_events_enabled` = "true" in settings (not yet set, so no actual webhook call yet — this is fine).

### Step 3: Commit

```bash
git add backend/app/routers/tasks.py
git commit -m "feat: fire task event notification on status changes"
```

---

## Task 3: Settings UI — Task Notifications

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`

### Step 1: Add state for notification settings

In `Settings.tsx`, add these state variables near the top of the component (after existing state):
```tsx
const [notifyEnabled, setNotifyEnabled] = useState(false);
const [notifyEvents, setNotifyEvents] = useState<string[]>(['completed', 'failed']);
```

### Step 2: Populate from settings on load

In the existing `useEffect` that populates settings, add:
```tsx
if (settings.notify_task_events_enabled !== undefined) {
  setNotifyEnabled(settings.notify_task_events_enabled === 'true');
}
if (settings.notify_task_events !== undefined) {
  setNotifyEvents(settings.notify_task_events.split(',').map((s: string) => s.trim()).filter(Boolean));
}
```

### Step 3: Add save mutations

```tsx
const notifyEnabledMutation = useMutation({
  mutationFn: (val: boolean) => settingsApi.update('notify_task_events_enabled', val ? 'true' : 'false'),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
});

const notifyEventsMutation = useMutation({
  mutationFn: (events: string[]) => settingsApi.update('notify_task_events', events.join(',')),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
});

function handleNotifyEventsChange(status: string, checked: boolean) {
  const updated = checked
    ? [...notifyEvents, status]
    : notifyEvents.filter((s) => s !== status);
  setNotifyEvents(updated);
  notifyEventsMutation.mutate(updated);
}
```

### Step 4: Add UI section

Add the following JSX block after the existing Webhook URL section in the Settings card:

```tsx
{/* Task Notifications */}
<div className="border-t border-mc-border-primary pt-4 mt-4">
  <div className="flex items-center justify-between mb-3">
    <div>
      <p className="text-xs font-medium text-mc-text-primary">Task Notifications</p>
      <p className="text-xs text-mc-text-muted mt-0.5">
        Fire webhook when tasks reach these statuses
      </p>
    </div>
    <button
      onClick={() => {
        const next = !notifyEnabled;
        setNotifyEnabled(next);
        notifyEnabledMutation.mutate(next);
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        notifyEnabled ? 'bg-mc-accent-blue' : 'bg-mc-bg-tertiary border border-mc-border'
      }`}
      aria-label="Toggle task notifications"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          notifyEnabled ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
  {notifyEnabled && (
    <div className="flex gap-4">
      {(['completed', 'failed', 'cancelled'] as const).map((status) => (
        <label key={status} className="flex items-center gap-1.5 text-xs text-mc-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={notifyEvents.includes(status)}
            onChange={(e) => handleNotifyEventsChange(status, e.target.checked)}
            className="rounded"
          />
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </label>
      ))}
    </div>
  )}
</div>
```

### Step 5: Commit

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: task notification settings UI (toggle + per-status checkboxes)"
```

---

## Task 4: Activity Feed Backend

**Files:**
- Create: `backend/app/routers/activity.py`
- Modify: `backend/app/main.py`

### Step 1: Create `activity.py` router

```python
# backend/app/routers/activity.py
"""
Activity Feed endpoint.
GET /api/activity?limit=50&before=<iso_timestamp>

Merges recent tasks and alerts into a unified chronological event stream.
No new DB table — queries existing tables.
"""
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import Alert
from app.models.task import Task

router = APIRouter()


def _task_to_event(task: Task) -> dict[str, Any]:
    return {
        "id": f"task-{task.id}",
        "type": f"task.{task.status}",
        "title": task.title,
        "timestamp": (task.completed_at or task.started_at or task.created_at).isoformat(),
        "agent_id": str(task.agent_id) if task.agent_id else None,
        "task_id": str(task.id),
        "alert_id": None,
    }


def _alert_to_event(alert: Alert) -> dict[str, Any]:
    return {
        "id": f"alert-{alert.id}",
        "type": f"alert.{alert.severity}",
        "title": alert.message,
        "timestamp": alert.created_at.isoformat(),
        "agent_id": str(alert.agent_id) if alert.agent_id else None,
        "task_id": str(alert.task_id) if alert.task_id else None,
        "alert_id": str(alert.id),
    }


@router.get("/api/activity")
async def list_activity(
    limit: int = Query(default=50, ge=1, le=200),
    before: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a merged, time-sorted list of task and alert events.
    `before` is an ISO timestamp for cursor-based pagination.
    """
    before_dt: datetime | None = None
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
        except ValueError:
            before_dt = None

    # Fetch tasks — use completed_at when available, else started_at, else created_at
    task_query = select(Task).order_by(Task.created_at.desc()).limit(limit)
    if before_dt:
        task_query = task_query.where(Task.created_at < before_dt)
    task_result = await db.execute(task_query)
    tasks = task_result.scalars().all()

    # Fetch alerts
    alert_query = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if before_dt:
        alert_query = alert_query.where(Alert.created_at < before_dt)
    alert_result = await db.execute(alert_query)
    alerts = alert_result.scalars().all()

    # Merge and sort descending
    events = [_task_to_event(t) for t in tasks] + [_alert_to_event(a) for a in alerts]
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    page = events[:limit]

    return {
        "events": page,
        "has_more": len(page) == limit,
    }
```

### Step 2: Register router in `main.py`

Find where other routers are included (e.g. `app.include_router(tasks.router, ...)`). Add:
```python
from app.routers import activity
# ...
app.include_router(activity.router, tags=["activity"])
```

### Step 3: Test the endpoint

```bash
curl -s https://backend-production-a6b7.up.railway.app/api/activity?limit=5
```
Expected: `{"events": [...], "has_more": false}` (or true if many records)

### Step 4: Commit

```bash
git add backend/app/routers/activity.py backend/app/main.py
git commit -m "feat: add /api/activity endpoint merging task and alert events"
```

---

## Task 5: Activity Feed Frontend Page

**Files:**
- Create: `frontend/src/pages/Activity.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/Layout.tsx`

### Step 1: Add `ActivityEvent` type to `types/index.ts`

Append to `frontend/src/types/index.ts`:
```ts
// ── Activity Types ──────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: string;           // e.g. "task.completed", "alert.critical"
  title: string;
  timestamp: string;
  agent_id: string | null;
  task_id: string | null;
  alert_id: string | null;
}

export interface ActivityResponse {
  events: ActivityEvent[];
  has_more: boolean;
}
```

### Step 2: Add `activityApi` to `client.ts`

Add after the `alertsApi` section:
```ts
import type { ..., ActivityEvent, ActivityResponse } from '@/types';
// (add ActivityEvent and ActivityResponse to the existing import)

// ── Activity ─────────────────────────────────────────────────────────

export const activityApi = {
  list: (params?: { limit?: number; before?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.before) sp.set('before', params.before);
    const qs = sp.toString();
    return request<ActivityResponse>(`/api/activity${qs ? `?${qs}` : ''}`);
  },
};
```

### Step 3: Create `Activity.tsx`

```tsx
/**
 * ActivityPage — Unified chronological event stream.
 * Route: /activity
 *
 * Features:
 *  - Merged task + alert events, newest first
 *  - Color-coded dots by event type
 *  - Live WebSocket updates (prepend new events)
 *  - Cursor-based "Load more" pagination
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activityApi } from '@/api/client';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ActivityEvent } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────

function dotColor(type: string): string {
  if (type.startsWith('task.completed'))  return 'bg-mc-accent-green';
  if (type.startsWith('task.failed'))     return 'bg-mc-accent-red';
  if (type.startsWith('task.cancelled'))  return 'bg-mc-text-muted';
  if (type.startsWith('task.running'))    return 'bg-mc-accent-blue';
  if (type.startsWith('task.queued'))     return 'bg-mc-accent-blue/50';
  if (type.startsWith('alert.critical'))  return 'bg-mc-accent-red';
  if (type.startsWith('alert.warning'))   return 'bg-mc-accent-amber';
  if (type.startsWith('alert.'))          return 'bg-mc-accent-amber/60';
  return 'bg-mc-text-muted';
}

function typeLabel(type: string): string {
  const [category, status] = type.split('.');
  if (!status) return type;
  return `${category} ${status}`;
}

function formatRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function EventLink({ event }: { event: ActivityEvent }) {
  if (event.task_id && event.type.startsWith('task.')) {
    return <Link to={`/tasks/${event.task_id}`} className="hover:underline truncate">{event.title}</Link>;
  }
  if (event.alert_id) {
    return <Link to="/alerts" className="hover:underline truncate">{event.title}</Link>;
  }
  return <span className="truncate">{event.title}</span>;
}

// ── Component ──────────────────────────────────────────────────────

export default function Activity() {
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);
  const [before, setBefore] = useState<string | undefined>();
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const { subscribe } = useWebSocket();

  const { data, isFetching } = useQuery({
    queryKey: ['activity', before],
    queryFn: () => activityApi.list({ limit: 50, before }),
    staleTime: 0,
  });

  // Append new page results (avoid duplicates by id)
  useEffect(() => {
    if (!data) return;
    setAllEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const fresh = data.events.filter((e) => !ids.has(e.id));
      return [...prev, ...fresh];
    });
  }, [data]);

  // Subscribe to live WS events
  useEffect(() => {
    const unsub1 = subscribe('task_updated', (d) => {
      const ev: ActivityEvent = {
        id: `task-${d.id}-${Date.now()}`,
        type: `task.${d.status}`,
        title: (d.title as string) ?? String(d.id),
        timestamp: new Date().toISOString(),
        agent_id: (d.agent_id as string) ?? null,
        task_id: d.id as string,
        alert_id: null,
      };
      setLiveEvents((prev) => [ev, ...prev].slice(0, 50));
    });
    const unsub2 = subscribe('task_completed', (d) => {
      const ev: ActivityEvent = {
        id: `task-${d.id}-${Date.now()}`,
        type: 'task.completed',
        title: (d.title as string) ?? String(d.id),
        timestamp: new Date().toISOString(),
        agent_id: (d.agent_id as string) ?? null,
        task_id: d.id as string,
        alert_id: null,
      };
      setLiveEvents((prev) => [ev, ...prev].slice(0, 50));
    });
    const unsub3 = subscribe('alert_created', (d) => {
      const ev: ActivityEvent = {
        id: `alert-${d.id}-${Date.now()}`,
        type: `alert.${d.severity ?? 'info'}`,
        title: (d.message as string) ?? String(d.id),
        timestamp: new Date().toISOString(),
        agent_id: null,
        task_id: null,
        alert_id: d.id as string,
      };
      setLiveEvents((prev) => [ev, ...prev].slice(0, 50));
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [subscribe]);

  const combined = [...liveEvents, ...allEvents];
  // Deduplicate by id
  const seen = new Set<string>();
  const displayed = combined.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const hasMore = data?.has_more ?? false;
  const oldest = allEvents[allEvents.length - 1]?.timestamp;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Activity Feed</h2>
        <span className="text-xs text-mc-text-muted">{displayed.length} events</span>
      </div>

      <div className="space-y-0.5">
        {displayed.length === 0 && !isFetching && (
          <p className="text-mc-text-muted text-sm text-center py-12">No activity yet.</p>
        )}
        {displayed.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 py-2.5 px-3 rounded hover:bg-mc-bg-hover transition-colors"
          >
            <div className="mt-1.5 flex-shrink-0">
              <span className={`block w-2 h-2 rounded-full ${dotColor(event.type)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-mc-text-muted font-mono bg-mc-bg-tertiary px-1.5 py-0.5 rounded flex-shrink-0">
                  {typeLabel(event.type)}
                </span>
                <span className="text-sm text-mc-text-primary truncate">
                  <EventLink event={event} />
                </span>
              </div>
              {event.agent_id && (
                <p className="text-[10px] text-mc-text-muted mt-0.5">
                  <Link to={`/agents/${event.agent_id}`} className="hover:underline">
                    agent:{event.agent_id.slice(0, 8)}
                  </Link>
                </p>
              )}
            </div>
            <span
              className="text-[10px] text-mc-text-muted flex-shrink-0"
              title={event.timestamp}
            >
              {formatRel(event.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={() => setBefore(oldest)}
            disabled={isFetching}
            className="mc-btn-secondary text-xs"
          >
            {isFetching ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Note on `useWebSocket`:** Check `frontend/src/hooks/useWebSocket.ts` — if `subscribe` is not exported, use the pattern from `Logs.tsx` instead (the WebSocket subscription hook may have a different API). Adapt as needed to match existing patterns.

### Step 4: Add route in `main.tsx`

```tsx
import Activity from '@/pages/Activity';
// Inside <Routes>:
<Route path="/activity" element={<Activity />} />
```

### Step 5: Add nav item in `Layout.tsx`

In the `navItems` array, add between `/logs` and `/costs`:
```ts
{ path: '/activity', label: 'Activity', icon: '⚡' },
```

### Step 6: Build check

```bash
cd C:\Z_projects\MissionControl\frontend && npm run build
```
Expected: no errors.

### Step 7: Commit

```bash
git add frontend/src/pages/Activity.tsx frontend/src/api/client.ts frontend/src/types/index.ts frontend/src/main.tsx frontend/src/components/Layout.tsx
git commit -m "feat: Activity Feed page with live WebSocket updates and pagination"
```

---

## Task 6: Dashboard Recent Activity Widget

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

### Step 1: Import activityApi

In `Dashboard.tsx`, add `activityApi` to the imports from `@/api/client`.

### Step 2: Add query

Inside the `Dashboard` component, add:
```tsx
const { data: activityData } = useQuery({
  queryKey: ['activity-dashboard'],
  queryFn: () => activityApi.list({ limit: 5 }),
  refetchInterval: 30_000,
});
const recentEvents = activityData?.events ?? [];
```

### Step 3: Add widget

The Dashboard already has an "Activity Feed" card showing WebSocket events. Add a new "Recent Activity" card below the existing bottom grid. Find the closing `</div>` of the main `grid grid-cols-1 md:grid-cols-2 gap-6` section and insert before it:

```tsx
{/* DB-backed Recent Activity */}
<div className="mc-card">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-mc-text-secondary">Recent Activity</h3>
    <a href="/activity" className="text-xs text-mc-accent-blue hover:underline">View all →</a>
  </div>
  <div className="space-y-2">
    {recentEvents.length === 0 ? (
      <p className="text-xs text-mc-text-muted">No recent activity.</p>
    ) : (
      recentEvents.map((event) => {
        const dot =
          event.type.startsWith('task.completed') ? 'bg-mc-accent-green' :
          event.type.startsWith('task.failed')    ? 'bg-mc-accent-red' :
          event.type.startsWith('alert.')         ? 'bg-mc-accent-amber' :
          'bg-mc-accent-blue';
        const rel = (() => {
          const diff = Date.now() - new Date(event.timestamp).getTime();
          const s = Math.floor(diff / 1000);
          if (s < 60) return `${s}s ago`;
          const m = Math.floor(s / 60);
          if (m < 60) return `${m}m ago`;
          return `${Math.floor(m / 60)}h ago`;
        })();
        return (
          <div key={event.id} className="flex items-center gap-2 py-1">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            <span className="text-xs text-mc-text-secondary truncate flex-1">{event.title}</span>
            <span className="text-[10px] text-mc-text-muted flex-shrink-0">{rel}</span>
          </div>
        );
      })
    )}
  </div>
</div>
```

### Step 4: Commit

```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat: add Recent Activity widget on Dashboard from /api/activity"
```

---

## Task 7: Task Title Search — Backend + Frontend Wire-up + CommandPalette

**Files:**
- Modify: `backend/app/routers/tasks.py`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Tasks.tsx`
- Modify: `frontend/src/components/CommandPalette.tsx`

### Step 1: Add `search` param to backend `list_tasks`

In `routers/tasks.py`, in the `list_tasks` function signature, add `search` after `parent_task_id`:
```python
search: str | None = None,
```

Then add to the query filters (with the other `if` blocks):
```python
if search:
    query = query.where(Task.title.ilike(f"%{search}%"))
    count_query = count_query.where(Task.title.ilike(f"%{search}%"))
```

### Step 2: Update `tasksApi.list` in `client.ts`

The existing `tasksApi.list` only accepts `status` and `agent_id`. Update to also accept `search` and `limit`:
```ts
list: (params?: { status?: string; agent_id?: string; search?: string; limit?: number; skip?: number }) => {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.skip !== undefined) searchParams.set('skip', String(params.skip));
  const qs = searchParams.toString();
  return request<TaskListResponse>(`/api/tasks${qs ? `?${qs}` : ''}`);
},
```

### Step 3: Wire `search` to the Tasks page API call

In `Tasks.tsx`, the `useQuery` currently is:
```tsx
queryKey: ['tasks', filterStatus, filterAgent, page],
queryFn: () => tasksApi.list({ status: filterStatus, agent_id: filterAgent }),
```

Update to:
```tsx
queryKey: ['tasks', filterStatus, filterAgent, search, page],
queryFn: () => tasksApi.list({ status: filterStatus, agent_id: filterAgent, search: search || undefined }),
```

**Remove the `useMemo` client-side filter** since the API now handles it:
```tsx
// REMOVE this useMemo block:
const tasks = useMemo(() => {
  if (!search.trim()) return allTasks;
  const q = search.toLowerCase();
  return allTasks.filter((t: Task) => t.title.toLowerCase().includes(q));
}, [allTasks, search]);

// REPLACE with:
const tasks = allTasks;
```

(The client-side filter is redundant once the backend does it.)

### Step 4: Add debounced search to CommandPalette

In `CommandPalette.tsx`, add live API search for tasks when query is 3+ characters.

Add imports at top:
```tsx
import { useEffect, useRef, useState, useMemo } from 'react'; // useRef already there
import { tasksApi } from '@/api/client';
import type { Task } from '@/types';
```

Add state for API results inside the component:
```tsx
const [apiTasks, setApiTasks] = useState<PaletteItem[]>([]);
const [searching, setSearching] = useState(false);
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add effect for live search:
```tsx
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  if (query.length < 3) {
    setApiTasks([]);
    setSearching(false);
    return;
  }
  setSearching(true);
  debounceRef.current = setTimeout(async () => {
    try {
      const result = await tasksApi.list({ search: query, limit: 10 });
      setApiTasks(
        result.tasks.map((t: Task) => ({
          id: `api-task-${t.id}`,
          label: t.title,
          sub: t.status,
          icon: '✓',
          route: `/tasks/${t.id}`,
        }))
      );
    } catch {
      setApiTasks([]);
    } finally {
      setSearching(false);
    }
  }, 250);
  return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
}, [query]);
```

Update the `items` useMemo to merge API results (deduplicated):
```tsx
const items: PaletteItem[] = useMemo(() => {
  // ... existing logic that builds agentItems + taskItems from cache ...
  const cacheIds = new Set([...agentItems, ...taskItems].map((i) => i.id.replace('api-task-', 'task-')));
  // API tasks deduplicated against cache
  const freshTasks = apiTasks.filter((i) => !cacheIds.has(i.id.replace('api-task-', 'task-')));
  const all = [...STATIC_PAGES, ...agentItems, ...taskItems, ...freshTasks];
  if (!query.trim()) return STATIC_PAGES;
  const q = query.toLowerCase();
  return all.filter(
    (i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)
  );
}, [query, agentData, taskData, apiTasks]);
```

Add spinner indicator in the palette input area (next to the clear button):
```tsx
{searching && (
  <span className="text-mc-text-muted text-xs animate-pulse">⋯</span>
)}
```

### Step 5: Build and verify

```bash
cd C:\Z_projects\MissionControl\frontend && npm run build
```
Expected: no TypeScript errors.

Test backend search:
```bash
curl -s "https://backend-production-a6b7.up.railway.app/api/tasks?search=test"
```
Expected: `{"tasks": [...], "total": N}` filtered to tasks with "test" in title.

### Step 6: Commit

```bash
git add backend/app/routers/tasks.py frontend/src/api/client.ts frontend/src/pages/Tasks.tsx frontend/src/components/CommandPalette.tsx
git commit -m "feat: task title search via API (backend + Tasks page + CommandPalette live search)"
```

---

## Task 8: Finishing

Run the finishing-a-development-branch skill to build, verify, and merge to master.

```bash
cd C:\Z_projects\MissionControl\frontend && npm run build
```
Expected: successful build, no errors.

Then deploy to Railway (backend + frontend serviceInstanceDeploy).

Verify:
- `GET /api/activity` returns events
- `GET /api/tasks?search=test` filters by title
- Settings page shows Task Notifications section
- `/activity` page renders in browser
- Dashboard shows Recent Activity widget
