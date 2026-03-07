# Phase 17 Design — Mobile Responsiveness + Configurable Settings + Task Templates

**Date:** 2026-03-07
**Status:** Approved

---

## Overview

Three independent tracks that make MissionControl usable on a phone and configurable for real production use.

- **Track A:** Mobile-responsive layout — hamburger nav, collapsible sidebar, responsive tables
- **Track B:** Configurable settings — editable daily budget (persisted to DB), webhook URL for alert delivery
- **Track C:** Task templates — save/load task configs from a template library

---

## Track A — Mobile-Responsive Layout

### Problem
`Layout.tsx` renders a fixed `w-60` sidebar at all screen sizes. On a phone the sidebar consumes ~85% of the viewport. No hamburger menu. Tables overflow horizontally without truncation. Users cannot use the app on their phone.

### Design

**Layout.tsx changes:**
- Add `sidebarOpen` state (default `false` on mobile, `true` on desktop via `useMediaQuery('(min-width: 768px)')`)
- Hamburger button (☰) in top-nav bar visible only on `< md` breakpoints
- Sidebar becomes a drawer on mobile: `fixed inset-y-0 left-0 z-40 transform transition-transform` — slides in/out
- Backdrop overlay (`fixed inset-0 bg-black/50 z-30`) closes sidebar on tap
- Sidebar auto-closes on navigation (`useEffect` on `location.pathname`)

**Nav items:** unchanged, just wrapped in the responsive container.

**Tables (Tasks.tsx, Logs.tsx, Agents.tsx):**
- Wrap in `overflow-x-auto` container
- Hide non-critical columns on mobile with `hidden sm:table-cell` — e.g., on Tasks hide "Created At", on Logs hide "Agent"
- Status badges and agent names get `max-w-[120px] truncate`

**Dashboard metric cards:**
- Change `grid-cols-4` → `grid-cols-2 sm:grid-cols-4`

**No bottom tab bar** — the sidebar drawer is sufficient; a bottom nav would require duplicating the entire nav tree.

### Files Changed
- `frontend/src/components/Layout.tsx` — drawer sidebar, hamburger, backdrop
- `frontend/src/pages/Tasks.tsx` — responsive table columns
- `frontend/src/pages/Logs.tsx` — responsive table columns
- `frontend/src/pages/Agents.tsx` — responsive table / card layout
- `frontend/src/pages/Dashboard.tsx` — responsive grid columns

---

## Track B — Configurable Settings

### Problem
Daily budget is hardcoded at `$1.00` in `backend/app/routers/costs.py`. Settings page has no editable fields. No way to configure a webhook URL for alert notifications.

### Design

**Backend — `GET/PUT /api/settings`:**
- New `AppSetting` model: `key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP`
- Alembic migration: creates `app_settings` table, seeds `{"daily_budget_usd": "1.00", "webhook_url": ""}`
- New `backend/app/routers/settings_api.py`:
  - `GET /api/settings` → returns all key-value pairs as `{key: value}` dict
  - `PUT /api/settings/{key}` → validates key is in allowed set, updates value
- `costs.py` reads budget from `app_settings` table instead of hardcoded `1.0`
- On alert creation (`alerts.py`), if `webhook_url` is set, fire `httpx.AsyncClient.post(url, json=alert_payload)` in a background task (fire-and-forget, no retry, logs failure only)

**Frontend — Settings.tsx:**
- Add `useQuery(['settings'], settingsApi.get)` + `useMutation(settingsApi.update)`
- "Daily Budget ($)" — number input field, save button, optimistic update
- "Webhook URL" — text input field, placeholder `https://hooks.slack.com/...`, test button fires `POST /api/settings/test-webhook`
- `POST /api/settings/test-webhook` sends a sample payload to configured URL — returns 200/error

**Validation:**
- Budget: min `0.01`, max `100.00`, 2 decimal places
- Webhook: must be empty or valid `https://` URL (regex validation both frontend + backend)

### Files Changed
- `backend/app/models/setting.py` — new SQLAlchemy model
- `backend/app/routers/settings_api.py` — new router (3 endpoints)
- `backend/app/routers/costs.py` — read budget from DB
- `backend/app/routers/alerts.py` — webhook delivery on new alert
- `backend/app/main.py` — register settings router
- `backend/alembic/versions/XXXX_add_app_settings.py` — migration
- `frontend/src/api/client.ts` — add `settingsApi`
- `frontend/src/pages/Settings.tsx` — editable fields

---

## Track C — Task Templates

### Problem
Every task is created from scratch via `/tasks/create`. There is no way to save a useful task configuration and reuse it. Power users creating recurring tasks (e.g., "weekly cost audit", "nightly research sweep") must retype everything.

### Design

**Backend — `/api/templates`:**
- New `TaskTemplate` model: `id UUID PK, name TEXT, description TEXT, agent_id UUID FK nullable, priority TEXT, payload JSONB, created_at TIMESTAMP`
- Alembic migration: creates `task_templates` table
- New `backend/app/routers/templates.py`:
  - `GET /api/templates` → list all templates
  - `POST /api/templates` → create template `{name, description, agent_id?, priority, payload?}`
  - `DELETE /api/templates/{id}` → delete
  - `POST /api/templates/{id}/apply` → create a new Task from template (calls task create logic), returns new task

**Frontend:**
- New `frontend/src/pages/Templates.tsx` — grid of template cards with name, description, agent badge, "Use" button, delete (×) button
- Nav item: "Templates" between Tasks and Logs (gear icon or bookmark icon)
- `TaskCreate.tsx` — add "Save as template" checkbox; if checked, also POST to `/api/templates` after task creation
- `Templates.tsx` → "Use" button: navigates to `/tasks/create?template=<id>`
- `TaskCreate.tsx` reads `?template=<id>` query param and pre-fills fields from template

**No inline editing of templates** — delete + recreate is sufficient for v1.

### Files Changed
- `backend/app/models/template.py` — new SQLAlchemy model
- `backend/app/routers/templates.py` — new router (4 endpoints)
- `backend/app/main.py` — register templates router
- `backend/alembic/versions/XXXX_add_task_templates.py` — migration
- `frontend/src/api/client.ts` — add `templatesApi`
- `frontend/src/pages/Templates.tsx` — new page
- `frontend/src/components/Layout.tsx` — nav item
- `frontend/src/pages/TaskCreate.tsx` — save-as-template + pre-fill from URL param

---

## Execution Strategy

All three tracks are independent — they touch different files and different DB tables. Execute in parallel with one subagent per track.

**Order of operations per track:**
1. Backend first (model → migration → router → main.py)
2. Frontend second (api client → page/component changes)

**Deployment:**
1. Merge worktree → master
2. `railway up --service backend --detach`
3. `railway up --service frontend --detach`
4. Verify: check mobile layout, POST to `/api/settings`, GET `/api/templates`
