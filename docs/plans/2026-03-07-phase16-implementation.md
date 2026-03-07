# Phase 16 Implementation Plan: Demo Engine + Power-User Polish + Data Utilities

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a live demo simulation engine (A), keyboard shortcuts + command palette (B), and CSV export + cost analytics (C) to MissionControl.

**Architecture:** Three fully independent tracks dispatched as parallel subagents. Track A is backend-heavy (new `demo.py` router + asyncio loop + frontend toggle). Track B is frontend-only (keyboard hook + two new components wired into Layout). Track C is split (two new backend routes + frontend download buttons + SVG bar chart).

**Tech Stack:** FastAPI asyncio (A-backend), React 18 + Zustand + TanStack Query cache (B), Python stdlib `csv` + FastAPI StreamingResponse (C-backend), inline SVG (C-frontend).

**Worktree:** `C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden` (branch: `claude/gracious-colden`)

---

## TRACK A — Live Demo Simulation Engine

### Task A1: Backend demo router — stub + registration

**Files:**
- Create: `backend/app/routers/demo.py`
- Modify: `backend/app/main.py`

**Step 1: Create stub router**

```python
# backend/app/routers/demo.py
"""
Demo simulation engine.
POST /api/demo/start  — launches background agent activity loop
POST /api/demo/stop   — cancels it
GET  /api/demo/status — { running: bool, tick: int }
"""
import asyncio
import random
from fastapi import APIRouter, Request
from app.database import async_session

router = APIRouter()
_demo_task: asyncio.Task | None = None
_tick = 0


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
    pass  # implemented in Task A2
```

**Step 2: Register in main.py**

In `backend/app/main.py`, add to the imports line:
```python
from app.routers import agents, tasks, logs, costs, health, approvals, alerts, dashboard, seed, demo
```
And add after the seed router line:
```python
app.include_router(demo.router, tags=["Demo"])
```

**Step 3: Verify stub works**

```bash
curl -s https://backend-production-a6b7.up.railway.app/api/demo/status
# Expected: {"running":false,"tick":0}
# (after deploy — for local test: uvicorn app.main:app --port 8001)
```

**Step 4: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add backend/app/routers/demo.py backend/app/main.py
git commit -m "feat(demo): add demo router stub and registration"
```

---

### Task A2: Demo simulation loop

**Files:**
- Modify: `backend/app/routers/demo.py` (replace `_demo_loop` stub)

**Step 1: Implement the full loop**

Replace the `pass` in `_demo_loop` with:

```python
async def _demo_loop(app):
    """Simulates live agent activity. Runs every 4s."""
    import uuid
    from datetime import datetime, timezone
    from app.models.agent import Agent
    from app.models.task import Task
    from app.models.log_entry import LogEntry
    from app.models.cost_record import CostRecord
    from app.models.alert import Alert
    from sqlalchemy import select, func

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
    ]
    LOG_MSGS = {
        "queued":    ["Task received, queuing for processing", "Added to work queue"],
        "running":   ["Starting task execution", "Fetching required context", "Processing input data", "Running analysis"],
        "completed": ["Task completed successfully", "Output validated", "Results stored"],
        "failed":    ["Unexpected error encountered", "Timeout after 30s", "Context limit reached"],
    }

    try:
        while True:
            await asyncio.sleep(4)
            app.state.demo_tick = getattr(app.state, "demo_tick", 0) + 1
            tick = app.state.demo_tick

            async with async_session() as db:
                # 1. Ensure demo agents exist
                result = await db.execute(select(Agent).where(Agent.type.in_(["ceo","researcher","writer","developer","auditor"])))
                existing = result.scalars().all()
                agent_map = {a.type: a for a in existing}

                for adef in AGENT_DEFS:
                    if adef["type"] not in agent_map:
                        agent = Agent(
                            name=adef["name"], type=adef["type"], tier=adef["tier"],
                            status="idle", model="moonshotai/kimi-k2",
                            model_preference="moonshotai/kimi-k2",
                            capabilities=[], delegation_targets=[], allowed_tools=[],
                        )
                        db.add(agent)
                        agent_map[adef["type"]] = agent
                await db.flush()

                agents_list = list(agent_map.values())

                # 2. Advance a running task → completed or failed
                running_result = await db.execute(select(Task).where(Task.status == "running").limit(3))
                running_tasks = running_result.scalars().all()
                for rtask in running_tasks:
                    new_status = "completed" if random.random() < 0.8 else "failed"
                    rtask.status = new_status
                    rtask.completed_at = datetime.now(timezone.utc)
                    if new_status == "failed":
                        rtask.error_message = random.choice(["Timeout after 30s", "Context limit exceeded", "LLM error"])
                    # Update agent status
                    if rtask.agent_id:
                        for a in agents_list:
                            if a.id == rtask.agent_id:
                                a.status = "idle"
                                a.total_tasks = (a.total_tasks or 0) + 1
                    # Write completion log
                    db.add(LogEntry(
                        agent_id=rtask.agent_id, task_id=rtask.id,
                        level="info" if new_status == "completed" else "error",
                        message=random.choice(LOG_MSGS[new_status]),
                    ))
                    # Write cost record
                    tokens_in = random.randint(200, 2000)
                    tokens_out = random.randint(50, 500)
                    cost = round((tokens_in * 0.0000015) + (tokens_out * 0.000002), 6)
                    db.add(CostRecord(
                        agent_id=rtask.agent_id, task_id=rtask.id,
                        model="moonshotai/kimi-k2",
                        input_tokens=tokens_in, output_tokens=tokens_out, cost_usd=cost,
                    ))

                # 3. Advance a queued task → running
                queued_result = await db.execute(select(Task).where(Task.status == "queued").limit(2))
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
                        agent_id=assigned.id, task_id=qtask.id,
                        level="info", message=random.choice(LOG_MSGS["running"]),
                    ))

                # 4. Create a new task every other tick
                if tick % 2 == 0:
                    new_agent = random.choice(agents_list)
                    new_task = Task(
                        title=random.choice(TASK_POOL),
                        status="queued", priority=random.randint(1, 5),
                        input_data={},
                    )
                    db.add(new_task)
                    await db.flush()
                    db.add(LogEntry(
                        task_id=new_task.id, level="info",
                        message=random.choice(LOG_MSGS["queued"]),
                    ))

                # 5. Every 10 ticks: fire an alert
                if tick % 10 == 0:
                    db.add(Alert(
                        type="demo_event",
                        severity=random.choice(["info", "warning", "critical"]),
                        message=random.choice([
                            "Agent memory usage above threshold",
                            "Task failure rate spike detected",
                            "Daily cost approaching budget limit",
                            "New agent registered in fleet",
                        ]),
                        acknowledged=False,
                    ))

                await db.commit()

    except asyncio.CancelledError:
        app.state.demo_running = False
```

**Step 2: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add backend/app/routers/demo.py
git commit -m "feat(demo): implement async simulation loop"
```

---

### Task A3: Frontend demo toggle

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`

**Step 1: Add devApi demo methods to `api/client.ts`**

Find the `devApi` export and add three methods:
```typescript
export const devApi = {
  seed: () => request<{ created: { agents: number; tasks: number; logs: number } }>('/api/seed', { method: 'POST' }),
  demoStart: () => request<{ status: string }>('/api/demo/start', { method: 'POST' }),
  demoStop:  () => request<{ status: string }>('/api/demo/stop',  { method: 'POST' }),
  demoStatus: () => request<{ running: boolean; tick: number }>('/api/demo/status'),
};
```

**Step 2: Add Demo Mode toggle to `Dashboard.tsx`**

In Dashboard.tsx, add these imports at the top:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// (already present — just add devApi to the import from @/api/client)
import { dashboardApi, devApi } from '@/api/client';
```

Add a demo status query + mutations near the top of the component:
```typescript
const { data: demoStatus } = useQuery({
  queryKey: ['demo-status'],
  queryFn: devApi.demoStatus,
  refetchInterval: 5000,
});

const demoStartMutation = useMutation({
  mutationFn: devApi.demoStart,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['demo-status'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  },
});

const demoStopMutation = useMutation({
  mutationFn: devApi.demoStop,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['demo-status'] }),
});

const isDemo = demoStatus?.running ?? false;
```

In the Dashboard header JSX (next to the "Seed Demo Data" button), add:
```tsx
<button
  className={`mc-btn text-xs flex items-center gap-2 ${
    isDemo
      ? 'bg-mc-accent-green/20 text-mc-accent-green hover:bg-mc-accent-green/30'
      : 'mc-btn-secondary'
  }`}
  onClick={() => isDemo ? demoStopMutation.mutate() : demoStartMutation.mutate()}
  disabled={demoStartMutation.isPending || demoStopMutation.isPending}
>
  {isDemo && (
    <span className="w-2 h-2 rounded-full bg-mc-accent-green animate-pulse" />
  )}
  {isDemo ? 'Stop Demo' : '▶ Demo Mode'}
</button>
```

**Step 3: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/api/client.ts frontend/src/pages/Dashboard.tsx
git commit -m "feat(demo): frontend demo mode toggle with live pulse indicator"
```

---

## TRACK B — Power-User Polish

### Task B1: Keyboard shortcuts hook

**Files:**
- Create: `frontend/src/hooks/useKeyboardShortcuts.ts`

**Step 1: Create the hook**

```typescript
// frontend/src/hooks/useKeyboardShortcuts.ts
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcut handler.
 *
 * Chord sequences (press g, then second key within 1s):
 *   g d → /dashboard
 *   g a → /agents
 *   g t → /tasks
 *   g l → /logs
 *   g c → /costs
 *   g x → /alerts
 *
 * Two-key sequences:
 *   n t → /tasks/create
 *
 * Single keys:
 *   ? → open shortcuts overlay (calls onShowShortcuts)
 *   Escape → close any overlay (calls onEscape)
 *   Ctrl+K / Cmd+K → open command palette (calls onCommandPalette)
 */
export function useKeyboardShortcuts(callbacks: {
  onShowShortcuts: () => void;
  onEscape: () => void;
  onCommandPalette: () => void;
}) {
  const navigate = useNavigate();
  const pendingChord = useRef<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearChord() {
      pendingChord.current = null;
      if (chordTimer.current) clearTimeout(chordTimer.current);
    }

    function handler(e: KeyboardEvent) {
      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;

      const key = e.key.toLowerCase();

      // Ctrl+K / Cmd+K → command palette
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        callbacks.onCommandPalette();
        return;
      }

      // Escape
      if (key === 'escape') {
        callbacks.onEscape();
        clearChord();
        return;
      }

      // ? → shortcuts overlay
      if (key === '?' && !e.ctrlKey && !e.metaKey) {
        callbacks.onShowShortcuts();
        clearChord();
        return;
      }

      // Handle chord: waiting for second key
      if (pendingChord.current === 'g') {
        clearChord();
        const routes: Record<string, string> = {
          d: '/', a: '/agents', t: '/tasks',
          l: '/logs', c: '/costs', x: '/alerts',
        };
        if (routes[key]) { navigate(routes[key]); }
        return;
      }
      if (pendingChord.current === 'n') {
        clearChord();
        if (key === 't') navigate('/tasks/create');
        return;
      }

      // Start chord
      if (key === 'g' || key === 'n') {
        pendingChord.current = key;
        chordTimer.current = setTimeout(clearChord, 1000);
      }
    }

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearChord();
    };
  }, [navigate, callbacks]);
}
```

**Step 2: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/hooks/useKeyboardShortcuts.ts
git commit -m "feat(shortcuts): keyboard shortcut hook with chord sequences"
```

---

### Task B2: Shortcuts overlay component

**Files:**
- Create: `frontend/src/components/ShortcutsOverlay.tsx`

**Step 1: Create component**

```tsx
// frontend/src/components/ShortcutsOverlay.tsx
interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['g', 'd'], description: 'Go to Dashboard' },
  { keys: ['g', 'a'], description: 'Go to Agents' },
  { keys: ['g', 't'], description: 'Go to Tasks' },
  { keys: ['g', 'l'], description: 'Go to Logs' },
  { keys: ['g', 'c'], description: 'Go to Costs' },
  { keys: ['g', 'x'], description: 'Go to Alerts' },
  { keys: ['n', 't'], description: 'New Task' },
  { keys: ['⌘K'], description: 'Command Palette' },
  { keys: ['?'], description: 'Show Shortcuts' },
  { keys: ['Esc'], description: 'Close / Cancel' },
];

export default function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mc-bg-secondary border border-mc-border-primary rounded-xl p-6 w-80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-mc-text-primary">Keyboard Shortcuts</h3>
          <button className="text-mc-text-muted hover:text-mc-text-primary" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-mc-text-secondary">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <span key={j} className="bg-mc-bg-tertiary border border-mc-border-primary rounded px-1.5 py-0.5 font-mono text-mc-text-primary text-[10px]">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-mc-text-muted mt-4 text-center">
          Press <span className="font-mono bg-mc-bg-tertiary px-1 rounded">?</span> to toggle this overlay
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/components/ShortcutsOverlay.tsx
git commit -m "feat(shortcuts): shortcuts reference overlay component"
```

---

### Task B3: Command palette component

**Files:**
- Create: `frontend/src/components/CommandPalette.tsx`

**Step 1: Create component**

```tsx
// frontend/src/components/CommandPalette.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  route: string;
  icon: string;
}

const STATIC_PAGES: PaletteItem[] = [
  { id: 'dash',    label: 'Dashboard',   icon: '▤',  route: '/' },
  { id: 'agents',  label: 'Agents',      icon: '◈',  route: '/agents' },
  { id: 'tasks',   label: 'Tasks',       icon: '✓',  route: '/tasks' },
  { id: 'logs',    label: 'Logs',        icon: '≡',  route: '/logs' },
  { id: 'costs',   label: 'Costs',       icon: '$',  route: '/costs' },
  { id: 'alerts',  label: 'Alerts',      icon: '⚠',  route: '/alerts' },
  { id: 'newtask', label: 'New Task',    icon: '+',  route: '/tasks/create' },
  { id: 'settings',label: 'Settings',   icon: '⚙',  route: '/settings' },
];

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pull agents and tasks from query cache (no extra API calls)
  const agentData = queryClient.getQueryData<{ agents: { id: string; name: string; type: string }[] }>(['agents']);
  const taskData = queryClient.getQueryData<{ tasks: { id: string; title: string; status: string }[] }>(['tasks', undefined, undefined, 0]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const items: PaletteItem[] = useMemo(() => {
    const agentItems: PaletteItem[] = (agentData?.agents ?? []).map((a) => ({
      id: `agent-${a.id}`, label: a.name, sub: a.type,
      icon: '◈', route: `/agents/${a.id}`,
    }));
    const taskItems: PaletteItem[] = (taskData?.tasks ?? []).map((t) => ({
      id: `task-${t.id}`, label: t.title, sub: t.status,
      icon: '✓', route: `/tasks/${t.id}`,
    }));
    const all = [...STATIC_PAGES, ...agentItems, ...taskItems];
    if (!query.trim()) return STATIC_PAGES;
    const q = query.toLowerCase();
    return all.filter((i) =>
      i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)
    );
  }, [query, agentData, taskData]);

  useEffect(() => setSelected(0), [query]);

  function pick(item: PaletteItem) {
    navigate(item.route);
    onClose();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && items[selected]) pick(items[selected]);
    if (e.key === 'Escape') onClose();
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mc-bg-secondary border border-mc-border-primary rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-mc-border-primary">
          <span className="text-mc-text-muted text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, agents, tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-sm text-mc-text-primary placeholder-mc-text-muted focus:outline-none"
          />
          {query && (
            <button className="text-mc-text-muted hover:text-mc-text-primary text-xs" onClick={() => setQuery('')}>✕</button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="text-mc-text-muted text-xs text-center py-6">No results for "{query}"</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected ? 'bg-mc-accent-blue/10 text-mc-text-primary' : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                }`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => pick(item)}
              >
                <span className="text-mc-text-muted w-4 flex-shrink-0 text-center">{item.icon}</span>
                <span className="text-sm flex-1 truncate">{item.label}</span>
                {item.sub && (
                  <span className="text-[10px] text-mc-text-muted bg-mc-bg-tertiary px-1.5 py-0.5 rounded font-mono">
                    {item.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-mc-border-primary flex items-center gap-4 text-[10px] text-mc-text-muted">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/components/CommandPalette.tsx
git commit -m "feat(palette): command palette with agent+task search from cache"
```

---

### Task B4: Wire shortcuts + palette into Layout

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

**Step 1: Read current Layout.tsx imports section**

Locate the imports block at top of `frontend/src/components/Layout.tsx`.

**Step 2: Add imports**

```typescript
import { useState, useCallback } from 'react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ShortcutsOverlay from '@/components/ShortcutsOverlay';
import CommandPalette from '@/components/CommandPalette';
```

Note: `useState` may already be imported — deduplicate.

**Step 3: Add state + hook inside Layout component body**

```typescript
const [showShortcuts, setShowShortcuts] = useState(false);
const [showPalette, setShowPalette] = useState(false);

const shortcutCallbacks = useCallback(() => ({
  onShowShortcuts: () => setShowShortcuts((v) => !v),
  onEscape: () => { setShowShortcuts(false); setShowPalette(false); },
  onCommandPalette: () => setShowPalette((v) => !v),
}), []);

useKeyboardShortcuts(shortcutCallbacks());
```

**Step 4: Add ⌘K hint to top nav and render overlay components**

In the nav bar area, add a subtle hint button:
```tsx
<button
  className="hidden md:flex items-center gap-2 text-xs text-mc-text-muted bg-mc-bg-secondary border border-mc-border-primary rounded px-2 py-1 hover:border-mc-accent-blue transition-colors"
  onClick={() => setShowPalette(true)}
>
  <span>⌘K</span>
</button>
```

At the bottom of the Layout return, before closing `</div>`, add:
```tsx
<ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
<CommandPalette open={showPalette} onClose={() => setShowPalette(false)} />
```

**Step 5: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/components/Layout.tsx
git commit -m "feat(shortcuts): wire keyboard shortcuts + command palette into Layout"
```

---

## TRACK C — Data Utility Features

### Task C1: Backend CSV export router

**Files:**
- Create: `backend/app/routers/export.py`
- Modify: `backend/app/main.py`

**Step 1: Create export router**

```python
# backend/app/routers/export.py
"""
CSV export endpoints.
GET /api/export/tasks.csv
GET /api/export/logs.csv
"""
import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.task import Task
from app.models.log_entry import LogEntry

router = APIRouter()


@router.get("/api/export/tasks.csv")
async def export_tasks(
    status: str | None = Query(None),
    agent_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).order_by(Task.created_at.desc())
    if status:
        query = query.where(Task.status == status)
    if agent_id:
        from uuid import UUID
        query = query.where(Task.agent_id == UUID(agent_id))

    result = await db.execute(query)
    tasks = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "title", "status", "priority", "agent_id",
                     "cost_usd", "tokens_used", "created_at", "completed_at", "error_message"])
    for t in tasks:
        writer.writerow([
            str(t.id), t.title, t.status, t.priority,
            str(t.agent_id) if t.agent_id else "",
            t.cost, t.tokens_used,
            t.created_at.isoformat() if t.created_at else "",
            t.completed_at.isoformat() if t.completed_at else "",
            t.error_message or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tasks.csv"},
    )


@router.get("/api/export/logs.csv")
async def export_logs(
    level: str | None = Query(None),
    agent_id: str | None = Query(None),
    task_id: str | None = Query(None),
    limit: int = Query(default=1000, le=5000),
    db: AsyncSession = Depends(get_db),
):
    query = select(LogEntry).order_by(LogEntry.timestamp.desc()).limit(limit)
    if level:
        query = query.where(LogEntry.level == level)
    if agent_id:
        from uuid import UUID
        query = query.where(LogEntry.agent_id == UUID(agent_id))
    if task_id:
        from uuid import UUID
        query = query.where(LogEntry.task_id == UUID(task_id))

    result = await db.execute(query)
    logs = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "level", "message", "agent_id", "task_id"])
    for l in logs:
        writer.writerow([
            str(l.id),
            l.timestamp.isoformat() if l.timestamp else "",
            l.level, l.message,
            str(l.agent_id) if l.agent_id else "",
            str(l.task_id) if l.task_id else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=logs.csv"},
    )
```

**Step 2: Register in main.py**

```python
from app.routers import agents, tasks, logs, costs, health, approvals, alerts, dashboard, seed, demo, export
# ...
app.include_router(export.router, tags=["Export"])
```

**Step 3: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add backend/app/routers/export.py backend/app/main.py
git commit -m "feat(export): CSV export endpoints for tasks and logs"
```

---

### Task C2: Backend cost analytics by agent

**Files:**
- Modify: `backend/app/routers/costs.py`

**Step 1: Add `by-agent` endpoint**

Add this route to `costs.py` (before the `/{record_id}` route if one exists, or at end):

```python
@router.get("/by-agent")
async def costs_by_agent(db: AsyncSession = Depends(get_db)):
    """Cost breakdown grouped by agent, sorted by total cost desc."""
    from app.models.agent import Agent
    from sqlalchemy import case

    result = await db.execute(
        select(
            CostRecord.agent_id,
            Agent.name.label("agent_name"),
            func.sum(CostRecord.cost_usd).label("total_usd"),
            func.count(CostRecord.id).label("record_count"),
            func.sum(CostRecord.input_tokens).label("input_tokens"),
            func.sum(CostRecord.output_tokens).label("output_tokens"),
        )
        .join(Agent, Agent.id == CostRecord.agent_id, isouter=True)
        .where(CostRecord.agent_id.isnot(None))
        .group_by(CostRecord.agent_id, Agent.name)
        .order_by(func.sum(CostRecord.cost_usd).desc())
    )
    rows = result.all()

    grand_total = sum(r.total_usd for r in rows) or 1.0  # avoid /0

    return [
        {
            "agent_id": str(r.agent_id),
            "agent_name": r.agent_name or "Unknown",
            "total_usd": round(r.total_usd, 6),
            "record_count": r.record_count,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "pct_of_total": round((r.total_usd / grand_total) * 100, 1),
        }
        for r in rows
    ]
```

**Step 2: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add backend/app/routers/costs.py
git commit -m "feat(costs): add /api/costs/by-agent breakdown endpoint"
```

---

### Task C3: Frontend export buttons

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Tasks.tsx`
- Modify: `frontend/src/pages/Logs.tsx`

**Step 1: Add exportApi to client.ts**

```typescript
// Add after costsApi export
export const exportApi = {
  tasksUrl: (params?: { status?: string; agent_id?: string }): string => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.agent_id) sp.set('agent_id', params.agent_id);
    const qs = sp.toString();
    return `${BASE}/api/export/tasks.csv${qs ? `?${qs}` : ''}`;
  },
  logsUrl: (params?: { level?: string; agent_id?: string; task_id?: string }): string => {
    const BASE = import.meta.env.VITE_API_URL || '';
    const sp = new URLSearchParams();
    if (params?.level) sp.set('level', params.level);
    if (params?.agent_id) sp.set('agent_id', params.agent_id);
    if (params?.task_id) sp.set('task_id', params.task_id);
    const qs = sp.toString();
    return `${BASE}/api/export/logs.csv${qs ? `?${qs}` : ''}`;
  },
};
```

Note: returning URL strings (not fetch calls) — the frontend uses `<a href>` download, not fetch.

**Step 2: Add export button to Tasks.tsx**

In the Tasks page header button row (next to "+ New Task"):

```tsx
import { exportApi } from '@/api/client';

// In JSX, add after the New Task button:
<a
  href={exportApi.tasksUrl({ status: filterStatus, agent_id: filterAgent })}
  download="tasks.csv"
  className="mc-btn-secondary text-xs flex items-center gap-1"
>
  ⬇ CSV
</a>
```

**Step 3: Add export button to Logs.tsx**

Find the Logs page header filter area and add:

```tsx
import { exportApi } from '@/api/client';

// After existing filter controls:
<a
  href={exportApi.logsUrl({ level: filterLevel || undefined, agent_id: filterAgentId || undefined })}
  download="logs.csv"
  className="mc-btn-secondary text-xs flex items-center gap-1"
>
  ⬇ CSV
</a>
```

**Step 4: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/api/client.ts frontend/src/pages/Tasks.tsx frontend/src/pages/Logs.tsx
git commit -m "feat(export): CSV download buttons on Tasks and Logs pages"
```

---

### Task C4: Cost analytics bar chart

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/Costs.tsx`

**Step 1: Add costsApi.byAgent() to client.ts**

In the `costsApi` object, add:
```typescript
byAgent: () => request<Array<{
  agent_id: string; agent_name: string; total_usd: number;
  record_count: number; pct_of_total: number;
}>>('/api/costs/by-agent'),
```

**Step 2: Add SVG bar chart to Costs.tsx**

Add a new component at the top of Costs.tsx (before the default export):

```tsx
import { useQuery } from '@tanstack/react-query';
import { costsApi } from '@/api/client';

function CostByAgentChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['costs-by-agent'],
    queryFn: costsApi.byAgent,
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="h-32 bg-mc-bg-tertiary rounded animate-pulse" />;
  if (!data || data.length === 0) return (
    <p className="text-mc-text-muted text-xs text-center py-4">No cost data by agent yet.</p>
  );

  const maxUsd = Math.max(...data.map(d => d.total_usd));

  return (
    <div className="mc-card">
      <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Cost by Agent</h3>
      <div className="space-y-3">
        {data.map((row) => {
          const pct = maxUsd > 0 ? (row.total_usd / maxUsd) * 100 : 0;
          return (
            <div key={row.agent_id} className="flex items-center gap-3">
              <span className="text-xs text-mc-text-muted w-32 truncate flex-shrink-0 text-right">
                {row.agent_name}
              </span>
              <div className="flex-1 h-5 bg-mc-bg-tertiary rounded overflow-hidden">
                <div
                  className="h-full bg-mc-accent-amber/70 rounded transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-mc-accent-amber w-16 text-right flex-shrink-0">
                ${row.total_usd.toFixed(4)}
              </span>
              <span className="text-[10px] text-mc-text-muted w-8 flex-shrink-0">
                {row.pct_of_total}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Then in the Costs page JSX, add `<CostByAgentChart />` after the existing sparkline card.

**Step 5: Commit**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git add frontend/src/api/client.ts frontend/src/pages/Costs.tsx
git commit -m "feat(costs): cost-by-agent horizontal bar chart"
```

---

## Final Steps (after all tracks complete)

### Task FINAL: Merge, push, deploy

**Step 1: Verify worktree commits**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git log --oneline -12
```

**Step 2: Merge to master**

```bash
cd /c/Z_projects/MissionControl
git merge claude/gracious-colden --no-ff -m "feat: Phase 16 - demo engine, keyboard shortcuts, CSV export, cost analytics"
git push origin master
```

**Step 3: Deploy backend (has new routes)**

```bash
RAILWAY_TOKEN=83bae020-57e1-4fc4-849e-4fe77ecae1d7 railway up --service backend --detach
```

**Step 4: Deploy frontend**

```bash
RAILWAY_TOKEN=83bae020-57e1-4fc4-849e-4fe77ecae1d7 railway up --service frontend --detach
```

**Step 5: Verify**

```bash
curl -s https://backend-production-a6b7.up.railway.app/api/demo/status
# Expected: {"running":false,"tick":0}

curl -s "https://backend-production-a6b7.up.railway.app/api/export/tasks.csv" | head -2
# Expected: id,title,status,...
```
