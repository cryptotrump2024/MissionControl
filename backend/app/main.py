import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import get_settings
from app.database import async_session
from app.routers import agents, tasks, logs, costs, health, approvals, alerts, dashboard, seed, demo, export, settings_api, templates
from app.services.heartbeat import check_heartbeats
from app.services.alert_engine import check_alerts
from app.services.redis_client import get_redis, close_redis
from app.services.ws_manager import ws_manager

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mission Control",
    description="Enterprise AI Agent Orchestration Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_scheduler = AsyncIOScheduler()


async def _heartbeat_job() -> None:
    try:
        async with async_session() as db:
            await check_heartbeats(db, settings.heartbeat_timeout_seconds)
    except Exception as exc:
        logger.error("Heartbeat job failed: %s", exc, exc_info=True)


async def _alert_job() -> None:
    try:
        async with async_session() as db:
            await check_alerts(db)
    except Exception as exc:
        logger.error("Alert job failed: %s", exc, exc_info=True)


# Routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(agents.router, prefix="/api/agents", tags=["Agents"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])
app.include_router(costs.router, prefix="/api/costs", tags=["Costs"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Alerts"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(seed.router, tags=["Dev"])
app.include_router(demo.router, tags=["Demo"])
app.include_router(export.router, tags=["Export"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(templates.router, prefix="/api/templates", tags=["Templates"])


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong keepalive
            if data == "ping":
                await ws_manager.send_personal(websocket, "pong", {})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Mission Control starting up...")
    # Warm up Redis — fail fast if Redis is unreachable
    try:
        await get_redis().ping()
        logger.info("Redis connection OK")
    except Exception as exc:
        logger.critical("Redis unreachable at startup: %s", exc)
        raise
    # Schedule background jobs
    _scheduler.add_job(_heartbeat_job, "interval", seconds=30, id="heartbeat")
    _scheduler.add_job(
        _alert_job,
        "interval",
        seconds=settings.alert_check_interval_seconds,
        id="alerts",
    )
    _scheduler.start()
    logger.info(
        "Background services started (heartbeat=30s, alerts=%ds)",
        settings.alert_check_interval_seconds,
    )
    logger.info("Mission Control ready.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    logger.info("Mission Control shutting down...")
    _scheduler.shutdown(wait=False)
    demo_task = getattr(app.state, "demo_task", None)
    if demo_task and not demo_task.done():
        demo_task.cancel()
    await close_redis()
    logger.info("Mission Control stopped.")
