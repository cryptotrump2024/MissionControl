# Phase 17 Implementation Plan — Mobile Layout + Configurable Settings + Task Templates

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make MissionControl usable on phones (responsive layout), configurable for production (editable budget + webhook alerts), and ergonomic for power users (task templates).

**Architecture:** Three independent tracks — Track A touches only frontend layout/tables, Track B adds a new `app_settings` DB table + backend settings router + wires to costs/alerts, Track C adds a new `task_templates` DB table + backend router + Templates page + TaskCreate integration. Tracks can run in parallel with one subagent each.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), React 18 + TanStack Query + Tailwind CSS (frontend), httpx for webhook delivery (already in requirements.txt)

---

## Track A — Mobile-Responsive Layout

### Task A1: Responsive sidebar drawer in Layout.tsx

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Read the current Layout.tsx**
```
Read frontend/src/components/Layout.tsx
```
Understand the current sidebar structure before editing.

**Step 2: Replace Layout.tsx with responsive version**

Key changes:
- Import `useState`, `useEffect` from react; `useLocation` from react-router-dom (already imported)
- Add `sidebarOpen` state, default `false`
- Add hamburger `<button>` in top nav bar (visible only `md:hidden`)
- Make sidebar a conditional drawer on mobile: `fixed inset-y-0 left-0 z-40 w-60 transform transition-transform duration-200` with `translate-x-0` when open, `-translate-x-full` when closed. On `md+` it's always visible (use `md:relative md:translate-x-0`)
- Add backdrop: `fixed inset-0 bg-black/50 z-30 md:hidden` visible when `sidebarOpen`, closes on click
- `useEffect` on `location.pathname` to close sidebar on nav

Exact replacement for the outer Layout structure (adapt to actual current code):

```tsx
import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
// ... existing imports ...

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-mc-bg-primary overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-60 flex-shrink-0 flex flex-col
          bg-mc-bg-secondary border-r border-mc-border
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
        `}
      >
        {/* ... existing sidebar content unchanged ... */}
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar with hamburger */}
        <header className="h-12 flex items-center gap-3 px-4 border-b border-mc-border bg-mc-bg-secondary md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-mc-text-secondary hover:text-mc-text-primary p-1"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/>
              <rect y="9" width="20" height="2" rx="1"/>
              <rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-mc-text-primary">Mission Control</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {/* ... existing ToastContainer, ShortcutsOverlay, CommandPalette, Outlet ... */}
        </main>
      </div>
    </div>
  );
}
```

**Step 3: Verify no TypeScript errors**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing ones unrelated to Layout)

**Step 4: Commit**
```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat(mobile): responsive sidebar drawer with hamburger menu"
```

---

### Task A2: Responsive grid in Dashboard.tsx

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Find the metric cards grid**

Search for `grid-cols-4` in Dashboard.tsx.

**Step 2: Change grid columns**

Replace:
```tsx
className="grid grid-cols-4 gap-4"
```
With:
```tsx
className="grid grid-cols-2 sm:grid-cols-4 gap-4"
```

Also check for any other fixed multi-column grids on this page and make them responsive.

**Step 3: Commit**
```bash
git add frontend/src/pages/Dashboard.tsx
git commit -m "feat(mobile): responsive 2-col metric grid on Dashboard"
```

---

### Task A3: Responsive tables — Tasks.tsx

**Files:**
- Modify: `frontend/src/pages/Tasks.tsx`

**Step 1: Wrap table in overflow container**

Find the `<table` or `<div` containing the tasks table. Wrap it:
```tsx
<div className="overflow-x-auto">
  <table className="w-full ...">
```

**Step 2: Hide non-critical columns on mobile**

In the `<th>` header row and `<td>` data rows, add `hidden sm:table-cell` to secondary columns. Keep visible: title/status always. Hide on mobile: "Created At", "Priority" (number is redundant with badge color).

Header example:
```tsx
<th className="hidden sm:table-cell text-xs ...">Created At</th>
<th className="hidden sm:table-cell text-xs ...">Priority</th>
```
Data rows:
```tsx
<td className="hidden sm:table-cell ...">...</td>
```

**Step 3: Truncate long text**

Agent name and task title cells:
```tsx
<td className="max-w-[180px] truncate ...">
```

**Step 4: Commit**
```bash
git add frontend/src/pages/Tasks.tsx
git commit -m "feat(mobile): responsive Tasks table, hide secondary cols on sm"
```

---

### Task A4: Responsive tables — Logs.tsx and Agents.tsx

**Files:**
- Modify: `frontend/src/pages/Logs.tsx`
- Modify: `frontend/src/pages/Agents.tsx`

**Step 1: Logs.tsx — wrap + hide columns**

Same pattern as Task A3:
- Wrap table in `overflow-x-auto` div
- Hide `hidden sm:table-cell` on: "Agent", "Task ID" columns
- Keep visible: timestamp, level, message

**Step 2: Agents.tsx — wrap + hide columns**

- Wrap table in `overflow-x-auto` div
- Hide on mobile: "Created At", search count if present
- Keep visible: name, status badge, type

**Step 3: Commit**
```bash
git add frontend/src/pages/Logs.tsx frontend/src/pages/Agents.tsx
git commit -m "feat(mobile): responsive Logs and Agents tables"
```

---

## Track B — Configurable Settings

### Task B1: AppSetting SQLAlchemy model

**Files:**
- Create: `backend/app/models/setting.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model**

```python
# backend/app/models/setting.py
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

**Step 2: Register in __init__.py**

Add to `backend/app/models/__init__.py`:
```python
from app.models.setting import AppSetting
```
Add `"AppSetting"` to `__all__`.

**Step 3: Commit**
```bash
git add backend/app/models/setting.py backend/app/models/__init__.py
git commit -m "feat(settings): AppSetting SQLAlchemy model"
```

---

### Task B2: Alembic migration — app_settings table

**Files:**
- Create: `backend/alembic/versions/002_add_app_settings.py`

**Step 1: Create the migration file**

```python
# backend/alembic/versions/002_add_app_settings.py
"""Add app_settings table with seed data.

Revision ID: 002
Revises: 001
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Seed default values
    op.execute(
        "INSERT INTO app_settings (key, value) VALUES "
        "('daily_budget_usd', '1.00'), "
        "('webhook_url', '')"
    )


def downgrade() -> None:
    op.drop_table("app_settings")
```

**Step 2: Run migration locally (optional — Railway runs it on deploy)**
```bash
cd backend && alembic upgrade head 2>&1 | tail -5
```
Expected: `Running upgrade 001 -> 002, Add app_settings table with seed data`

**Step 3: Commit**
```bash
git add backend/alembic/versions/002_add_app_settings.py
git commit -m "feat(settings): migration 002 — app_settings table + seed"
```

---

### Task B3: Settings API router

**Files:**
- Create: `backend/app/routers/settings_api.py`
- Modify: `backend/app/main.py`

**Step 1: Create the router**

```python
# backend/app/routers/settings_api.py
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_db
from app.models.setting import AppSetting

router = APIRouter()

ALLOWED_KEYS = {"daily_budget_usd", "webhook_url"}
_HTTPS_RE = re.compile(r"^https://\S+$")


def _validate_value(key: str, value: str) -> str:
    """Validate and normalize a setting value. Raises ValueError on bad input."""
    if key == "daily_budget_usd":
        try:
            v = float(value)
        except ValueError:
            raise ValueError("daily_budget_usd must be a number")
        if not (0.01 <= v <= 100.0):
            raise ValueError("daily_budget_usd must be between 0.01 and 100.00")
        return f"{v:.2f}"
    if key == "webhook_url":
        value = value.strip()
        if value and not _HTTPS_RE.match(value):
            raise ValueError("webhook_url must be empty or start with https://")
        return value
    return value


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Return all app settings as {key: value}."""
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


@router.put("/{key}")
async def update_setting(
    key: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Update a single setting by key. Body: {"value": "..."}"""
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key}")
    raw_value = payload.get("value", "")
    try:
        value = _validate_value(key, str(raw_value))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = AppSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    await db.commit()
    return {"key": key, "value": value}


@router.post("/test-webhook")
async def test_webhook(db: AsyncSession = Depends(get_db)) -> dict:
    """Fire a test POST to the configured webhook URL."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "webhook_url")
    )
    row = result.scalar_one_or_none()
    url = row.value if row else ""
    if not url:
        raise HTTPException(status_code=400, detail="No webhook URL configured")
    payload = {
        "event": "test",
        "source": "MissionControl",
        "message": "Webhook test from MissionControl Settings",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json=payload)
        return {"status": "ok", "http_status": r.status_code}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Webhook delivery failed: {exc}")
```

**Step 2: Register in main.py**

In `backend/app/main.py`, add alongside other router imports:
```python
from app.routers import settings_api
```
And in the router registration block:
```python
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
```

**Step 3: Verify import works**
```bash
cd backend && python -c "from app.routers.settings_api import router; print('ok')"
```
Expected: `ok`

**Step 4: Commit**
```bash
git add backend/app/routers/settings_api.py backend/app/main.py
git commit -m "feat(settings): GET/PUT /api/settings + POST test-webhook"
```

---

### Task B4: Wire budget from DB in costs.py

**Files:**
- Modify: `backend/app/routers/costs.py`

**Step 1: Find the hardcoded budget**

Line ~88 in costs.py:
```python
"budget_remaining_usd": max(0.0, round(1.0 - float(row.total or 0), 6)),
```

**Step 2: Add a helper to read budget from DB**

At the top of costs.py, add:
```python
from app.models.setting import AppSetting
```

Add a helper function (before the route handlers):
```python
async def _get_daily_budget(db: AsyncSession) -> float:
    """Read daily_budget_usd from app_settings, fallback to 1.0."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "daily_budget_usd")
    )
    row = result.scalar_one_or_none()
    try:
        return float(row.value) if row else 1.0
    except (ValueError, TypeError):
        return 1.0
```

**Step 3: Update the today endpoint**

In the `costs_today` endpoint, call `_get_daily_budget(db)` and use it:
```python
budget = await _get_daily_budget(db)
# Replace the hardcoded 1.0:
"budget_remaining_usd": max(0.0, round(budget - float(row.total or 0), 6)),
```

Also pass `budget` to the response so the frontend can display it:
```python
return {
    ...
    "budget_usd": budget,  # add this field
    "budget_remaining_usd": ...,
}
```

**Step 4: Verify no TypeScript/Python errors**
```bash
cd backend && python -c "from app.routers.costs import router; print('ok')"
```
Expected: `ok`

**Step 5: Commit**
```bash
git add backend/app/routers/costs.py
git commit -m "feat(settings): costs.py reads daily_budget_usd from app_settings"
```

---

### Task B5: Webhook delivery on alert creation

**Files:**
- Modify: `backend/app/routers/alerts.py`

**Step 1: Add webhook fire helper at the bottom of alerts.py**

```python
import httpx
import asyncio
from sqlalchemy import select as _select
from app.models.setting import AppSetting


async def _fire_webhook(db_session_maker, alert_data: dict) -> None:
    """Fire-and-forget webhook delivery. Logs failure, never raises."""
    try:
        # Need a fresh session since this runs detached
        from app.database import async_session_factory
        async with async_session_factory() as db:
            result = await db.execute(
                _select(AppSetting).where(AppSetting.key == "webhook_url")
            )
            row = result.scalar_one_or_none()
            url = row.value if row else ""
        if not url:
            return
        payload = {"event": "alert", "source": "MissionControl", **alert_data}
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Webhook delivery failed: %s", exc)
```

**Step 2: Find or create the alert creation endpoint**

Check if there is a `POST /alerts` endpoint in alerts.py. If yes, add webhook fire after commit. If there is no POST endpoint yet, add one:

```python
from app.schemas.alert import AlertCreate

@router.post("", response_model=AlertResponse, status_code=201)
async def create_alert(alert_in: AlertCreate, db: AsyncSession = Depends(get_db)):
    alert = Alert(
        severity=alert_in.severity,
        title=alert_in.title,
        message=alert_in.message,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    # Fire webhook in background (non-blocking)
    asyncio.create_task(_fire_webhook(None, {
        "alert_id": str(alert.id),
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
    }))
    return alert
```

Note: The demo loop in `demo.py` creates alerts directly via `db.add(Alert(...))` — add the same webhook fire call there after `await db.commit()` for alert objects.

**Step 3: Check AlertCreate schema exists**

```bash
cat backend/app/schemas/alert.py
```
If `AlertCreate` is missing, add it:
```python
class AlertCreate(BaseModel):
    severity: str
    title: str
    message: str | None = None
```

**Step 4: Commit**
```bash
git add backend/app/routers/alerts.py backend/app/schemas/alert.py
git commit -m "feat(settings): fire webhook on alert creation (fire-and-forget)"
```

---

### Task B6: Frontend — settingsApi + Settings.tsx update

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Settings.tsx`

**Step 1: Add settingsApi to client.ts**

In `frontend/src/api/client.ts`, add:
```typescript
export const settingsApi = {
  get: (): Promise<Record<string, string>> =>
    fetch(`${API_BASE}/api/settings`).then(r => r.json()),

  update: (key: string, value: string): Promise<{ key: string; value: string }> =>
    fetch(`${API_BASE}/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),

  testWebhook: (): Promise<{ status: string; http_status: number }> =>
    fetch(`${API_BASE}/api/settings/test-webhook`, { method: 'POST' }).then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.json();
    }),
};
```

**Step 2: Rewrite the Settings.tsx config section**

Replace the static "Daily Budget" section with editable fields. Add at the top of the component:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/client';

// Inside component:
const qc = useQueryClient();
const [budgetInput, setBudgetInput] = useState('');
const [webhookInput, setWebhookInput] = useState('');
const [webhookTesting, setWebhookTesting] = useState(false);
const [webhookResult, setWebhookResult] = useState<string | null>(null);

const { data: settings } = useQuery({
  queryKey: ['settings'],
  queryFn: settingsApi.get,
  onSuccess: (data) => {
    setBudgetInput(data.daily_budget_usd ?? '1.00');
    setWebhookInput(data.webhook_url ?? '');
  },
});

const updateMutation = useMutation({
  mutationFn: ({ key, value }: { key: string; value: string }) =>
    settingsApi.update(key, value),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
});
```

Add the new settings card:

```tsx
{/* Editable Settings Card */}
<div className="mc-card space-y-4">
  <h3 className="text-sm font-semibold text-mc-text-secondary">Configuration</h3>

  {/* Daily Budget */}
  <div>
    <label className="block text-xs text-mc-text-muted mb-1">Daily Budget (USD)</label>
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0.01"
        max="100"
        step="0.01"
        value={budgetInput}
        onChange={e => setBudgetInput(e.target.value)}
        className="mc-input w-28 text-sm"
      />
      <button
        className="mc-btn mc-btn-secondary text-xs"
        onClick={() => updateMutation.mutate({ key: 'daily_budget_usd', value: budgetInput })}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>

  {/* Webhook URL */}
  <div>
    <label className="block text-xs text-mc-text-muted mb-1">Alert Webhook URL</label>
    <div className="flex items-center gap-2">
      <input
        type="url"
        placeholder="https://hooks.slack.com/..."
        value={webhookInput}
        onChange={e => setWebhookInput(e.target.value)}
        className="mc-input flex-1 text-sm"
      />
      <button
        className="mc-btn mc-btn-secondary text-xs"
        onClick={() => updateMutation.mutate({ key: 'webhook_url', value: webhookInput })}
        disabled={updateMutation.isPending}
      >
        Save
      </button>
      <button
        className="mc-btn mc-btn-secondary text-xs"
        disabled={!webhookInput || webhookTesting}
        onClick={async () => {
          setWebhookTesting(true);
          setWebhookResult(null);
          try {
            const r = await settingsApi.testWebhook();
            setWebhookResult(`✓ ${r.http_status}`);
          } catch (e: any) {
            setWebhookResult(`✗ ${e?.detail ?? 'Failed'}`);
          } finally {
            setWebhookTesting(false);
          }
        }}
      >
        {webhookTesting ? 'Testing…' : 'Test'}
      </button>
    </div>
    {webhookResult && (
      <p className={`text-xs mt-1 ${webhookResult.startsWith('✓') ? 'text-mc-accent-green' : 'text-mc-accent-red'}`}>
        {webhookResult}
      </p>
    )}
  </div>
</div>
```

Keep the existing Daily Budget display card — just update it to use `settings?.daily_budget_usd` for the limit value.

**Step 3: TypeScript check**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit**
```bash
git add frontend/src/api/client.ts frontend/src/pages/Settings.tsx
git commit -m "feat(settings): editable budget + webhook URL in Settings page"
```

---

## Track C — Task Templates

### Task C1: TaskTemplate SQLAlchemy model

**Files:**
- Create: `backend/app/models/template.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the model**

```python
# backend/app/models/template.py
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, DateTime, JSON, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    priority: Mapped[int] = mapped_column(Integer, default=5)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

**Step 2: Register in __init__.py**

```python
from app.models.template import TaskTemplate
```
Add `"TaskTemplate"` to `__all__`.

**Step 3: Commit**
```bash
git add backend/app/models/template.py backend/app/models/__init__.py
git commit -m "feat(templates): TaskTemplate SQLAlchemy model"
```

---

### Task C2: Alembic migration — task_templates table

**Files:**
- Create: `backend/alembic/versions/003_add_task_templates.py`

**Step 1: Create the migration**

Note: if Track B migration (002) doesn't exist yet, set `down_revision = "001"` instead of `"002"`. Coordinate with Track B.

```python
# backend/alembic/versions/003_add_task_templates.py
"""Add task_templates table.

Revision ID: 003
Revises: 002
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_templates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("task_templates")
```

**Step 2: Commit**
```bash
git add backend/alembic/versions/003_add_task_templates.py
git commit -m "feat(templates): migration 003 — task_templates table"
```

---

### Task C3: Templates API router

**Files:**
- Create: `backend/app/routers/templates.py`
- Modify: `backend/app/main.py`

**Step 1: Create router**

```python
# backend/app/routers/templates.py
import uuid as _uuid
from uuid import UUID
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.template import TaskTemplate
from app.models.task import Task

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    agent_id: UUID | None = None
    priority: int = 5
    payload: dict[str, Any] | None = None


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    agent_id: UUID | None
    priority: int
    payload: dict | None
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, t: TaskTemplate) -> "TemplateResponse":
        return cls(
            id=t.id,
            name=t.name,
            description=t.description,
            agent_id=t.agent_id,
            priority=t.priority,
            payload=t.payload,
            created_at=t.created_at.isoformat(),
        )


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskTemplate).order_by(TaskTemplate.created_at.desc())
    )
    rows = result.scalars().all()
    return [TemplateResponse.from_orm_obj(r) for r in rows]


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(body: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tmpl = TaskTemplate(
        name=body.name,
        description=body.description,
        agent_id=body.agent_id,
        priority=body.priority,
        payload=body.payload,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return TemplateResponse.from_orm_obj(tmpl)


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()


@router.post("/{template_id}/apply", status_code=201)
async def apply_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    """Create a new Task from this template and return it."""
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    task = Task(
        title=tmpl.name,
        description=tmpl.description,
        agent_id=tmpl.agent_id,
        priority=tmpl.priority,
        input_data=tmpl.payload,
        status="queued",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": str(task.id), "title": task.title, "status": task.status}
```

**Step 2: Register in main.py**

```python
from app.routers import templates
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])
```

**Step 3: Verify**
```bash
cd backend && python -c "from app.routers.templates import router; print('ok')"
```

**Step 4: Commit**
```bash
git add backend/app/routers/templates.py backend/app/main.py
git commit -m "feat(templates): CRUD + apply endpoints at /api/templates"
```

---

### Task C4: Frontend — templatesApi + Templates page

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/pages/Templates.tsx`

**Step 1: Add templatesApi to client.ts**

```typescript
export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  priority: number;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export const templatesApi = {
  list: (): Promise<TaskTemplate[]> =>
    fetch(`${API_BASE}/api/templates`).then(r => r.json()),

  create: (body: Omit<TaskTemplate, 'id' | 'created_at'>): Promise<TaskTemplate> =>
    fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json()),

  delete: (id: string): Promise<void> =>
    fetch(`${API_BASE}/api/templates/${id}`, { method: 'DELETE' }).then(() => undefined),

  apply: (id: string): Promise<{ id: string; title: string; status: string }> =>
    fetch(`${API_BASE}/api/templates/${id}/apply`, { method: 'POST' }).then(r => r.json()),
};
```

**Step 2: Create Templates.tsx page**

```tsx
// frontend/src/pages/Templates.tsx
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi, type TaskTemplate } from '@/api/client';

export default function Templates() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const applyMutation = useMutation({
    mutationFn: templatesApi.apply,
    onSuccess: (task) => navigate(`/tasks/${task.id}`),
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => (
        <div key={i} className="mc-card h-20 animate-pulse bg-mc-bg-tertiary" />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Task Templates</h2>
        <button
          className="mc-btn text-xs"
          onClick={() => navigate('/tasks/create')}
        >
          + New Task
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="mc-card text-center py-12">
          <p className="text-mc-text-muted text-sm">No templates yet.</p>
          <p className="text-mc-text-muted text-xs mt-1">
            Create a task and check "Save as template" to add one.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t: TaskTemplate) => (
            <div key={t.id} className="mc-card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm text-mc-text-primary truncate">{t.name}</h3>
                <button
                  className="text-mc-text-muted hover:text-mc-accent-red text-xs flex-shrink-0"
                  onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                >
                  ✕
                </button>
              </div>
              {t.description && (
                <p className="text-xs text-mc-text-muted line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-mc-text-muted mt-auto">
                <span>Priority {t.priority}</span>
                {t.agent_id && <span className="mc-badge">agent</span>}
              </div>
              <button
                className="mc-btn w-full text-xs mt-1"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate(t.id)}
              >
                {applyMutation.isPending ? 'Creating…' : '▶ Use Template'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**
```bash
git add frontend/src/api/client.ts frontend/src/pages/Templates.tsx
git commit -m "feat(templates): templatesApi + Templates grid page"
```

---

### Task C5: Wire Templates into nav + router + TaskCreate

**Files:**
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/App.tsx` (or wherever routes are defined)
- Modify: `frontend/src/pages/TaskCreate.tsx`

**Step 1: Add Templates to nav in Layout.tsx**

Find `navItems` array:
```typescript
const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { path: '/agents', label: 'Agents', icon: '⬡' },
  { path: '/tasks', label: 'Tasks', icon: '☐' },
  // ...
];
```

Add after Tasks:
```typescript
{ path: '/templates', label: 'Templates', icon: '⊞' },
```

**Step 2: Add route in App.tsx**

Find where React Router routes are defined. Add:
```tsx
import Templates from './pages/Templates';
// ...
<Route path="/templates" element={<Templates />} />
```

**Step 3: Add "Save as template" to TaskCreate.tsx**

At the top of `TaskCreate.tsx`, add:
```typescript
import { templatesApi } from '@/api/client';
```

Add to `FormState`:
```typescript
interface FormState {
  title: string;
  description: string;
  delegated_to: string;
  priority: number;
  saveAsTemplate: boolean;  // NEW
}
```

Update initial state:
```typescript
const [form, setForm] = useState<FormState>({
  title: '',
  description: '',
  delegated_to: '',
  priority: 5,
  saveAsTemplate: false,
});
```

Update `createMutation.onSuccess` to also save as template if checked:
```typescript
onSuccess: async (task) => {
  if (form.saveAsTemplate && form.title.trim()) {
    try {
      await templatesApi.create({
        name: form.title.trim(),
        description: form.description.trim() || null,
        agent_id: form.delegated_to || null,
        priority: form.priority,
        payload: null,
      });
    } catch {
      // non-blocking — task already created
    }
  }
  navigate(`/tasks/${task.id}`);
},
```

Add template pre-fill from URL params. Import `useSearchParams`:
```typescript
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
const [searchParams] = useSearchParams();
const templateId = searchParams.get('template');
```

Add a query to load template data when `templateId` is present:
```typescript
const { data: templateData } = useQuery({
  queryKey: ['templates', templateId],
  queryFn: () => templatesApi.list().then(ts => ts.find(t => t.id === templateId) ?? null),
  enabled: !!templateId,
});

// Pre-fill form when template loads
useEffect(() => {
  if (templateData) {
    setForm(prev => ({
      ...prev,
      title: templateData.name,
      description: templateData.description ?? '',
      delegated_to: templateData.agent_id ?? '',
      priority: templateData.priority,
    }));
  }
}, [templateData]);
```

Add the checkbox to the form JSX (before the submit button):
```tsx
<label className="flex items-center gap-2 text-xs text-mc-text-muted cursor-pointer">
  <input
    type="checkbox"
    checked={form.saveAsTemplate}
    onChange={e => setForm(prev => ({ ...prev, saveAsTemplate: e.target.checked }))}
    className="rounded"
  />
  Save as template for reuse
</label>
```

**Step 4: TypeScript check**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**
```bash
git add frontend/src/components/Layout.tsx \
        frontend/src/App.tsx \
        frontend/src/pages/TaskCreate.tsx
git commit -m "feat(templates): nav item, route, save-as-template + pre-fill from URL"
```

---

## Final — Merge & Deploy

### Task F1: Merge worktree to master and deploy

**Step 1: Verify all tracks committed**
```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git log --oneline -15
```

**Step 2: Merge to master**
```bash
cd "C:\Z_projects\MissionControl"
git merge claude/gracious-colden --no-ff -m "feat: Phase 17 — mobile layout, configurable settings, task templates"
git push origin master
```

**Step 3: Deploy backend**
```bash
set RAILWAY_TOKEN=83bae020-57e1-4fc4-849e-4fe77ecae1d7
railway up --service backend --detach
```

**Step 4: Deploy frontend**
```bash
railway up --service frontend --detach
```

**Step 5: Verify endpoints**
```bash
curl https://backend-production-a6b7.up.railway.app/api/settings
# Expected: {"daily_budget_usd":"1.00","webhook_url":""}

curl https://backend-production-a6b7.up.railway.app/api/templates
# Expected: []
```

**Step 6: Commit worktree sync**
```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git merge origin/master --ff-only
```
