# Phase 16 Design: Demo Engine, Power-User Polish, Data Utilities

**Date:** 2026-03-07
**Approach:** Parallel subagents (A, B, C independent)

---

## A — Live Demo Simulation Engine

### Backend
- `POST /api/demo/start` — launches asyncio background loop (stores handle in `app.state.demo_task`)
- `POST /api/demo/stop` — cancels the loop
- `GET /api/demo/status` — returns `{ running: bool, tick: int }`
- Loop cadence: every 3–5s, one tick:
  1. Ensure 5 demo agents exist (idempotent)
  2. Create a new task (random title from pool) or advance existing queued→running
  3. Advance a running task → completed (80%) or failed (20%)
  4. Write 1–3 log entries for the transition
  5. Write a cost record (random $0.001–$0.05)
  6. Every 10 ticks: fire a random alert
- New router: `backend/app/routers/demo.py`, registered in `main.py`

### Frontend
- `devApi.demoStart()`, `devApi.demoStop()`, `devApi.demoStatus()` in `api/client.ts`
- Dashboard header: "Demo Mode" toggle button
  - Green pulsing dot when active (`animate-pulse`)
  - Polls `demoStatus` every 5s to sync state on refresh

---

## B — Power-User Polish

### Keyboard Shortcuts
- `frontend/src/hooks/useKeyboardShortcuts.ts`
  - Chord: `g` then `d/a/t/l/c/x` within 1s → navigate to route
  - Single: `?` → show shortcuts overlay, `Escape` → close overlays
  - `n t` → navigate to `/tasks/create`
- Mounted in `Layout.tsx`
- `frontend/src/components/ShortcutsOverlay.tsx` — full-screen dim + centered reference card

### Command Palette
- `frontend/src/components/CommandPalette.tsx`
  - Triggered by `Ctrl+K` / `Cmd+K`
  - Reads agents + tasks from TanStack Query cache (no new API calls)
  - Fuzzy filter on name/title as user types
  - Arrow keys + Enter to navigate, Escape to close
  - Default: 5 recently visited pages
- State: simple `useState` in Layout, no new store needed

---

## C — Data Utility Features

### CSV Export
- `backend/app/routers/export.py`
  - `GET /api/export/tasks.csv` — query params: `status`, `agent_id`
  - `GET /api/export/logs.csv` — query params: `level`, `agent_id`, `task_id`
  - Returns `StreamingResponse` with `text/csv` content-type, `Content-Disposition: attachment`
- Frontend: `exportApi.tasks(params)` and `exportApi.logs(params)` — returns URL string
- Tasks page: "⬇ CSV" button (small, secondary, next to "+ New Task")
- Logs page: same pattern

### Cost Analytics by Agent
- `GET /api/costs/by-agent` — groups `CostRecord` by `agent_id`, joins agent name
  - Returns `[{ agent_id, agent_name, total_usd, record_count, pct_of_total }]`
- `frontend/src/pages/Costs.tsx` — new SVG bar chart below the sparkline
  - Horizontal bars, sorted by cost descending, agent name labels on left
  - Same no-dependency SVG approach as existing sparkline

---

## Files Touched

| Area | New Files | Modified Files |
|------|-----------|----------------|
| A | `backend/app/routers/demo.py` | `main.py`, `api/client.ts`, `Dashboard.tsx` |
| B | `hooks/useKeyboardShortcuts.ts`, `components/ShortcutsOverlay.tsx`, `components/CommandPalette.tsx` | `Layout.tsx` |
| C | `backend/app/routers/export.py` | `main.py`, `api/client.ts`, `Tasks.tsx`, `Logs.tsx`, `Costs.tsx` |

## Constraints
- No new npm packages
- No new Python packages (use stdlib `csv` module)
- All SVG charts use inline SVG (no chart library)
- Export via native `<a href>` download, not Blob/FileReader
