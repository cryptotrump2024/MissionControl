# Mission Control

Enterprise-grade AI agent observability and management dashboard. Monitor agents, track tasks, stream real-time logs, and manage costs — all in one place.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + PostgreSQL (asyncpg) + Redis |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Agents | Anthropic Claude (CEO, Researcher, Writer, Developer, Auditor) |
| Infra | Docker Compose (local), Railway (cloud) |

## Local Development

### Prerequisites

- Docker + Docker Compose
- Anthropic API key

### Start

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and JWT_SECRET
make dev
```

| Service | URL |
|---|---|
| Frontend dashboard | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |

### Useful commands

```bash
make seed        # Seed demo data
make agents      # Start all AI agents
make stop        # Stop all services
make clean       # Fresh database (destroys data)
make migrate     # Run database migrations
```

## Deploy to Railway

### Architecture

```
┌─────────────────────────────────────────────────┐
│                 Railway Cloud                    │
│                                                  │
│  ┌────────────┐      ┌────────────┐             │
│  │  Frontend  │─────▶│  Backend   │             │
│  │ React/Vite │      │  FastAPI   │             │
│  │  nginx:80  │      │ Port $PORT │             │
│  └────────────┘      └─────┬──────┘             │
│                            │                     │
│                   ┌────────┴───────┐            │
│                   │                │             │
│            ┌──────▼─────┐  ┌──────▼─────┐      │
│            │ PostgreSQL  │  │   Redis    │      │
│            │  (plugin)   │  │  (plugin)  │      │
│            └────────────┘  └────────────┘      │
└─────────────────────────────────────────────────┘
```

### Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Add **PostgreSQL** plugin — Railway auto-sets `DATABASE_URL` on your services
3. Add **Redis** plugin — Railway auto-sets `REDIS_URL` on your services

### Step 2 — Deploy Backend

1. **New Service** → GitHub → select this repo
2. Set **Root Directory**: `backend`
3. Set these environment variables:

| Variable | Value |
|---|---|
| `JWT_SECRET` | Run `openssl rand -hex 32` and paste the output |
| `CORS_ORIGINS` | Your frontend Railway URL (add after Step 3) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### Step 3 — Deploy Frontend

1. **New Service** → GitHub → select this repo
2. Set **Root Directory**: `frontend`
3. Set these environment variables:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-backend-service>.railway.app` |
| `VITE_WS_URL` | `wss://<your-backend-service>.railway.app` |

### Step 4 — Wire CORS

Go back to your **backend service** and set:
```
CORS_ORIGINS=https://<your-frontend-service>.railway.app
```
Redeploy backend. Done.

### Step 5 — Verify

- Open your frontend Railway URL on your phone
- Check the status indicator in the top bar — it should show green (WebSocket connected)
- Navigate to Dashboard → you should see the command center

## Environment Variables Reference

### Backend

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Auto (plugin) | PostgreSQL connection string |
| `REDIS_URL` | Auto (plugin) | Redis connection string |
| `JWT_SECRET` | Yes | Random 32+ char secret for JWT signing |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `ANTHROPIC_API_KEY` | For agents | Anthropic API key |
| `LOG_LEVEL` | No | `INFO` (default) |

### Frontend

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes | Backend HTTPS URL |
| `VITE_WS_URL` | Yes | Backend WSS URL |
