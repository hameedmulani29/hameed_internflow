from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db

router = APIRouter(prefix='/api/attendance', tags=['attendance'])


class AttendanceCheckInInput(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


class AttendanceCheckOutInput(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


def _serialize_entry(row):
    return {
        'id': row['id'],
        'intern_id': row['intern_id'],
        'checked_in_at': row['checked_in_at'],
        'checked_out_at': row['checked_out_at'],
        'work_minutes': row['work_minutes'],
        'status': row['status'],
        'notes': row['notes'],
        'created_at': row['created_at'],
    }


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _minutes_between(start_iso: str, end_iso: str) -> int:
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)
    if end < start:
        return 0
    return int((end - start).total_seconds() // 60)


@router.post('/check-in')
def check_in(payload: AttendanceCheckInInput, token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    now = _now_iso()
    with get_db() as db:
        active = db.execute(
            "SELECT * FROM attendance WHERE intern_id = ? AND status = 'checked_in' AND date(checked_in_at) = date('now') ORDER BY checked_in_at DESC LIMIT 1",
            (intern,),
        ).fetchone()
        if active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='You are already checked in for today.')

        cursor = db.execute(
            'INSERT INTO attendance (intern_id, checked_in_at, status, notes, created_at) VALUES (?, ?, ?, ?, ?)',
            (intern, now, 'checked_in', payload.notes.strip() if payload.notes else None, now),
        )
        db.commit()
        row = db.execute('SELECT * FROM attendance WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return {
        'id': row['id'],
        'intern_id': row['intern_id'],
        'status': row['status'],
        'checked_in_at': row['checked_in_at'],
        'checked_out_at': row['checked_out_at'],
        'work_minutes': row['work_minutes'],
        'notes': row['notes'],
    }


@router.post('/check-out')
def check_out(payload: AttendanceCheckOutInput, token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    now = _now_iso()
    with get_db() as db:
        record = db.execute(
            "SELECT * FROM attendance WHERE intern_id = ? AND status = 'checked_in' ORDER BY checked_in_at DESC LIMIT 1",
            (intern,),
        ).fetchone()
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='No active check-in found for this intern.')

        work_minutes = _minutes_between(record['checked_in_at'], now)
        if payload.notes:
            note = payload.notes.strip()
            merged = f"{record['notes']}\n{note}" if record['notes'] else note
        else:
            merged = record['notes']

        db.execute(
            'UPDATE attendance SET checked_out_at = ?, work_minutes = ?, status = ?, notes = ? WHERE id = ?',
            (now, work_minutes, 'checked_out', merged, record['id']),
        )
        db.commit()
        updated = db.execute('SELECT * FROM attendance WHERE id = ?', (record['id'],)).fetchone()
    return {
        'id': updated['id'],
        'intern_id': updated['intern_id'],
        'status': updated['status'],
        'checked_in_at': updated['checked_in_at'],
        'checked_out_at': updated['checked_out_at'],
        'work_minutes': updated['work_minutes'],
        'notes': updated['notes'],
    }


@router.get('/today')
def today(token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM attendance WHERE intern_id = ? AND date(checked_in_at) = date('now') ORDER BY checked_in_at DESC",
            (intern,),
        ).fetchall()
    return {'items': [_serialize_entry(row) for row in rows]}


@router.get('/logs')
def logs(token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM attendance WHERE intern_id = ? ORDER BY checked_in_at DESC LIMIT 30',
            (intern,),
        ).fetchall()
    return {'items': [_serialize_entry(row) for row in rows]}
