import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("mentor_websocket")


class MentorWebSocketManager:
    """Centralized manager for mentor real-time monitoring WebSockets."""

    def __init__(self):
        # Mapping mentor_id -> set of active WebSockets
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, mentor_id: int):
        await websocket.accept()
        if mentor_id not in self._connections:
            self._connections[mentor_id] = set()
        self._connections[mentor_id].add(websocket)

    def disconnect(self, websocket: WebSocket, mentor_id: int):
        if mentor_id in self._connections:
            self._connections[mentor_id].discard(websocket)
            if not self._connections[mentor_id]:
                del self._connections[mentor_id]

    async def broadcast_to_mentor(self, mentor_id: int, event: dict):
        """Send event payload to all active WebSocket connections of a specific mentor."""
        if mentor_id not in self._connections:
            return

        dead_connections = set()
        for connection in list(self._connections[mentor_id]):
            try:
                await connection.send_json(event)
            except Exception as exc:
                logger.warning(f"Error sending event to mentor {mentor_id}: {exc}")
                dead_connections.add(connection)

        for dead in dead_connections:
            self.disconnect(dead, mentor_id)

    def is_connected(self, mentor_id: int) -> bool:
        return mentor_id in self._connections and len(self._connections[mentor_id]) > 0


mentor_manager = MentorWebSocketManager()
