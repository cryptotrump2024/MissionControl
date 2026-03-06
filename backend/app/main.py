import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import agents, tasks, logs, costs, health, approvals
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

# Routers
app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(agents.router, prefix="/api/agents", tags=["Agents"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])
app.include_router(costs.router, prefix="/api/costs", tags=["Costs"])
app.include_router(approvals.router, prefix="/api/approvals", tags=["Approvals"])


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
async def startup_event():
    logger.info("Mission Control starting up...")
    # TODO: Run Alembic migrations
    # TODO: Start background services (heartbeat, cost aggregator, alerts)
    logger.info("Mission Control ready.")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Mission Control shutting down...")
