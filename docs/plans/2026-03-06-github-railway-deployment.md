# GitHub Upload + Railway Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Commit all existing MissionControl code to GitHub and deploy backend + frontend as separate Railway services with Postgres and Redis plugins.

**Architecture:** Two Railway services (FastAPI backend, Vite static frontend) connected via environment variables. Railway Postgres plugin injects `DATABASE_URL`; backend converts it from `postgresql://` to `postgresql+asyncpg://` at startup. Frontend reads `VITE_API_URL`/`VITE_WS_URL` at build time.

**Tech Stack:** FastAPI, React/Vite/TypeScript, PostgreSQL (asyncpg), Redis, Railway, Docker, Alembic

---

## Task 1: Fix `backend/alembic/env.py` — read DATABASE_URL from environment

**Files:**
- Modify: `backend/alembic/env.py`

**Step 1: Add env override before migrations run**

Replace the top of `env.py` with an env-aware URL resolver. After `config = context.config`, add:

```python
import os

def _get_url() -> str:
    url = os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
    # Railway injects postgresql://, asyncpg needs postgresql+asyncpg://
    if url and url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url
```

Then replace `config.get_main_option("sqlalchemy.url")` calls in both `run_migrations_offline` and `run_async_migrations` with `_get_url()`.

For `run_async_migrations`, instead of using `async_engine_from_config`, build the engine directly:
```python
from sqlalchemy.ext.asyncio import create_async_engine

async def run_async_migrations() -> None:
    connectable = create_async_engine(_get_url(), poolclass=pool.NullPool)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()
```

**Step 2: Verify no syntax errors**
```bash
cd C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden\backend && python -c "import ast; ast.parse(open('alembic/env.py').read()); print('OK')"
```
Expected: `OK`

**Step 3: Commit**
```bash
git add backend/alembic/env.py
git commit -m "fix: alembic reads DATABASE_URL from environment for Railway"
```

---

## Task 2: Fix `backend/app/config.py` — Railway DATABASE_URL format

**Files:**
- Modify: `backend/app/config.py`

**Step 1: Add field_validator to normalize DATABASE_URL**

The `Settings` class needs a validator so Railway's `postgresql://` URL is converted to `postgresql+asyncpg://`:

```python
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://mc_user:mc_password@localhost:5432/mission_control"

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_db_url(cls, v: str) -> str:
        if v and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # ... rest unchanged
```

**Step 2: Verify**
```bash
cd C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden\backend && python -c "from app.config import get_settings; print('OK')"
```
Expected: `OK`

**Step 3: Commit**
```bash
git add backend/app/config.py
git commit -m "fix: normalize Railway postgresql:// URL to postgresql+asyncpg://"
```

---

## Task 3: Fix `backend/Dockerfile` — production-ready

**Files:**
- Modify: `backend/Dockerfile`

**Step 1: Replace CMD with production startup**

Railway injects a `PORT` environment variable. Remove `--reload`, use `$PORT`, and run migrations before starting:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

**Step 2: Commit**
```bash
git add backend/Dockerfile
git commit -m "fix: production Dockerfile - run migrations, use \$PORT, no --reload"
```

---

## Task 4: Replace `frontend/Dockerfile` — production build

**Files:**
- Modify: `frontend/Dockerfile`

**Step 1: Multi-stage production build**

Railway will build this Dockerfile. Stage 1 builds the Vite app (with `VITE_API_URL` injected as a build arg / env var). Stage 2 serves with nginx:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build args for Railway (set as env vars on the service)
ARG VITE_API_URL=http://localhost:8000
ARG VITE_WS_URL=ws://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing — all paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Step 3: Commit**
```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: production frontend Dockerfile with nginx, multi-stage build"
```

---

## Task 5: Create `railway.toml`

**Files:**
- Create: `railway.toml`

**Step 1: Write railway.toml**

```toml
# Railway deployment configuration
# Docs: https://docs.railway.app/reference/config-as-code

[build]
builder = "dockerfile"

# ── Backend Service ──────────────────────────────────────────────────
# Deploy this section as service "backend" pointing to /backend directory
# Required env vars (set in Railway dashboard):
#   DATABASE_URL  — auto-set by Railway Postgres plugin
#   REDIS_URL     — auto-set by Railway Redis plugin
#   JWT_SECRET    — generate with: openssl rand -hex 32
#   CORS_ORIGINS  — set to frontend Railway URL after deploy
#   ANTHROPIC_API_KEY — your Anthropic API key

# ── Frontend Service ─────────────────────────────────────────────────
# Deploy this section as service "frontend" pointing to /frontend directory
# Required env vars (set in Railway dashboard):
#   VITE_API_URL  — set to backend Railway URL after deploy
#   VITE_WS_URL   — set to backend Railway URL (wss://) after deploy
```

> Note: Railway doesn't use a single `railway.toml` to define multiple services from one repo.
> Each service is configured separately in the Railway dashboard pointing to its subdirectory.
> The `railway.toml` in each subdirectory controls build/deploy for that service.

**Step 1 (revised): Create per-service railway.toml files**

`backend/railway.toml`:
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

`frontend/railway.toml`:
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Step 2: Commit**
```bash
git add backend/railway.toml frontend/railway.toml
git commit -m "feat: add Railway deployment config for backend and frontend services"
```

---

## Task 6: Create `README.md` with Railway deployment instructions

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
# Mission Control

Enterprise-grade AI agent observability and management dashboard. Monitor agents, track tasks, stream logs, and manage costs in real time.

## Stack

- **Backend**: FastAPI + PostgreSQL (asyncpg) + Redis
- **Frontend**: React 18 + Vite + TypeScript + Tailwind
- **Agents**: Anthropic Claude (CEO, Researcher, Writer, Developer, Auditor)
- **Infra**: Docker Compose (local), Railway (cloud)

## Local Development

### Prerequisites
- Docker + Docker Compose
- Anthropic API key

### Start

```bash
cp .env.example .env
# Edit .env — add ANTHROPIC_API_KEY and JWT_SECRET
make dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

### Seed demo data

```bash
make seed
```

### Start agents

```bash
make agents
```

## Deploy to Railway

### 1. Create Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Add **Postgres** plugin → copies `DATABASE_URL` to your services
3. Add **Redis** plugin → copies `REDIS_URL` to your services

### 2. Deploy Backend

1. New Service → GitHub → select this repo → **Root Directory: `backend`**
2. Set environment variables:
   | Variable | Value |
   |---|---|
   | `JWT_SECRET` | `openssl rand -hex 32` output |
   | `CORS_ORIGINS` | Your frontend Railway URL (after deploy) |
   | `ANTHROPIC_API_KEY` | Your Anthropic API key |

### 3. Deploy Frontend

1. New Service → GitHub → select this repo → **Root Directory: `frontend`**
2. Set environment variables:
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://<backend-service>.railway.app` |
   | `VITE_WS_URL` | `wss://<backend-service>.railway.app` |

### 4. Update CORS

After getting the frontend URL, go back to the backend service and set:
```
CORS_ORIGINS=https://<frontend-service>.railway.app
```

Then redeploy backend.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Railway Cloud                        │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │   Frontend   │───▶│   Backend    │                   │
│  │  (React/Vite)│    │  (FastAPI)   │                   │
│  │  nginx:80    │    │  Port $PORT  │                   │
│  └──────────────┘    └──────┬───────┘                   │
│                             │                            │
│                    ┌────────┴────────┐                  │
│                    │                 │                   │
│             ┌──────▼──────┐  ┌──────▼──────┐           │
│             │  PostgreSQL  │  │    Redis     │           │
│             │   (plugin)   │  │   (plugin)   │           │
│             └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────┘
```
```

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add README with local dev and Railway deployment instructions"
```

---

## Task 7: Commit all existing untracked code + push to GitHub

**Step 1: Stage all untracked files (except secrets)**

```bash
cd "C:\Z_projects\MissionControl\.claude\worktrees\gracious-colden"
git status
git add agents/ backend/ frontend/ docker-compose.yml Makefile scripts/ docs/ \
  "# Mission Control — Master Plan.md" \
  "# Ultimate Enterprise AI Agent Organization Blueprint v2.0.md" \
  "# Unified Orchestratio.md" \
  .env.example .pre-commit-config.yaml .secrets.wordlist
```

> **Never add `.env`** — it contains real secrets and is already in `.gitignore`.

**Step 2: Commit**
```bash
git commit -m "feat: initial MissionControl MVP - backend, frontend, agents, docker"
```

**Step 3: Verify remote**
```bash
git remote -v
```
Expected: shows `origin https://github.com/cryptotrump2024/MissionControl`

If not set:
```bash
git remote add origin https://github.com/cryptotrump2024/MissionControl.git
```

**Step 4: Push branch**
```bash
git push -u origin claude/gracious-colden
```

**Step 5: Create PR to main**
```bash
gh pr create \
  --title "feat: initial MVP + Railway deployment config" \
  --body "Adds full MissionControl MVP (backend, frontend, agents) plus Railway deployment configuration for cloud access." \
  --base main
```

---

## Post-Deployment Checklist

After Railway is configured:
- [ ] Backend service health check passes: `GET /api/health`
- [ ] Frontend loads in browser
- [ ] WebSocket connects (status indicator shows green in dashboard)
- [ ] Run seed: `POST /api/seed` or `make seed` against Railway backend URL
- [ ] Update `CORS_ORIGINS` on backend with frontend URL
- [ ] Update `VITE_API_URL`/`VITE_WS_URL` on frontend with backend URL, redeploy
