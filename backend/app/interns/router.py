from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db
from app.services.activity_service import record_and_broadcast_activity
from app.skills.router import get_or_create_skill

router = APIRouter(prefix='/api/interns', tags=['intern'])


class InternSkillsInput(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=50)


class InternTaskSubmissionInput(BaseModel):
    content: str | None = Field(default=None, min_length=10, max_length=4000)
    message: str | None = Field(default=None, min_length=10, max_length=4000)
    repo_url: str | None = Field(default=None, max_length=500)
    demo_url: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)


class InternTaskStatusInput(BaseModel):
    status: str = Field(..., pattern='^(assigned|in_progress|submitted|completed|changes_requested)$')


VALID_INTERN_TRANSITIONS = {
    'assigned': {'in_progress'},
    'in_progress': {'submitted', 'assigned'},
    'submitted': {'in_progress'},
    'changes_requested': {'in_progress', 'submitted'},
}


def _normalize_submission_text(payload: InternTaskSubmissionInput) -> str:
    text = payload.content or payload.message
    if not text or not text.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Submission content is required.')
    text = text.strip()
    if len(text) < 10:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Submission content must be at least 10 characters long.')

    if payload.repo_url:
        text = f"{text}\nRepository: {payload.repo_url.strip()}"
    if payload.demo_url:
        text = f"{text}\nDemo: {payload.demo_url.strip()}"
    if payload.notes:
        text = f"{text}\nNotes: {payload.notes.strip()}"
    return text


def _serialize_task(row):
    submission = None
    if row['submission_id'] is not None:
        submission = {
            'id': row['submission_id'],
            'status': row['submission_status'],
            'submitted_at': row['submitted_at'],
            'content': row['submission_content'],
        }
    keys = row.keys()
    feedback = None
    if 'feedback_text' in keys and row['feedback_text'] is not None:
        feedback = {
            'feedback': row['feedback_text'],
            'strengths': row.get('feedback_strengths'),
            'improvements': row.get('feedback_improvements'),
            'next_steps': row.get('feedback_next_steps'),
            'created_at': row.get('feedback_created_at'),
        }

    return {
        'id': row['id'],
        'mentor_id': row['mentor_id'],
        'intern_id': row['intern_id'],
        'project_id': row['project_id'] if 'project_id' in keys else None,
        'project_title': row['project_title'] if 'project_title' in keys else None,
        'master_task_id': row['master_task_id'] if 'master_task_id' in keys else None,
        'master_task_title': row['master_task_title'] if 'master_task_title' in keys else None,
        'chunk_id': row['chunk_id'] if 'chunk_id' in keys else None,
        'title': row['title'],
        'description': row['description'],
        'priority': row['priority'],
        'start_date': row['start_date'] if 'start_date' in keys else None,
        'due_date': row['due_date'],
        'estimated_hours': row['estimated_hours'] if 'estimated_hours' in keys else None,
        'status': row['status'],
        'created_at': row['created_at'],
        'mentor': {
            'id': row['mentor_id'],
            'name': row['mentor_name'],
        },
        'submission': submission,
        'mentor_feedback': feedback,
    }


@router.get('/me/workspace')
def get_workspace(token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        user = db.execute('SELECT id, full_name, email, role FROM users WHERE id = ?', (intern,)).fetchone()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Intern profile not found.')

        assignment = db.execute(
            '''SELECT ma.id, ma.mentor_id, ma.internship_id, ma.created_at AS assignment_created_at,
                      u.full_name AS mentor_name, u.email AS mentor_email,
                      i.title AS internship_title, i.status AS internship_status,
                      i.department, i.location, i.work_mode, i.duration, i.stipend,
                      i.deadline
               FROM mentor_assignments ma
               LEFT JOIN users u ON u.id = ma.mentor_id
               LEFT JOIN internships i ON i.id = ma.internship_id
               WHERE ma.intern_id = ? AND ma.status = 'active'
               ORDER BY ma.created_at DESC
               LIMIT 1''',
            (intern,),
        ).fetchone()

        tasks = db.execute(
            '''SELECT mt.*, u.full_name AS mentor_name,
                      p.title AS project_title, mtk.title AS master_task_title,
                      ts.id AS submission_id, ts.content AS submission_content,
                      ts.status AS submission_status, ts.submitted_at,
                      mf.feedback AS feedback_text, mf.strengths AS feedback_strengths,
                      mf.improvements AS feedback_improvements, mf.next_steps AS feedback_next_steps,
                      mf.created_at AS feedback_created_at
               FROM mentor_tasks mt
               JOIN users u ON u.id = mt.mentor_id
               LEFT JOIN projects p ON p.id = mt.project_id
               LEFT JOIN master_tasks mtk ON mtk.id = mt.master_task_id
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               LEFT JOIN mentor_feedback mf ON mf.task_id = mt.id
               WHERE mt.intern_id = ?
               ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC''',
            (intern,),
        ).fetchall()

    mentor_payload = None
    internship_payload = None
    if assignment and assignment['mentor_id']:
        mentor_payload = {
            'id': assignment['mentor_id'],
            'name': assignment['mentor_name'],
            'email': assignment['mentor_email'],
        }
    if assignment and assignment['internship_id']:
        internship_payload = {
            'id': assignment['internship_id'],
            'title': assignment['internship_title'],
            'status': assignment['internship_status'],
            'department': assignment['department'],
            'location': assignment['location'],
            'work_mode': assignment['work_mode'],
            'duration': assignment['duration'],
            'stipend': assignment['stipend'],
            'deadline': assignment['deadline'],
        }

    task_summary = {
        'total_tasks': len(tasks),
        'assigned': sum(1 for task in tasks if task['status'] == 'assigned'),
        'in_progress': sum(1 for task in tasks if task['status'] == 'in_progress'),
        'submitted': sum(1 for task in tasks if task['status'] == 'submitted'),
        'completed': sum(1 for task in tasks if task['status'] == 'completed'),
        'changes_requested': sum(1 for task in tasks if task['status'] == 'changes_requested'),
    }

    return {
        'status': 'ok',
        'intern': {'id': user['id'], 'full_name': user['full_name'], 'email': user['email'], 'role': user['role']},
        'mentor': mentor_payload,
        'internship': internship_payload,
        'assignment': {
            'id': assignment['id'],
            'created_at': assignment['assignment_created_at'],
        } if assignment else None,
        'task_summary': task_summary,
        'tasks': [_serialize_task(task) for task in tasks],
    }


@router.get('/me/skills')
def get_my_skills(token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT s.id, s.name, s.category, cs.source, cs.created_at
               FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ? ORDER BY s.name''',
            (intern,),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}


@router.put('/me/skills')
def set_my_skills(payload: InternSkillsInput, token=Depends(require_roles('intern'))):
    """Replace the intern's declared profile skills with the given list.

    Sources other than 'candidate_profile' (resume/assessment/mentor) are
    preserved — profile editing only manages what the candidate declared.
    """
    intern = int(token['sub'])
    cleaned = []
    seen = set()
    for raw in payload.skills:
        name = ' '.join(raw.strip().split())
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(name)

    with get_db() as db:
        skill_ids = [get_or_create_skill(db, name)[0] for name in cleaned]
        db.execute(
            "DELETE FROM candidate_skills WHERE intern_id = ? AND source = 'candidate_profile'",
            (intern,),
        )
        for skill_id in skill_ids:
            db.execute(
                '''INSERT INTO candidate_skills (intern_id, skill_id, source)
                   VALUES (?, ?, 'candidate_profile')
                   ON CONFLICT(intern_id, skill_id) DO NOTHING''',
                (intern, skill_id),
            )
        db.commit()
        rows = db.execute(
            '''SELECT s.id, s.name, s.category, cs.source, cs.created_at
               FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ? ORDER BY s.name''',
            (intern,),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}


def _format_feedback_item(row):
    item = dict(row)
    item['message'] = row['feedback']
    item['areas_for_improvement'] = row['improvements']
    item['mentor'] = row['mentor_name']
    item['is_read'] = bool(row['is_read']) if row['is_read'] is not None else True
    item['read_at'] = row['read_at']
    return item


@router.get('/me/feedback/unread-count')
@router.get('/feedback/unread-count')
def get_unread_feedback_count(token=Depends(require_roles('intern'))):
    """Unread feedback count for the authenticated intern."""
    intern = int(token['sub'])
    with get_db() as db:
        row = db.execute(
            'SELECT COUNT(*) AS count FROM mentor_feedback WHERE intern_id = ? AND (is_read IS NULL OR is_read = 0)',
            (intern,),
        ).fetchone()
        unread_count = row['count'] if row else 0
    return {'unread_count': unread_count}


@router.get('/me/feedback/unread')
@router.get('/feedback/unread')
def get_unread_feedback(token=Depends(require_roles('intern'))):
    """Unread feedback items for the authenticated intern."""
    intern = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT mf.id, mf.task_id, mf.feedback, mf.strengths, mf.improvements,
                      mf.next_steps, mf.is_read, mf.read_at, mf.created_at,
                      u.full_name AS mentor_name, mt.title AS task_title
               FROM mentor_feedback mf
               JOIN users u ON u.id = mf.mentor_id
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.intern_id = ? AND (mf.is_read IS NULL OR mf.is_read = 0)
               ORDER BY mf.created_at DESC''',
            (intern,),
        ).fetchall()
    return {'items': [_format_feedback_item(row) for row in rows]}


@router.patch('/me/feedback/{feedback_id}/read')
@router.patch('/feedback/{feedback_id}/read')
def mark_feedback_as_read(feedback_id: int, token=Depends(require_roles('intern'))):
    """Mark a mentor feedback item as read for the authenticated intern."""
    intern = int(token['sub'])
    with get_db() as db:
        existing = db.execute(
            'SELECT id FROM mentor_feedback WHERE id = ? AND intern_id = ?',
            (feedback_id, intern),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail='Feedback not found.')

        db.execute(
            'UPDATE mentor_feedback SET is_read = 1, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND intern_id = ?',
            (feedback_id, intern),
        )
        db.commit()

        row = db.execute(
            '''SELECT mf.id, mf.task_id, mf.feedback, mf.strengths, mf.improvements,
                      mf.next_steps, mf.is_read, mf.read_at, mf.created_at,
                      u.full_name AS mentor_name, mt.title AS task_title
               FROM mentor_feedback mf
               JOIN users u ON u.id = mf.mentor_id
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.id = ? AND mf.intern_id = ?''',
            (feedback_id, intern),
        ).fetchone()
    return _format_feedback_item(row)


@router.get('/me/feedback')
@router.get('/feedback')
def get_my_mentor_feedback(token=Depends(require_roles('intern'))):
    """Mentor feedback about the authenticated intern (mentor→intern direction)."""
    intern = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT mf.id, mf.task_id, mf.feedback, mf.strengths, mf.improvements,
                      mf.next_steps, mf.is_read, mf.read_at, mf.created_at,
                      u.full_name AS mentor_name, mt.title AS task_title
               FROM mentor_feedback mf
               JOIN users u ON u.id = mf.mentor_id
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.intern_id = ?
               ORDER BY mf.created_at DESC''',
            (intern,),
        ).fetchall()
    return {'items': [_format_feedback_item(row) for row in rows]}


@router.get('/tasks')
def list_tasks(
    status: str | None = Query(default=None, pattern='^(assigned|in_progress|submitted|completed|changes_requested)$'),
    category: str | None = Query(default=None, pattern='^(today|upcoming|overdue|submitted|completed)$'),
    token=Depends(require_roles('intern')),
):
    from datetime import datetime, timezone
    intern = int(token['sub'])
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    with get_db() as db:
        query = '''SELECT mt.*, u.full_name AS mentor_name,
                          p.title AS project_title, mtk.title AS master_task_title,
                          ts.id AS submission_id, ts.content AS submission_content,
                          ts.status AS submission_status, ts.submitted_at,
                          mf.feedback AS feedback_text, mf.strengths AS feedback_strengths,
                          mf.improvements AS feedback_improvements, mf.next_steps AS feedback_next_steps,
                          mf.created_at AS feedback_created_at
                   FROM mentor_tasks mt
                   JOIN users u ON u.id = mt.mentor_id
                   LEFT JOIN projects p ON p.id = mt.project_id
                   LEFT JOIN master_tasks mtk ON mtk.id = mt.master_task_id
                   LEFT JOIN task_submissions ts ON ts.task_id = mt.id
                   LEFT JOIN mentor_feedback mf ON mf.task_id = mt.id
                   WHERE mt.intern_id = ?'''
        params = [intern]
        if status:
            query += ' AND mt.status = ?'
            params.append(status)

        if category == 'today':
            query += " AND mt.status IN ('assigned', 'in_progress', 'changes_requested') AND (mt.due_date IS NULL OR mt.due_date >= ?) AND (mt.start_date IS NULL OR mt.start_date <= ?)"
            params.extend([today_str, today_str])
        elif category == 'upcoming':
            query += " AND mt.status IN ('assigned', 'in_progress', 'changes_requested') AND mt.start_date IS NOT NULL AND mt.start_date > ?"
            params.append(today_str)
        elif category == 'overdue':
            query += " AND mt.status IN ('assigned', 'in_progress', 'changes_requested') AND mt.due_date IS NOT NULL AND mt.due_date < ?"
            params.append(today_str)
        elif category == 'submitted':
            query += " AND mt.status = 'submitted'"
        elif category == 'completed':
            query += " AND mt.status = 'completed'"

        query += ' ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC'
        rows = db.execute(query, params).fetchall()
    return {'items': [_serialize_task(row) for row in rows]}


@router.post('/tasks/{task_id}/submit', status_code=201)
@router.post('/tasks/{task_id}/submit/', status_code=201)
async def submit_task(task_id: int, payload: InternTaskSubmissionInput, token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    content = _normalize_submission_text(payload)
    with get_db() as db:
        task = db.execute(
            'SELECT * FROM mentor_tasks WHERE id = ? AND intern_id = ?',
            (task_id, intern),
        ).fetchone()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Task not found for this intern.')
        if task['status'] == 'completed':
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='This task is already completed and cannot be resubmitted.')
        existing = db.execute('SELECT * FROM task_submissions WHERE task_id = ?', (task_id,)).fetchone()
        if existing:
            if task['status'] == 'changes_requested' or existing['status'] == 'changes_requested':
                db.execute(
                    'UPDATE task_submissions SET content = ?, status = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (content, 'pending', existing['id']),
                )
                db.execute('UPDATE mentor_tasks SET status = ? WHERE id = ?', ('submitted', task_id))
                await record_and_broadcast_activity(
                    db,
                    actor_id=intern,
                    actor_role='intern',
                    event_type='task.resubmitted',
                    mentor_id=task['mentor_id'],
                    title='Task Resubmitted',
                    description=f'Intern resubmitted task "{task["title"]}"',
                    intern_id=intern,
                    project_id=dict(task).get('project_id'),
                    task_id=task_id,
                    metadata={'status': 'submitted'},
                )
                db.commit()
                row = db.execute('SELECT * FROM task_submissions WHERE id = ?', (existing['id'],)).fetchone()
                return {
                    'id': existing['id'],
                    'task_id': task_id,
                    'intern_id': intern,
                    'status': 'pending',
                    'submitted_at': row['submitted_at'],
                }
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='A submission already exists for this task.')

        cursor = db.execute(
            'INSERT INTO task_submissions (task_id, intern_id, content, status, submitted_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            (task_id, intern, content, 'pending'),
        )
        db.execute('UPDATE mentor_tasks SET status = ? WHERE id = ?', ('submitted', task_id))
        await record_and_broadcast_activity(
            db,
            actor_id=intern,
            actor_role='intern',
            event_type='task.submitted',
            mentor_id=task['mentor_id'],
            title='Task Submitted',
            description=f'Intern submitted task "{task["title"]}"',
            intern_id=intern,
            project_id=dict(task).get('project_id'),
            task_id=task_id,
            metadata={'status': 'submitted'},
        )
        db.commit()
        submission = db.execute('SELECT * FROM task_submissions WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return {
        'id': submission['id'],
        'task_id': task_id,
        'intern_id': intern,
        'status': submission['status'],
        'submitted_at': submission['submitted_at'],
    }


@router.patch('/tasks/{task_id}/status')
@router.patch('/tasks/{task_id}/status/')
async def update_task_status(task_id: int, payload: InternTaskStatusInput, token=Depends(require_roles('intern'))):
    intern = int(token['sub'])
    with get_db() as db:
        task = db.execute('SELECT * FROM mentor_tasks WHERE id = ? AND intern_id = ?', (task_id, intern)).fetchone()
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Task not found for this intern.')

        current_status = task['status']
        allowed = VALID_INTERN_TRANSITIONS.get(current_status, set())
        if payload.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Intern updates are only allowed from '{current_status}' to {sorted(allowed)}.",
            )

        db.execute('UPDATE mentor_tasks SET status = ? WHERE id = ?', (payload.status, task_id))
        
        task_dict = dict(task)
        event_type = 'task.started' if payload.status == 'in_progress' else 'task.status_changed'
        act_title = 'Task Started' if payload.status == 'in_progress' else f"Task {payload.status.replace('_', ' ').title()}"
        act_desc = f'Intern started task "{task["title"]}"' if payload.status == 'in_progress' else f'Intern changed status of "{task["title"]}" to {payload.status}'

        await record_and_broadcast_activity(
            db,
            actor_id=intern,
            actor_role='intern',
            event_type=event_type,
            mentor_id=task['mentor_id'],
            title=act_title,
            description=act_desc,
            intern_id=intern,
            project_id=task_dict.get('project_id'),
            task_id=task_id,
            metadata={'status': payload.status},
        )
        db.commit()
        updated = db.execute('SELECT * FROM mentor_tasks WHERE id = ?', (task_id,)).fetchone()
    return {
        'id': updated['id'],
        'intern_id': updated['intern_id'],
        'status': updated['status'],
        'updated_at': updated['created_at'],
    }
