# Phase 18 Implementation Plan — Agent Metrics + Bulk Ops + Task Scheduling

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three independent capability tracks: dedicated metrics tab on AgentDetail, bulk cancel/reassign in Tasks list, and `scheduled_at` scheduling for tasks.

**Architecture:** All three tracks share `tasks.py` (B adds `POST /bulk`; C adds `scheduled_at` to schema + model + scheduler). Execute B then C to avoid merge conflicts. Track A is fully independent (`agents.py` + `AgentDetail.tsx`).

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend), React 18 + TanStack Query + pure SVG (frontend), APScheduler (scheduler).

---

## Codebase State (read before coding)

- `backend/app/routers/agents.py` — metrics endpoint EXISTS at line 108 but missing `daily_volume`, `avg_cost_usd`, 404 guard
- `backend/app/routers/tasks.py` — has `POST ""`, `GET ""`, `GET /{task_id}`, `GET /{task_id}/logs`, `PATCH /{task_id}`. No bulk endpoint.
- `backend/app/models/task.py` — Task model has NO `scheduled_at` field
- `backend/app/schemas/task.py` — TaskCreate has NO `scheduled_at`
- `backend/app/main.py` — APScheduler at line 41; heartbeat (30s) + alerts jobs registered in startup
- `frontend/src/api/client.ts` — `agentsApi.metrics()` EXISTS (line 62) but type lacks `daily_volume`/`avg_cost_usd`. No `tasksApi.bulk()`
- `frontend/src/types/index.ts` — Task interface has NO `scheduled_at`
- `frontend/src/pages/AgentDetail.tsx` — tabs are `'overview' | 'logs'`. Metrics shown inline in Overview (line 121). No dedicated Metrics tab.
- `frontend/src/pages/Tasks.tsx` — no checkbox column, no selection state
- `frontend/src/pages/TaskCreate.tsx` — no scheduling UI
- `frontend/src/pages/TaskDetail.tsx` — no `scheduled_at` display
- Migrations: 001 (initial), 002 (app_settings), 003 (task_templates) → next is **004**
- **No test infrastructure** — verify with curl commands and `npm run build`

---

## Task 1: Track A — Enhance Backend Metrics Endpoint

**Files:**
- Modify: `backend/app/routers/agents.py:108-161`

**Step 1: Read the current endpoint**

Lines 108–161 of `backend/app/routers/agents.py`. The function `get_agent_metrics` returns `agent_id, total_tasks, completed, failed, running, queued, success_rate, failure_rate, avg_duration_seconds, total_cost_usd, status_breakdown`. Missing: 404 check, `avg_cost_usd`, `daily_volume`.

**Step 2: Replace the endpoint**

Replace the entire `get_agent_metrics` function (lines 108–161) with:

```python
@router.get("/{agent_id}/metrics")
async def get_agent_metrics(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get performance metrics for an agent."""
    from datetime import date, timedelta
    from sqlalchemy import cast, Date as SADate

    # 404 guard
    agent_check = await db.execute(select(Agent.id).where(Agent.id == agent_id))
    if not agent_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent not found")

    # Status breakdown
    task_result = await db.execute(
        select(Task.status, func.count(Task.id).label('count'))
        .where(Task.agent_id == agent_id)
        .group_by(Task.status)
    )
    status_counts = {row.status: row.count for row in task_result.fetchall()}

    total = sum(status_counts.values())
    completed = status_counts.get('completed', 0)
    failed = status_counts.get('failed', 0)

    # Avg task duration (completed tasks only)
    duration_result = await db.execute(
        select(
            func.avg(
                func.extract('epoch', Task.completed_at) -
                func.extract('epoch', Task.started_at)
            ).label('avg_seconds')
        )
        .where(Task.agent_id == agent_id)
        .where(Task.status == 'completed')
        .where(Task.started_at.isnot(None))
        .where(Task.completed_at.isnot(None))
    )
    avg_duration = duration_result.scalar() or 0

    # Total + avg cost
    cost_result = await db.execute(
        select(func.sum(Task.cost)).where(Task.agent_id == agent_id)
    )
    total_cost = cost_result.scalar() or 0.0
    avg_cost = round(total_cost / total, 6) if total > 0 else 0.0

    # Daily volume — last 7 days (UTC dates)
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=6)
    week_start_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)

    daily_result = await db.execute(
        select(
            cast(func.timezone('UTC', Task.created_at), SADate).label('day'),
            func.count(Task.id).label('count')
        )
        .where(Task.agent_id == agent_id)
        .where(Task.created_at >= week_start_dt)
        .group_by(cast(func.timezone('UTC', Task.created_at), SADate))
        .order_by(cast(func.timezone('UTC', Task.created_at), SADate))
    )
    day_map = {str(r.day): r.count for r in daily_result.fetchall()}
    daily_volume = [
        {"date": str(today - timedelta(days=i)), "count": day_map.get(str(today - timedelta(days=i)), 0)}
        for i in range(6, -1, -1)
    ]

    return {
        "agent_id": str(agent_id),
        "total_tasks": total,
        "completed": completed,
        "failed": failed,
        "running": status_counts.get('running', 0),
        "queued": status_counts.get('queued', 0),
        "success_rate": round((completed / total * 100) if total > 0 else 0, 1),
        "failure_rate": round((failed / total * 100) if total > 0 else 0, 1),
        "avg_duration_seconds": round(avg_duration, 1),
        "avg_cost_usd": avg_cost,
        "total_cost_usd": round(total_cost, 6),
        "status_breakdown": status_counts,
        "daily_volume": daily_volume,
    }
```

**Step 3: Verify with curl**

```bash
# Start dev server, then:
curl http://localhost:8000/api/agents/<real-agent-uuid>/metrics | python -m json.tool
# Expect: daily_volume array of 7 items, avg_cost_usd field, no 404 on valid agent

curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/agents/00000000-0000-0000-0000-000000000000/metrics
# Expect: 404
```

**Step 4: Commit**

```bash
git add backend/app/routers/agents.py
git commit -m "feat: enhance agent metrics endpoint with daily_volume, avg_cost_usd, 404 guard"
```

---

## Task 2: Track A — Metrics Tab in AgentDetail

**Files:**
- Modify: `frontend/src/api/client.ts:62-76` — update metrics type
- Modify: `frontend/src/pages/AgentDetail.tsx` — add third tab + AgentMetricsTab component

**Step 1: Update agentsApi.metrics type in client.ts**

Replace the return type of `agentsApi.metrics` (lines 63–75) to add `avg_cost_usd` and `daily_volume`:

```typescript
  metrics: (agentId: string) =>
    request<{
      agent_id: string;
      total_tasks: number;
      completed: number;
      failed: number;
      running: number;
      queued: number;
      success_rate: number;
      failure_rate: number;
      avg_duration_seconds: number;
      avg_cost_usd: number;
      total_cost_usd: number;
      status_breakdown: Record<string, number>;
      daily_volume: Array<{ date: string; count: number }>;
    }>(`/api/agents/${agentId}/metrics`),
```

**Step 2: Add AgentMetricsTab component to AgentDetail.tsx**

Add this component BEFORE the `export default function AgentDetail()` line:

```tsx
type AgentMetrics = {
  total_tasks: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  success_rate: number;
  avg_duration_seconds: number;
  avg_cost_usd: number;
  total_cost_usd: number;
  status_breakdown: Record<string, number>;
  daily_volume: Array<{ date: string; count: number }>;
};

function VolumeChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const barW = 28, gap = 8, H = 56;
  const totalW = data.length * (barW + gap) - gap;
  return (
    <svg viewBox={`0 0 ${totalW} ${H}`} className="w-full h-14">
      {data.map((d, i) => {
        const barH = Math.max((d.count / max) * (H - 18), d.count > 0 ? 3 : 0);
        const x = i * (barW + gap);
        const y = H - barH - 14;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} fill="#3b82f6" fillOpacity="0.75" rx="2" />
            <text x={x + barW / 2} y={H - 1} textAnchor="middle" fontSize="7" fill="#555">{d.date.slice(5)}</text>
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="8" fill="#3b82f6">{d.count}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StatusSegmentBar({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  if (total === 0) return <div className="h-3 bg-mc-bg-tertiary rounded" />;
  const segments = [
    { key: 'completed', color: '#16a34a', label: 'Done' },
    { key: 'failed', color: '#ef4444', label: 'Failed' },
    { key: 'running', color: '#3b82f6', label: 'Running' },
    { key: 'queued', color: '#d97706', label: 'Queued' },
    { key: 'cancelled', color: '#555', label: 'Cancelled' },
  ];
  return (
    <div className="space-y-2">
      <div className="h-3 rounded overflow-hidden flex">
        {segments.map(({ key, color }) => {
          const count = breakdown[key] || 0;
          if (count === 0) return null;
          return (
            <div
              key={key}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: color }}
              title={`${key}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(({ key, color, label }) => {
          const count = breakdown[key] || 0;
          if (count === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1 text-[10px] text-mc-text-muted">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
              {label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AgentMetricsTab({ agentId }: { agentId: string }) {
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['agent-metrics', agentId],
    queryFn: () => agentsApi.metrics(agentId),
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-mc-bg-tertiary rounded animate-pulse" />)}
    </div>
  );
  if (isError || !m) return <p className="text-xs text-mc-accent-red py-6 text-center">Failed to load metrics.</p>;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Tasks</p>
          <p className="text-2xl font-bold text-mc-accent-blue mt-1">{m.total_tasks}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Success Rate</p>
          <p className={`text-2xl font-bold mt-1 ${m.success_rate >= 80 ? 'text-mc-accent-green' : m.success_rate >= 50 ? 'text-mc-accent-amber' : 'text-mc-accent-red'}`}>
            {m.success_rate}%
          </p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Avg Cost / Task</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">${m.avg_cost_usd.toFixed(4)}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Cost</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">${m.total_cost_usd.toFixed(4)}</p>
        </div>
      </div>

      {/* 7-day volume chart */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">7-Day Task Volume</h3>
        {m.daily_volume.every((d) => d.count === 0) ? (
          <p className="text-xs text-mc-text-muted text-center py-4">No task activity in the last 7 days.</p>
        ) : (
          <VolumeChart data={m.daily_volume} />
        )}
      </div>

      {/* Status breakdown */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Status Breakdown</h3>
        <StatusSegmentBar breakdown={m.status_breakdown} total={m.total_tasks} />
        <div className="mt-3 text-xs text-mc-text-muted">
          Avg duration: <span className="text-mc-text-secondary font-medium">
            {m.avg_duration_seconds > 0 ? formatDuration(m.avg_duration_seconds) : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add 'metrics' to the tab type and render it**

In `AgentDetail.tsx`:

Change `type ActiveTab = 'overview' | 'logs';` → `type ActiveTab = 'overview' | 'logs' | 'metrics';`

Change the tab list (line 118):
```tsx
{(['overview', 'logs', 'metrics'] as ActiveTab[]).map((tab) => (
  <button key={tab} onClick={() => setActiveTab(tab)}
    className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-mc-accent-blue text-mc-accent-blue' : 'border-transparent text-mc-text-muted hover:text-mc-text-secondary'}`}>
    {tab}
  </button>
))}
```

After `{activeTab === 'logs' && <AgentLogsTab agentId={agentId} />}` (line 132), add:
```tsx
{activeTab === 'metrics' && <AgentMetricsTab agentId={agentId} />}
```

**Step 4: Build verification**

```bash
cd frontend && npm run build
# Expect: no TypeScript errors, build succeeds
```

**Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/AgentDetail.tsx
git commit -m "feat: add Metrics tab to AgentDetail with 7-day chart and status breakdown"
```

---

## Task 3: Track B — Bulk Tasks Endpoint

**Files:**
- Modify: `backend/app/routers/tasks.py` — add `POST /bulk` before the `/{task_id}` routes

**Step 1: Add BulkTaskAction schema and endpoint**

Add this block BETWEEN the `list_tasks` function (ends ~line 121) and `get_task` function (starts ~line 124):

```python
class BulkTaskAction(BaseModel):
    action: str
    task_ids: list[UUID]
    agent_id: UUID | None = None

from pydantic import BaseModel as _BaseModel, field_validator as _fv
```

Actually, `BaseModel` is not imported in tasks.py. The schemas are in `app/schemas/task.py`. Add the inline class at the top of the file and add the pydantic import. Here is the full addition:

At the **top of tasks.py**, add to imports:
```python
from pydantic import BaseModel
```

Then add this function BETWEEN `list_tasks` and `get_task` (after line 121, before line 124):

```python
class _BulkAction(BaseModel):
    action: str
    task_ids: list[UUID]
    agent_id: UUID | None = None


@router.post("/bulk")
async def bulk_task_action(body: _BulkAction, db: AsyncSession = Depends(get_db)):
    """Bulk cancel or reassign tasks. action: 'cancel' | 'reassign'. Max 100 task_ids."""
    if body.action not in ('cancel', 'reassign'):
        raise HTTPException(status_code=422, detail="action must be 'cancel' or 'reassign'")
    if not 1 <= len(body.task_ids) <= 100:
        raise HTTPException(status_code=422, detail="task_ids must contain 1–100 items")
    if body.action == 'reassign' and not body.agent_id:
        raise HTTPException(status_code=422, detail="agent_id required for reassign")

    result = await db.execute(select(Task).where(Task.id.in_(body.task_ids)))
    tasks = result.scalars().all()

    updated = 0
    skipped = 0
    now = datetime.now(timezone.utc)

    for task in tasks:
        if body.action == 'cancel':
            if task.status in ('queued', 'running'):
                task.status = 'cancelled'
                task.completed_at = now
                updated += 1
            else:
                skipped += 1
        elif body.action == 'reassign':
            task.agent_id = body.agent_id
            updated += 1

    await db.commit()
    return {"updated": updated, "skipped": skipped}
```

**Step 2: Verify with curl**

```bash
# Create a test task first, note its ID, then:
curl -s -X POST http://localhost:8000/api/tasks/bulk \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel","task_ids":["<task-uuid>"]}' | python -m json.tool
# Expect: {"updated": 1, "skipped": 0}

# Validate bad action
curl -s -X POST http://localhost:8000/api/tasks/bulk \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","task_ids":["<task-uuid>"]}' | python -m json.tool
# Expect: 422 validation error
```

**Step 3: Commit**

```bash
git add backend/app/routers/tasks.py
git commit -m "feat: add POST /api/tasks/bulk for cancel/reassign"
```

---

## Task 4: Track B — Bulk Operations Frontend

**Files:**
- Modify: `frontend/src/api/client.ts` — add `tasksApi.bulk()`
- Modify: `frontend/src/pages/Tasks.tsx` — checkbox column, selected state, action bar

**Step 1: Add tasksApi.bulk to client.ts**

Add after the `retry` method (line 127) in `tasksApi`:
```typescript
  bulk: (body: { action: 'cancel' | 'reassign'; task_ids: string[]; agent_id?: string }) =>
    request<{ updated: number; skipped: number }>('/api/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

**Step 2: Add state and mutations to Tasks.tsx**

Add these imports at the top (after existing imports):
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

Add these state variables after `const [page, setPage] = useState(0);`:
```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());
const [showReassign, setShowReassign] = useState(false);
const [reassignAgentId, setReassignAgentId] = useState('');
const qc = useQueryClient();
```

**Step 3: Update filter handlers to clear selection**

Replace the existing filter handlers:
```tsx
const handleStatusChange = (val: string) => { setFilterStatus(val || undefined); setPage(0); setSelected(new Set()); };
const handleAgentChange = (val: string) => { setFilterAgent(val || undefined); setPage(0); setSelected(new Set()); };
const handleSearchChange = (val: string) => { setSearch(val); setPage(0); setSelected(new Set()); };
```

Also: when `page` changes via the pagination buttons, clear selection. Add `setSelected(new Set())` call in both pagination `onClick` handlers.

**Step 4: Add bulk mutation**

After the `qc` declaration:
```tsx
const bulkMutation = useMutation({
  mutationFn: (params: { action: 'cancel' | 'reassign'; agent_id?: string }) =>
    tasksApi.bulk({ action: params.action, task_ids: [...selected], agent_id: params.agent_id }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    setSelected(new Set());
    setShowReassign(false);
    setReassignAgentId('');
  },
});
```

**Step 5: Checkbox helpers**

After `const showingTo = ...`:
```tsx
const allPageSelected = pagedTasks.length > 0 && pagedTasks.every((t: Task) => selected.has(t.id));
const toggleAll = () => {
  if (allPageSelected) {
    setSelected((prev) => { const s = new Set(prev); pagedTasks.forEach((t: Task) => s.delete(t.id)); return s; });
  } else {
    setSelected((prev) => { const s = new Set(prev); pagedTasks.forEach((t: Task) => s.add(t.id)); return s; });
  }
};
const toggleOne = (id: string) =>
  setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
```

**Step 6: Action bar JSX**

Insert BEFORE the `{/* Task List */}` comment (after the filter row closing `</div>`):

```tsx
{/* Bulk action bar */}
{selected.size > 0 && (
  <div className="flex items-center gap-3 mb-3 p-2.5 bg-mc-bg-secondary border border-mc-border-primary rounded-lg flex-wrap">
    <span className="text-xs text-mc-text-secondary font-medium">{selected.size} selected</span>
    <button
      className="mc-btn text-xs bg-mc-accent-red/20 text-mc-accent-red hover:bg-mc-accent-red/30 border border-mc-accent-red/30"
      onClick={() => bulkMutation.mutate({ action: 'cancel' })}
      disabled={bulkMutation.isPending}
    >
      Cancel Selected
    </button>
    <div className="relative">
      <button
        className="mc-btn-secondary text-xs"
        onClick={() => setShowReassign((v) => !v)}
        disabled={bulkMutation.isPending}
      >
        Reassign ▾
      </button>
      {showReassign && (
        <div className="absolute top-9 left-0 z-20 bg-mc-bg-secondary border border-mc-border-primary rounded shadow-lg p-2 min-w-44">
          <select
            className="mc-input text-xs w-full"
            value={reassignAgentId}
            onChange={(e) => setReassignAgentId(e.target.value)}
          >
            <option value="">Select agent…</option>
            {(agentData?.agents || []).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <button
            className="mc-btn-primary text-xs w-full mt-2"
            disabled={!reassignAgentId || bulkMutation.isPending}
            onClick={() => bulkMutation.mutate({ action: 'reassign', agent_id: reassignAgentId })}
          >
            Apply
          </button>
        </div>
      )}
    </div>
    <button
      className="text-xs text-mc-text-muted hover:text-mc-text-primary ml-auto"
      onClick={() => setSelected(new Set())}
    >
      Clear
    </button>
  </div>
)}
```

**Step 7: Checkbox column in the task list**

The task list currently renders each task in a `<div className="mc-card flex items-center justify-between ...">`. Add a checkbox div as the very first child, and stop click propagation so clicking the checkbox doesn't navigate:

```tsx
{pagedTasks.map((task: Task) => (
  <div
    key={task.id}
    className="mc-card flex items-center justify-between cursor-pointer hover:border-mc-border-secondary transition-colors"
    onClick={() => navigate(`/tasks/${task.id}`)}
  >
    {/* Checkbox — stop propagation so clicking doesn't navigate */}
    <div className="flex-shrink-0 mr-2" onClick={(e) => { e.stopPropagation(); toggleOne(task.id); }}>
      <input
        type="checkbox"
        checked={selected.has(task.id)}
        onChange={() => toggleOne(task.id)}
        className="rounded"
      />
    </div>
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {/* ... existing content ... */}
    </div>
    <div className="flex items-center gap-4 text-xs text-mc-text-muted flex-shrink-0">
      {/* ... existing content ... */}
    </div>
  </div>
))}
```

Also add a "select all" checkbox in the header area (just above the task list, when tasks exist). Add it after the `{/* Task List */}` comment, inside the non-empty branch:

```tsx
{/* Select-all header */}
<div className="flex items-center gap-2 mb-1 px-3 py-1 text-xs text-mc-text-muted">
  <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="rounded" />
  <span>{allPageSelected ? 'Deselect all' : `Select all ${pagedTasks.length} on this page`}</span>
</div>
```

**Step 8: Build verification**

```bash
cd frontend && npm run build
# Expect: no TypeScript errors
```

**Step 9: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/pages/Tasks.tsx
git commit -m "feat: bulk task operations — checkbox selection, cancel/reassign action bar"
```

---

## Task 5: Track C — Migration 004 (scheduled_at)

**Files:**
- Create: `backend/alembic/versions/004_add_scheduled_at.py`

**Step 1: Create migration file**

```python
"""Add scheduled_at to tasks.

Revision ID: 004
Revises: 003
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tasks", "scheduled_at")
```

**Step 2: Run migration**

```bash
cd backend
alembic upgrade 004
# Expect: "Running upgrade 003 -> 004"

# Or via make:
make migrate
```

**Step 3: Verify column exists**

```bash
# Connect to DB and check:
docker compose exec db psql -U postgres -d missioncontrol -c "\d tasks" | grep scheduled_at
# Expect: scheduled_at | timestamp with time zone | ...
```

**Step 4: Commit**

```bash
git add backend/alembic/versions/004_add_scheduled_at.py
git commit -m "feat: migration 004 — add scheduled_at column to tasks"
```

---

## Task 6: Track C — Backend Schema + Model + Scheduler

**Files:**
- Modify: `backend/app/models/task.py` — add `scheduled_at` column
- Modify: `backend/app/schemas/task.py` — add `scheduled_at` to TaskCreate + TaskResponse
- Modify: `backend/app/routers/tasks.py` — pass `scheduled_at` in create_task, skip Redis push for future tasks
- Create: `backend/app/services/scheduled_tasks.py` — scheduler job function
- Modify: `backend/app/main.py` — register 60s scheduler job

**Step 1: Add field to Task model**

In `backend/app/models/task.py`, find the block of column definitions. Add after `completed_at`:

```python
from sqlalchemy import TIMESTAMP
# (add to existing imports if not present)

scheduled_at = Column(TIMESTAMP(timezone=True), nullable=True)
```

**Step 2: Update schemas**

In `backend/app/schemas/task.py`:

In `TaskCreate`, add:
```python
from datetime import datetime

scheduled_at: datetime | None = None
```

In `TaskResponse` (or `TaskBase` if that's where fields are declared), add:
```python
scheduled_at: datetime | None = None
```

**Step 3: Update create_task endpoint**

In `backend/app/routers/tasks.py`, in `create_task`:

Change the `Task(...)` constructor call to include `scheduled_at`:
```python
task = Task(
    title=task_in.title,
    description=task_in.description,
    agent_id=task_in.agent_id,
    priority=task_in.priority,
    input_data=task_in.input_data,
    requires_approval=task_in.requires_approval,
    parent_task_id=task_in.parent_task_id,
    delegated_by=task_in.delegated_by,
    delegated_to=task_in.delegated_to,
    status="queued",
    scheduled_at=task_in.scheduled_at,
)
```

Wrap the Redis push block so it's skipped for future-scheduled tasks:
```python
# Skip Redis push for tasks scheduled in the future
now = datetime.now(timezone.utc)
is_future = task_in.scheduled_at and task_in.scheduled_at > now
if not is_future:
    stream_key = f"tasks:{task.delegated_to or 'ceo'}"
    # ... rest of existing Redis push code unchanged ...
```

**Step 4: Create scheduled_tasks service**

Create `backend/app/services/scheduled_tasks.py`:

```python
"""Background job that activates tasks whose scheduled_at time has arrived."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.services.ws_manager import WebSocketManager

logger = logging.getLogger(__name__)


async def check_scheduled_tasks(db: AsyncSession, ws: WebSocketManager) -> int:
    """Find scheduled tasks whose time has come and mark them running.

    Returns the number of tasks activated.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task)
        .where(Task.status == "queued")
        .where(Task.scheduled_at.isnot(None))
        .where(Task.scheduled_at <= now)
    )
    tasks = result.scalars().all()

    count = 0
    for task in tasks:
        task.status = "running"
        task.started_at = now
        task.scheduled_at = None  # clear so it doesn't re-trigger
        count += 1
        await ws.broadcast("task_update", {
            "id": str(task.id),
            "title": task.title,
            "status": "running",
        })

    if count:
        await db.commit()
        logger.info("Activated %d scheduled task(s)", count)

    return count
```

**Step 5: Register scheduler job in main.py**

Add import at top (with other service imports):
```python
from app.services.scheduled_tasks import check_scheduled_tasks
```

Add the job wrapper function after `_alert_job`:
```python
async def _scheduled_tasks_job() -> None:
    try:
        async with async_session() as db:
            await check_scheduled_tasks(db, ws_manager)
    except Exception as exc:
        logger.error("Scheduled tasks job failed: %s", exc, exc_info=True)
```

In `startup_event`, add after the alerts job:
```python
_scheduler.add_job(_scheduled_tasks_job, "interval", seconds=60, id="scheduled_tasks")
```

Update the logger message:
```python
logger.info(
    "Background services started (heartbeat=30s, alerts=%ds, scheduled_tasks=60s)",
    settings.alert_check_interval_seconds,
)
```

**Step 6: Verify**

```bash
# Create a task scheduled 2 minutes in the future, then watch logs:
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Scheduled test task",
    "scheduled_at": "2026-03-07T00:02:00Z"
  }' | python -m json.tool
# Expect: task with scheduled_at field in response, status = "queued"

# Verify it didn't get pushed to Redis (task stays queued until scheduler runs)
curl http://localhost:8000/api/tasks/<task-id> | python -m json.tool
# Expect: status = "queued", scheduled_at set

# Check backend logs for "Activated N scheduled task(s)" after 60s
```

**Step 7: Commit**

```bash
git add backend/app/models/task.py backend/app/schemas/task.py backend/app/routers/tasks.py backend/app/services/scheduled_tasks.py backend/app/main.py
git commit -m "feat: task scheduling — scheduled_at field, schema, APScheduler 60s job"
```

---

## Task 7: Track C — Scheduling Frontend

**Files:**
- Modify: `frontend/src/types/index.ts` — add `scheduled_at` to Task
- Modify: `frontend/src/api/client.ts` — add `scheduled_at?` to tasksApi.create type
- Modify: `frontend/src/pages/TaskCreate.tsx` — scheduling toggle + datetime-local input
- Modify: `frontend/src/pages/Tasks.tsx` — 🕐 badge next to status
- Modify: `frontend/src/pages/TaskDetail.tsx` — "Scheduled for:" timestamp display

**Step 1: Update Task type in types/index.ts**

In the `Task` interface, add after `completed_at`:
```typescript
  scheduled_at: string | null;
```

**Step 2: Update tasksApi.create in client.ts**

In `tasksApi.create`, update the parameter type to include `scheduled_at?`:
```typescript
  create: (data: {
    title: string;
    description?: string;
    priority?: number;
    input_data?: Record<string, unknown>;
    delegated_to?: string;
    scheduled_at?: string;
  }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

**Step 3: Add scheduling UI to TaskCreate.tsx**

Add `showSchedule: boolean` and `scheduledAt: string` to `FormState`:
```tsx
interface FormState {
  title: string;
  description: string;
  delegated_to: string;
  priority: number;
  saveAsTemplate: boolean;
  showSchedule: boolean;
  scheduledAt: string;
}
```

Update the initial state:
```tsx
const [form, setForm] = useState<FormState>({
  title: '',
  description: '',
  delegated_to: '',
  priority: 5,
  saveAsTemplate: false,
  showSchedule: false,
  scheduledAt: '',
});
```

Update `createMutation.mutationFn` to pass `scheduled_at`:
```tsx
mutationFn: () =>
  tasksApi.create({
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    delegated_to: form.delegated_to || undefined,
    priority: form.priority,
    scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
  }),
```

Add the scheduling section in the JSX, between the error message block and the "Save as template" checkbox:

```tsx
{/* Schedule for later */}
<div className="border-t border-mc-border-primary pt-4">
  <button
    type="button"
    className="flex items-center gap-1.5 text-xs text-mc-text-muted hover:text-mc-text-primary transition-colors"
    onClick={() => setForm((prev) => ({ ...prev, showSchedule: !prev.showSchedule, scheduledAt: '' }))}
  >
    <span>{form.showSchedule ? '▾' : '▸'}</span>
    Schedule for later (optional)
  </button>
  {form.showSchedule && (
    <div className="mt-2">
      <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
        Run at
      </label>
      <input
        type="datetime-local"
        className="mc-input w-full"
        min={new Date().toISOString().slice(0, 16)}
        value={form.scheduledAt}
        onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
      />
      <p className="text-[10px] text-mc-text-muted mt-1">
        Task will stay queued until this time, then activate automatically.
      </p>
    </div>
  )}
</div>
```

**Step 4: Add 🕐 badge in Tasks.tsx**

In the task row's left section, add after the status badge and title — inside `<div className="flex items-center gap-3 flex-1 min-w-0">`:

```tsx
{task.scheduled_at && (
  <span
    className="text-mc-text-muted flex-shrink-0"
    title={`Scheduled: ${new Date(task.scheduled_at).toLocaleString()}`}
  >
    🕐
  </span>
)}
```

Place it right after the `{task.parent_task_id && ...}` span.

**Step 5: Show scheduled_at in TaskDetail.tsx**

In the timestamps div (line 286–294), add alongside `created_at`, `started_at`, `completed_at`:

```tsx
{task.scheduled_at && (
  <span title={task.scheduled_at} className="text-mc-accent-amber">
    Scheduled for {new Date(task.scheduled_at).toLocaleString()}
  </span>
)}
```

**Step 6: Build verification**

```bash
cd frontend && npm run build
# Expect: no TypeScript errors, build succeeds
```

**Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/client.ts frontend/src/pages/TaskCreate.tsx frontend/src/pages/Tasks.tsx frontend/src/pages/TaskDetail.tsx
git commit -m "feat: scheduling UI — datetime picker in TaskCreate, 🕐 badge in Tasks, display in TaskDetail"
```

---

## Final Verification

After all 7 tasks:

```bash
# Full build check
cd frontend && npm run build

# Backend import check
cd backend && python -c "from app.main import app; print('OK')"

# Check git log
git log --oneline -8
```

Expected commits (bottom to top):
1. `feat: enhance agent metrics endpoint with daily_volume, avg_cost_usd, 404 guard`
2. `feat: add Metrics tab to AgentDetail with 7-day chart and status breakdown`
3. `feat: add POST /api/tasks/bulk for cancel/reassign`
4. `feat: bulk task operations — checkbox selection, cancel/reassign action bar`
5. `feat: migration 004 — add scheduled_at column to tasks`
6. `feat: task scheduling — scheduled_at field, schema, APScheduler 60s job`
7. `feat: scheduling UI — datetime picker in TaskCreate, 🕐 badge in Tasks, display in TaskDetail`
