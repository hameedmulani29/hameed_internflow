from typing import Set
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.core.permissions import optional_user, require_roles
from app.core.security import decode_token_str
from app.db import get_db
from app.skills.router import get_or_create_skill

router = APIRouter(prefix='/api/internships', tags=['internships'])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        disconnected = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.add(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


@router.websocket('/ws')
async def internship_websocket(websocket: WebSocket, token: str | None = Query(None)):
    if token:
        payload = decode_token_str(token)
        if payload and payload.get('role') == 'provider':
            pass
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket)


class InternshipInput(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    department: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=10)
    location: str = Field(min_length=2, max_length=160)
    work_mode: str = Field(pattern='^(Remote|Hybrid|On-site)$')
    duration: str = Field(min_length=2, max_length=60)
    stipend: str = Field(min_length=1, max_length=80)
    openings: int = Field(default=1, ge=1, le=1000)
    deadline: str | None = None
    skills: list[str] = Field(default_factory=list, max_length=20)


def _attach_skills(db, internship_id: int, items):
    """Attach required-skill names to serialized internship rows in one query."""
    if not items:
        return items
    ids = [item['id'] for item in items]
    placeholders = ','.join('?' for _ in ids)
    rows = db.execute(
        f'''SELECT isx.internship_id, s.name FROM internship_skills isx
            JOIN skills s ON s.id = isx.skill_id
            WHERE isx.internship_id IN ({placeholders}) ORDER BY s.name''',
        ids,
    ).fetchall()
    by_internship = {}
    for row in rows:
        by_internship.setdefault(row['internship_id'], []).append(row['name'])
    for item in items:
        item['skills'] = by_internship.get(item['id'], [])
    return items


@router.get('')
def list_internships(query: str = '', status_filter: str = Query('', alias='status'), user=Depends(optional_user)):
    sql = '''SELECT i.*, u.organization AS company, u.full_name AS provider_name
             FROM internships i
             JOIN users u ON i.provider_id = u.id
             WHERE 1=1'''
    values = []
    if not user or user.get('role') != 'provider':
        sql += " AND i.status = 'published'"
    else:
        # Isolation: a provider may only list internships it owns. Public
        # visitors and other roles keep the published-only view.
        sql += ' AND i.provider_id = ?'
        values.append(int(user['sub']))
    if status_filter:
        sql += ' AND i.status = ?'
        values.append(status_filter)
    if query.strip():
        sql += ' AND (lower(i.title) LIKE ? OR lower(i.department) LIKE ? OR lower(i.description) LIKE ?)'
        value = f'%{query.strip().lower()}%'
        values.extend([value, value, value])
    sql += ' ORDER BY i.created_at DESC'
    with get_db() as db:
        rows = db.execute(sql, values).fetchall()
        items = _attach_skills(db, None, [dict(row) for row in rows])
    return {'items': items}


@router.post('', status_code=status.HTTP_201_CREATED)
async def create_internship(payload: InternshipInput, user=Depends(require_roles('provider'))):
    with get_db() as db:
        cursor = db.execute(
            'INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (
                int(user['sub']),
                payload.title.strip(),
                payload.department.strip(),
                payload.description.strip(),
                payload.location.strip(),
                payload.work_mode,
                payload.duration.strip(),
                payload.stipend.strip(),
                'published',
                payload.openings,
                payload.deadline,
            ),
        )
        internship_id = cursor.lastrowid
        for raw_name in payload.skills[:20]:
            name = ' '.join(raw_name.strip().split())
            if not name:
                continue
            skill_id, _ = get_or_create_skill(db, name)
            db.execute(
                'INSERT OR IGNORE INTO internship_skills (internship_id, skill_id) VALUES (?, ?)',
                (internship_id, skill_id),
            )
        db.commit()
        row = db.execute(
            '''SELECT i.*, u.organization AS company, u.full_name AS provider_name
               FROM internships i
               JOIN users u ON i.provider_id = u.id
               WHERE i.id = ?''',
            (internship_id,),
        ).fetchone()
        item = _attach_skills(db, internship_id, [dict(row)])[0]

    if item.get('status') == 'published':
        await manager.broadcast({
            'type': 'internship_published',
            'internship': item,
        })
    return item


@router.patch('/{internship_id}/status')
async def update_status(internship_id: int, status_value: str = Query(..., alias='status'), user=Depends(require_roles('provider'))):
    if status_value not in {'draft', 'published', 'closed', 'archived'}:
        raise HTTPException(status_code=422, detail='Unsupported internship status.')
    with get_db() as db:
        result = db.execute('UPDATE internships SET status = ? WHERE id = ? AND provider_id = ?', (status_value, internship_id, int(user['sub'])))
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail='Internship not found.')
        row = db.execute(
            '''SELECT i.*, u.organization AS company, u.full_name AS provider_name
               FROM internships i
               JOIN users u ON i.provider_id = u.id
               WHERE i.id = ?''',
            (internship_id,),
        ).fetchone()
        item = _attach_skills(db, internship_id, [dict(row)])[0]

    if status_value == 'published':
        await manager.broadcast({
            'type': 'internship_published',
            'internship': item,
        })
    return item

