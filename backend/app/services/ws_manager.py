import json
import logging
from datetime import datetime
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events to all connected clients."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Any):
        """Broadcast an event to all connected WebSocket clients."""
        message = json.dumps(
            {
                "type": event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat(),
            },
            default=str,
        )
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def send_personal(self, websocket: WebSocket, event_type: str, data: Any):
        """Send a message to a specific client."""
        message = json.dumps(
            {
                "type": event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat(),
            },
            default=str,
        )
        await websocket.send_text(message)


# Singleton instance
ws_manager = WebSocketManager()
