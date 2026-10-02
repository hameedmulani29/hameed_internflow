r"""
Intern → Mentor Feedback (top-down inverse of `mentor_feedback`).

The intern never supplies mentor identity: the server resolves the recipient
from the authenticated intern's active mentor_assignments row. A mentor_id in
the payload would never be trusted even if present — it is simply not read.

Endpoints (mounted under /api/mentor-feedback):
  GET  /context   → the intern's active mentorship context for the form
  POST /          → create a feedback record (intern role only)
  GET  /          → feedback addressed to the authenticated mentor
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db, seed_intern_demo_data, seed_mentor_demo_data
from app.websocket.manager import mentor_manager


def _parse_blocker_fields(message: str):
    """Extract structured fields from the intern [Blocker] message convention."""
    blocker_type = ''
    affected_task = ''
    for line in message.split('\n'):
        if line.startswith('[Blocker] Type:'):
            blocker_type = line.replace('[Blocker] Type:', '').strip()
        elif line.startswith('Affected task:'):
            affected_task = line.replace('Affected task:', '').strip()
    return blocker_type, affected_task


async def broadcast_blocker_report(mentor_id: int, record: dict):
    """Push a blocker report to the mentor's real-time monitoring feed.

    Uses the existing mentor WebSocket infrastructure; the event mirrors the
    shape of activity events so existing consumers keep working.
    """
    blocker_type, affected_task = _parse_blocker_fields(record.get('message', ''))
    event = {
        'type': 'blocker.reported',
        'title': 'Blocker Reported',
        'description': f'{blocker_type or "Blocker"} reported'
        + (f' — {affected_task}' if affected_task and affected_task != 'none specified' else ''),
        'blocker': {
            'id': record.get('id'),
            'intern_id': record.get('intern_id'),
            'intern_name': record.get('intern_name'),
            'assignment_id': record.get('assignment_id'),
            'type': blocker_type,
            'affected_task': affected_task,
            'message': record.get('message'),
            'created_at': record.get('created_at'),
        },
        'created_at': record.get('created_at'),
    }
    await mentor_manager.broadcast_to_mentor(mentor_id, event)

router = APIRouter(prefix='/api/mentor-feedback', tags=['mentor-feedback'])


class InternFeedbackInput(BaseModel):
    feedback_type: str = Field(default='general', pattern='^(general|session|guidance|communication|technical_guidance|other)$')
    rating: int | None = Field(default=None, ge=1, le=5)
    message: str = Field(min_length=20, max_length=4000)


class ContextError(Exception):
    def __init__(self, code, detail, http_status=status.HTTP_409_CONFLICT):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.http_status = http_status


def resolve_active_context(db, intern):
    """Find the intern's active mentor assignment (single source of truth for recipient)."""
    assignment = db.execute(
        """SELECT ma.id, ma.mentor_id, ma.internship_id, u.full_name AS mentor_name
           FROM mentor_assignments ma JOIN users u ON u.id = ma.mentor_id
           WHERE ma.intern_id = ? AND ma.status = 'active'""",
        (intern,),
    ).fetchall()
    if not assignment:
        raise ContextError('no_mentor', "You don't currently have an assigned mentor, so mentor feedback isn't available yet.")
    if len(assignment) > 1:
        raise ContextError('multiple_mentors', 'Multiple active mentors found for your account.')
    return assignment[0]


@router.get('/context')
def feedback_context(token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        seed_intern_demo_data(db, intern)
        db.commit()
        try:
            row = resolve_active_context(db, intern)
        except ContextError as context_error:
            return {'status': context_error.code, 'message': context_error.detail}
        internship = None
        if row['internship_id']:
            internship = db.execute('SELECT title FROM internships WHERE id = ?', (row['internship_id'],)).fetchone()
        recent = db.execute(
            'SELECT id, feedback_type, rating, message, created_at FROM intern_mentor_feedback WHERE intern_id = ? ORDER BY created_at DESC LIMIT 10',
            (intern,),
        ).fetchall()
    return {
        'status': 'ok',
        'mentor': {'id': row['mentor_id'], 'name': row['mentor_name']},
        'internship': internship['title'] if internship else None,
        'recent_feedback': [dict(item) for item in recent],
    }


@router.post('', status_code=201)
@router.post('/', status_code=201)
async def submit_feedback(payload: InternFeedbackInput, token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    message = payload.message.strip()
    if len(message) < 20:
        raise HTTPException(status_code=422, detail='Please enter at least 20 characters.')
    with get_db() as db:
        try:
            assignment = resolve_active_context(db, intern)
        except ContextError as context_error:
            raise HTTPException(status_code=context_error.http_status, detail=context_error.detail) from context_error
        cursor = db.execute(
            'INSERT INTO intern_mentor_feedback (assignment_id, mentor_id, intern_id, internship_id, feedback_type, rating, message) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id',
            (assignment['id'], assignment['mentor_id'], intern, assignment['internship_id'], payload.feedback_type, payload.rating, message),
        )
        fb_id = cursor.fetchone()['id']
        db.commit()
        created = db.execute('SELECT id, created_at FROM intern_mentor_feedback WHERE id = %s', (fb_id,)).fetchone()
        created = dict(created)
        # Real-time: blocker reports push straight to the mentor's live feed.
        if payload.feedback_type == 'other' and message.startswith('[Blocker]'):
            await broadcast_blocker_report(assignment['mentor_id'], {
                'id': created['id'],
                'intern_id': intern,
                'mentor_id': assignment['mentor_id'],
                'assignment_id': assignment['id'],
                'message': message,
                'created_at': created['created_at'],
            })
    return {
        'id': created['id'],
        'created_at': created['created_at'],
        'mentor_name': assignment['mentor_name'],
        'message': 'Feedback submitted successfully.',
    }


@router.get('')
@router.get('/')
def received_feedback(token=Depends(require_roles('mentor'))):
    mentor = int(token['sub'])
    with get_db() as db:
        seed_mentor_demo_data(db, mentor)
        db.commit()
        rows = db.execute(
            """SELECT f.id, f.feedback_type, f.rating, f.message, f.status, f.created_at,
                      u.full_name AS intern_name, i.title AS internship_title
               FROM intern_mentor_feedback f
               JOIN users u ON u.id = f.intern_id
               LEFT JOIN internships i ON i.id = f.internship_id
               WHERE f.mentor_id = ?
               ORDER BY f.created_at DESC, f.id DESC""",
            (mentor,),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}
