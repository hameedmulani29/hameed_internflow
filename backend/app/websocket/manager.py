import json
import logging
from typing import Dict, Set
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

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

        payload = jsonable_encoder(event)
        dead_connections = set()
        for connection in list(self._connections[mentor_id]):
            try:
                await connection.send_json(payload)
            except Exception as exc:
                logger.warning(f"Error sending event to mentor {mentor_id}: {exc}")
                dead_connections.add(connection)

        for dead in dead_connections:
            self.disconnect(dead, mentor_id)

    def is_connected(self, mentor_id: int) -> bool:
        return mentor_id in self._connections and len(self._connections[mentor_id]) > 0


class InternWebSocketManager:
    """Centralized manager for intern real-time WebSockets.

    Mirrors MentorWebSocketManager: authenticated intern role sockets receive
    activity events about their own internship (task assignment, status
    changes, reviews, mentor feedback) so the UI updates without refresh.
    """

    def __init__(self):
        self._connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, intern_id: int):
        await websocket.accept()
        if intern_id not in self._connections:
            self._connections[intern_id] = set()
        self._connections[intern_id].add(websocket)

    def disconnect(self, websocket: WebSocket, intern_id: int):
        if intern_id in self._connections:
            self._connections[intern_id].discard(websocket)
            if not self._connections[intern_id]:
                del self._connections[intern_id]

    async def broadcast_to_intern(self, intern_id: int, event: dict):
        """Send event payload to all active WebSocket connections of a specific intern."""
        if intern_id not in self._connections:
            return

        payload = jsonable_encoder(event)
        dead_connections = set()
        for connection in list(self._connections[intern_id]):
            try:
                await connection.send_json(payload)
            except Exception as exc:
                logger.warning(f"Error sending event to intern {intern_id}: {exc}")
                dead_connections.add(connection)

        for dead in dead_connections:
            self.disconnect(dead, intern_id)

    def is_connected(self, intern_id: int) -> bool:
        return intern_id in self._connections and len(self._connections[intern_id]) > 0


mentor_manager = MentorWebSocketManager()
intern_manager = InternWebSocketManager()
