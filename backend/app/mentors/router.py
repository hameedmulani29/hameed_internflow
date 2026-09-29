from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.core.security import decode_token_str
from app.db import get_db, seed_mentor_demo_data
from app.skills.router import get_or_create_skill, ObservationInput
from app.services.distribution_service import preview_distribution, execute_distribution
from app.services.scheduling_service import preview_schedule, execute_schedule
from app.websocket.manager import mentor_manager
from app.services.activity_service import record_and_broadcast_activity, fetch_mentor_activity
from app.services.progress_service import calculate_project_progress, calculate_intern_progress

router = APIRouter(prefix='/api/mentor', tags=['mentor'])


@router.websocket('/ws')
async def mentor_websocket(websocket: WebSocket, token: str | None = Query(None)):
    """Authenticated WebSocket endpoint for real-time mentor monitoring."""
    if not token:
        await websocket.close(code=4001)
        return
    payload = decode_token_str(token)
    if not payload or payload.get('role') != 'mentor':
        await websocket.close(code=4001)
        return

    m_id = int(payload.get('sub'))
    await mentor_manager.connect(websocket, m_id)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        mentor_manager.disconnect(websocket, m_id)



class TaskInput(BaseModel):
    intern_id: int
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=2, max_length=4000)
    priority: str = Field(default='normal', pattern='^(low|normal|high)$')
    due_date: str | None = None
    internship_id: int | None = None


class FeedbackInput(BaseModel):
    intern_id: int
    task_id: int | None = None
    feedback: str = Field(min_length=2, max_length=4000)
    strengths: str | None = None
    improvements: str | None = None
    next_steps: str | None = None


class EvaluationInput(BaseModel):
    intern_id: int
    score: int | None = Field(default=None, ge=0, le=100)
    summary: str = Field(min_length=2, max_length=4000)
    due_date: str | None = None
    status: str = Field(default='submitted', pattern='^(draft|submitted)$')


class AssignmentInput(BaseModel):
    mentor_id: int
    intern_id: int
    internship_id: int | None = None


def mentor_id(token):
    return int(token['sub'])


def ensure_assignment(db, mentor, intern):
    assignment = db.execute(
        'SELECT * FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ? AND status = ?',
        (mentor, intern, 'active'),
    ).fetchone()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='This intern is not assigned to you.')
    return assignment


@router.post('/assignments', status_code=201)
def create_assignment(payload: AssignmentInput, token=Depends(require_roles('provider'))):
    provider = int(token['sub'])
    with get_db() as db:
        mentor = db.execute("SELECT id FROM users WHERE id = ? AND role = 'mentor'", (payload.mentor_id,)).fetchone()
        intern = db.execute("SELECT id FROM users WHERE id = ? AND role = 'intern'", (payload.intern_id,)).fetchone()
        if not mentor or not intern:
            raise HTTPException(status_code=404, detail='Mentor or intern not found.')
        if payload.internship_id:
            internship = db.execute('SELECT id FROM internships WHERE id = ? AND provider_id = ?', (payload.internship_id, provider)).fetchone()
            if not internship:
                raise HTTPException(status_code=404, detail='Internship not found for this provider.')
        try:
            cursor = db.execute(
                'INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id) VALUES (?, ?, ?)',
                (payload.mentor_id, payload.intern_id, payload.internship_id),
            )
            db.commit()
        except Exception as error:
            if 'UNIQUE constraint' in str(error):
                raise HTTPException(status_code=409, detail='This intern is already assigned to that mentor.') from error
            raise
        row = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (cursor.lastrowid,)).fetchone()
    return serialize(row)


@router.get('/assignments')
def list_assignments(token=Depends(require_roles('provider'))):
    """Assignments created by the requesting provider (ownership-scoped)."""
    provider = int(token['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT ma.*, u.full_name AS mentor_name, iu.full_name AS intern_name,
                      i.title AS internship_title
               FROM mentor_assignments ma
               JOIN users u ON u.id = ma.mentor_id
               JOIN users iu ON iu.id = ma.intern_id
               JOIN internships i ON i.id = ma.internship_id
               WHERE i.provider_id = ?
               ORDER BY ma.created_at DESC''',
            (provider,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.get('/assignments/mentees/{intern_id}/detail')
def provider_mentee_detail(intern_id: int, token=Depends(require_roles('provider'))):
    """Provider view of one intern across the provider's own internships:
    assignments, projects, tasks, attendance, and outcome. Mirrors the
    mentor detail endpoint but scoped by internship ownership."""
    provider = int(token['sub'])
    with get_db() as db:
        intern = db.execute(
            "SELECT id, full_name, email FROM users WHERE id = ? AND role = 'intern'",
            (intern_id,),
        ).fetchone()
        if not intern:
            raise HTTPException(status_code=404, detail='Intern not found.')

        assignments = db.execute(
            '''SELECT ma.id, ma.status, ma.created_at AS assigned_at, ma.internship_id,
                      i.title AS internship_title, i.department, i.work_mode, i.duration,
                      u.full_name AS mentor_name
               FROM mentor_assignments ma
               JOIN internships i ON i.id = ma.internship_id
               JOIN users u ON u.id = ma.mentor_id
               WHERE ma.intern_id = ? AND i.provider_id = ?
               ORDER BY ma.created_at DESC''',
            (intern_id, provider),
        ).fetchall()

        if not assignments:
            raise HTTPException(status_code=404, detail='This intern is not assigned under any of your internships.')

        assignment_ids = [row['id'] for row in assignments]
        internship_ids = [row['internship_id'] for row in assignments]
        ph_assignments = ', '.join('?' for _ in assignment_ids)
        ph_internships = ', '.join('?' for _ in internship_ids)

        projects = db.execute(
            f'''SELECT p.id, p.title, p.status, p.start_date, p.end_date, p.internship_id,
                       (SELECT COUNT(*) FROM mentor_tasks mt2 WHERE mt2.project_id = p.id) AS task_count,
                       (SELECT COUNT(*) FROM mentor_tasks mt3 WHERE mt3.project_id = p.id AND mt3.status = 'completed') AS completed_tasks
               FROM projects p
               WHERE p.internship_id IN ({ph_internships})
               ORDER BY p.created_at DESC''',
            tuple(internship_ids),
        ).fetchall()

        tasks = db.execute(
            f'''SELECT mt.id, mt.title, mt.status, mt.priority, mt.due_date, mt.created_at,
                       mt.project_id, mt.internship_id,
                       ts.id AS submission_id, ts.status AS submission_status, ts.submitted_at
               FROM mentor_tasks mt
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               WHERE mt.intern_id = ? AND mt.internship_id IN ({ph_internships})
               ORDER BY mt.created_at DESC''',
            (intern_id, *internship_ids),
        ).fetchall()

        attendance = db.execute(
            f'''SELECT COUNT(*) AS sessions,
                       COALESCE(SUM(aw.work_minutes), 0) AS total_work_minutes
               FROM attendance aw
               WHERE aw.intern_id = ?''',
            (intern_id,),
        ).fetchone()

        outcome = db.execute(
            f'''SELECT io.status AS outcome_status, io.duration_weeks, io.goals_completed,
                       io.total_goals, io.tasks_completed, io.total_tasks, io.verified_at
               FROM internship_outcomes io
               WHERE io.intern_id = ? AND io.assignment_id IN ({ph_assignments})''',
            tuple([intern_id, *assignment_ids]),
        ).fetchone()

    return {
        'intern': serialize(intern),
        'assignments': [serialize(a) for a in assignments],
        'projects': [serialize(p) for p in projects],
        'tasks': [serialize(t) for t in tasks],
        'attendance': serialize(attendance),
        'outcome': serialize(outcome) if outcome else None,
    }


@router.get('/assignments/mentors')
def available_mentors(token=Depends(require_roles('provider'))):
    """Mentors available for assignment (role = mentor)."""
    with get_db() as db:
        rows = db.execute(
            "SELECT id, full_name, email, organization FROM users WHERE role = 'mentor' ORDER BY full_name",
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


def serialize(row):
    return dict(row) if row else None


@router.get('/dashboard')
def dashboard(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        seed_mentor_demo_data(db, mentor)
        db.commit()
        interns = db.execute(
            """SELECT u.id, u.full_name, u.email, ma.status, ma.created_at AS assigned_at,
                      COUNT(mt.id) AS task_count,
                      SUM(CASE WHEN mt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
                      MAX(mt.created_at) AS last_activity
               FROM mentor_assignments ma
               JOIN users u ON u.id = ma.intern_id
               LEFT JOIN mentor_tasks mt ON mt.intern_id = u.id AND mt.mentor_id = ma.mentor_id
               WHERE ma.mentor_id = ? AND ma.status = 'active'
               GROUP BY u.id, u.full_name, u.email, ma.status, ma.created_at
               ORDER BY last_activity DESC NULLS LAST""",
            (mentor,),
        ).fetchall()

        serialized_interns = []
        total_tasks_count = 0
        completed_tasks_count = 0
        for row in interns:
            item = dict(row)
            t_cnt = item.get('task_count') or 0
            c_cnt = item.get('completed_tasks') or 0
            item['progress_percent'] = round((c_cnt / t_cnt) * 100, 1) if t_cnt > 0 else 0.0
            serialized_interns.append(item)
            total_tasks_count += t_cnt
            completed_tasks_count += c_cnt

        pending_reviews = db.execute(
            """SELECT ts.id, mt.title, u.full_name AS intern_name, ts.submitted_at, mt.id AS task_id, mt.project_id
               FROM task_submissions ts
               JOIN mentor_tasks mt ON mt.id = ts.task_id
               JOIN users u ON u.id = ts.intern_id
               WHERE mt.mentor_id = ? AND ts.status = 'pending'
               ORDER BY ts.submitted_at DESC""",
            (mentor,),
        ).fetchall()

        projects = db.execute(
            """SELECT p.id, p.title, p.status, p.start_date, p.end_date, i.title AS internship_title,
                      COUNT(mt.id) AS total_tasks,
                      SUM(CASE WHEN mt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
               FROM projects p
               LEFT JOIN internships i ON i.id = p.internship_id
               LEFT JOIN mentor_tasks mt ON mt.project_id = p.id
               WHERE p.mentor_id = ?
               GROUP BY p.id, p.title, p.status, p.start_date, p.end_date, i.title
               ORDER BY p.created_at DESC""",
            (mentor,),
        ).fetchall()

        projects_summary = []
        for p in projects:
            p_dict = dict(p)
            tot = p_dict.get('total_tasks') or 0
            comp = p_dict.get('completed_tasks') or 0
            p_dict['progress_percent'] = round((comp / tot) * 100, 1) if tot > 0 else 0.0
            projects_summary.append(p_dict)

        feedback_count = db.execute(
            'SELECT COUNT(*) AS count FROM mentor_feedback WHERE mentor_id = ?', (mentor,)
        ).fetchone()['count']
        evaluations = db.execute(
            "SELECT * FROM mentor_evaluations WHERE mentor_id = ? AND status = 'draft' ORDER BY due_date IS NULL, due_date",
            (mentor,),
        ).fetchall()

        recent_activity = fetch_mentor_activity(db, mentor, limit=15)
        overall_progress = round((completed_tasks_count / total_tasks_count) * 100, 1) if total_tasks_count > 0 else 0.0

    return {
        'interns': serialized_interns,
        'pending_reviews': [serialize(row) for row in pending_reviews],
        'projects_summary': projects_summary,
        'recent_activity': recent_activity,
        'feedback_count': feedback_count,
        'pending_evaluations': [serialize(row) for row in evaluations],
        'metrics': {
            'assigned_interns': len(interns),
            'pending_reviews': len(pending_reviews),
            'active_projects': len(projects),
            'feedback_entries': feedback_count,
            'upcoming_evaluations': len(evaluations),
            'total_tasks': total_tasks_count,
            'completed_tasks': completed_tasks_count,
            'overall_progress': overall_progress,
        },
    }


@router.get('/activity')
def activity_feed(limit: int = Query(default=20, ge=1, le=100), token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        items = fetch_mentor_activity(db, mentor, limit=limit)
    return {'items': items}


@router.get('/projects/{project_id}/progress')
def project_progress(project_id: int, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        project = db.execute('SELECT * FROM projects WHERE id = ? AND mentor_id = ?', (project_id, mentor)).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail='Project not found for this mentor.')
        return calculate_project_progress(db, project_id)


@router.get('/interns')
def interns(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            """SELECT u.id, u.full_name, u.email, ma.status, ma.created_at AS assigned_at,
                      ma.id AS assignment_id, ma.internship_id,
                      i.title AS internship_title,
                      COUNT(mt.id) AS task_count,
                      COALESCE(SUM(CASE WHEN mt.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_tasks,
                      MAX(mt.created_at) AS last_activity
               FROM mentor_assignments ma
               JOIN users u ON u.id = ma.intern_id
               LEFT JOIN internships i ON i.id = ma.internship_id
               LEFT JOIN mentor_tasks mt ON mt.intern_id = u.id AND mt.mentor_id = ma.mentor_id
               WHERE ma.mentor_id = ?
               GROUP BY u.id, u.full_name, u.email, ma.status, ma.created_at,
                        ma.id, ma.internship_id, i.title
               ORDER BY u.full_name""",
            (mentor,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.get('/tasks')
def tasks(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            """SELECT mt.*, u.full_name AS intern_name,
                      ts.id AS submission_id, ts.status AS submission_status, ts.submitted_at
               FROM mentor_tasks mt JOIN users u ON u.id = mt.intern_id
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               WHERE mt.mentor_id = ? ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC""",
            (mentor,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.post('/tasks', status_code=201)
async def create_task(payload: TaskInput, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        assignment = ensure_assignment(db, mentor, payload.intern_id)
        # Data integrity: if the caller claims an internship, it must be the
        # one the mentor is actually assigned to for this intern. A mentor
        # cannot file a task under an unrelated internship.
        if payload.internship_id is not None:
            assignment_internship = assignment['internship_id']
            if assignment_internship is None or int(assignment_internship) != payload.internship_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail='internship_id does not match your active assignment for this intern.',
                )
        cursor = db.execute(
            'INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (mentor, payload.intern_id, payload.internship_id if payload.internship_id is not None else assignment['internship_id'], payload.title.strip(), payload.description.strip(), payload.priority, payload.due_date),
        )
        task_id = cursor.lastrowid
        await record_and_broadcast_activity(
            db,
            actor_id=mentor,
            actor_role='mentor',
            event_type='task.assigned',
            mentor_id=mentor,
            title='Task Assigned',
            description=f'Mentor assigned task "{payload.title.strip()}"',
            intern_id=payload.intern_id,
            project_id=None,
            task_id=task_id,
            metadata={'priority': payload.priority},
        )
        db.commit()
        row = db.execute('SELECT mt.*, u.full_name AS intern_name FROM mentor_tasks mt JOIN users u ON u.id = mt.intern_id WHERE mt.id = ?', (task_id,)).fetchone()
    return serialize(row)


@router.get('/submissions')
def submissions(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            """SELECT ts.*, mt.title, u.full_name AS intern_name
               FROM task_submissions ts JOIN mentor_tasks mt ON mt.id = ts.task_id
               JOIN users u ON u.id = ts.intern_id
               WHERE mt.mentor_id = ? ORDER BY ts.submitted_at DESC""",
            (mentor,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.patch('/submissions/{submission_id}')
async def review_submission(submission_id: int, decision: str = 'approved', token=Depends(require_roles('mentor'))):
    if decision not in {'approved', 'changes_requested'}:
        raise HTTPException(status_code=422, detail='Decision must be approved or changes_requested.')
    mentor = mentor_id(token)
    with get_db() as db:
        row = db.execute(
            'SELECT ts.* FROM task_submissions ts JOIN mentor_tasks mt ON mt.id = ts.task_id WHERE ts.id = ? AND mt.mentor_id = ?',
            (submission_id, mentor),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Submission not found.')
        now = datetime.now(timezone.utc).isoformat()
        task_status = 'completed' if decision == 'approved' else 'changes_requested'
        db.execute('UPDATE task_submissions SET status = ?, reviewed_at = ? WHERE id = ?', (decision, now, submission_id))
        db.execute('UPDATE mentor_tasks SET status = ? WHERE id = ?', (task_status, row['task_id']))

        task_row = db.execute('SELECT title, project_id FROM mentor_tasks WHERE id = ?', (row['task_id'],)).fetchone()
        task_title = task_row['title'] if task_row else ''
        project_id = task_row['project_id'] if task_row else None

        event_type = 'task.completed' if decision == 'approved' else 'task.changes_requested'
        act_title = 'Submission Approved' if decision == 'approved' else 'Changes Requested'
        act_desc = f'Mentor {"approved" if decision == "approved" else "requested changes on"} task "{task_title}"'

        await record_and_broadcast_activity(
            db,
            actor_id=mentor,
            actor_role='mentor',
            event_type=event_type,
            mentor_id=mentor,
            title=act_title,
            description=act_desc,
            intern_id=row['intern_id'],
            project_id=project_id,
            task_id=row['task_id'],
            metadata={'decision': decision, 'status': task_status},
        )
        db.commit()
    return {'id': submission_id, 'status': decision, 'reviewed_at': now}


@router.get('/interns/{intern_id}/detail')
def intern_detail(intern_id: int, token=Depends(require_roles('mentor'))):
    """Unified mentor view of an assigned intern: profile, tasks, submissions,
    feedback history, and skill observations."""
    mentor = mentor_id(token)
    with get_db() as db:
        ensure_assignment(db, mentor, intern_id)
        intern = db.execute(
            'SELECT id, full_name, email FROM users WHERE id = ?',
            (intern_id,),
        ).fetchone()
        if not intern:
            raise HTTPException(status_code=404, detail='Intern not found.')

        assignment = db.execute(
            '''SELECT ma.id, ma.status, ma.created_at AS assigned_at, i.title AS internship_title,
                      i.department, i.work_mode, i.duration
               FROM mentor_assignments ma
               LEFT JOIN internships i ON i.id = ma.internship_id
               WHERE ma.mentor_id = ? AND ma.intern_id = ? AND ma.status = 'active'
               ORDER BY ma.created_at DESC LIMIT 1''',
            (mentor, intern_id),
        ).fetchone()

        tasks = db.execute(
            '''SELECT mt.*, ts.id AS submission_id, ts.status AS submission_status,
                      ts.submitted_at
               FROM mentor_tasks mt
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               WHERE mt.mentor_id = ? AND mt.intern_id = ?
               ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC''',
            (mentor, intern_id),
        ).fetchall()

        submissions = db.execute(
            '''SELECT ts.id, ts.task_id, ts.content, ts.status, ts.submitted_at, mt.title AS task_title
               FROM task_submissions ts
               JOIN mentor_tasks mt ON mt.id = ts.task_id
               WHERE mt.mentor_id = ? AND ts.intern_id = ?
               ORDER BY ts.submitted_at DESC''',
            (mentor, intern_id),
        ).fetchall()

        feedback = db.execute(
            '''SELECT mf.id, mf.feedback, mf.strengths, mf.improvements, mf.next_steps,
                      mf.created_at, mt.title AS task_title
               FROM mentor_feedback mf
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.mentor_id = ? AND mf.intern_id = ?
               ORDER BY mf.created_at DESC''',
            (mentor, intern_id),
        ).fetchall()

        skills = db.execute(
            '''SELECT s.id, s.name, cs.source
               FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ? ORDER BY s.name''',
            (intern_id,),
        ).fetchall()

        observations = db.execute(
            '''SELECT o.id, o.level, o.note, o.created_at, s.name AS skill_name,
                      mt.title AS task_title
               FROM mentor_skill_observations o
               JOIN skills s ON s.id = o.skill_id
               LEFT JOIN mentor_tasks mt ON mt.id = o.task_id
               WHERE o.mentor_id = ? AND o.intern_id = ?
               ORDER BY o.created_at DESC''',
            (mentor, intern_id),
        ).fetchall()

    return {
        'intern': serialize(intern),
        'assignment': serialize(assignment) if assignment else None,
        'tasks': [serialize(t) for t in tasks],
        'submissions': [serialize(s) for s in submissions],
        'feedback': [serialize(f) for f in feedback],
        'skills': [serialize(s) for s in skills],
        'observations': [serialize(o) for o in observations],
    }


@router.get('/interns/{intern_id}/observations')
def list_observations(intern_id: int, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        ensure_assignment(db, mentor, intern_id)
        rows = db.execute(
            '''SELECT o.id, o.level, o.note, o.created_at, s.name AS skill_name,
                      mt.title AS task_title
               FROM mentor_skill_observations o
               JOIN skills s ON s.id = o.skill_id
               LEFT JOIN mentor_tasks mt ON mt.id = o.task_id
               WHERE o.mentor_id = ? AND o.intern_id = ?
               ORDER BY o.created_at DESC''',
            (mentor, intern_id),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.post('/interns/{intern_id}/observations', status_code=201)
def create_observation(intern_id: int, payload: ObservationInput, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    if payload.intern_id != intern_id:
        raise HTTPException(status_code=422, detail='intern_id must match the URL intern.')
    with get_db() as db:
        ensure_assignment(db, mentor, intern_id)
        if payload.task_id:
            task = db.execute(
                'SELECT id FROM mentor_tasks WHERE id = ? AND mentor_id = ? AND intern_id = ?',
                (payload.task_id, mentor, intern_id),
            ).fetchone()
            if not task:
                raise HTTPException(status_code=404, detail='Task not found for this intern.')
        skill_id, _ = get_or_create_skill(db, payload.skill)
        cursor = db.execute(
            '''INSERT INTO mentor_skill_observations (mentor_id, intern_id, task_id, skill_id, level, note)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (mentor, intern_id, payload.task_id, skill_id, payload.level, payload.note),
        )
        # A mentor observation is stronger evidence than self-declaration:
        # upgrade the source if the skill already exists for this intern.
        db.execute(
            "INSERT INTO candidate_skills (intern_id, skill_id, source)"
            " VALUES (?, ?, 'mentor_observation')"
            " ON CONFLICT(intern_id, skill_id) DO UPDATE SET source = 'mentor_observation'",
            (intern_id, skill_id),
        )
        db.commit()
        row = db.execute(
            '''SELECT o.id, o.level, o.note, o.created_at, s.name AS skill_name
               FROM mentor_skill_observations o JOIN skills s ON s.id = o.skill_id
               WHERE o.id = ?''',
            (cursor.lastrowid,),
        ).fetchone()
    return serialize(row)


@router.get('/feedback')
def feedback(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            """SELECT mf.*, u.full_name AS intern_name, mt.title AS task_title
               FROM mentor_feedback mf JOIN users u ON u.id = mf.intern_id
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.mentor_id = ? ORDER BY mf.created_at DESC""",
            (mentor,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.post('/feedback', status_code=201)
async def create_feedback(payload: FeedbackInput, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        ensure_assignment(db, mentor, payload.intern_id)
        if payload.task_id:
            task = db.execute('SELECT id FROM mentor_tasks WHERE id = ? AND mentor_id = ? AND intern_id = ?', (payload.task_id, mentor, payload.intern_id)).fetchone()
            if not task:
                raise HTTPException(status_code=404, detail='Task not found.')
        cursor = db.execute(
            'INSERT INTO mentor_feedback (mentor_id, intern_id, task_id, feedback, strengths, improvements, next_steps, is_read, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)',
            (mentor, payload.intern_id, payload.task_id, payload.feedback.strip(), payload.strengths, payload.improvements, payload.next_steps),
        )
        await record_and_broadcast_activity(
            db,
            actor_id=mentor,
            actor_role='mentor',
            event_type='feedback.created',
            mentor_id=mentor,
            title='Feedback Added',
            description='Mentor added feedback for intern',
            intern_id=payload.intern_id,
            project_id=None,
            task_id=payload.task_id,
        )
        db.commit()
        row = db.execute('SELECT mf.*, u.full_name AS intern_name FROM mentor_feedback mf JOIN users u ON u.id = mf.intern_id WHERE mf.id = ?', (cursor.lastrowid,)).fetchone()
    return serialize(row)


@router.get('/evaluations')
def evaluations(token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            'SELECT me.*, u.full_name AS intern_name FROM mentor_evaluations me JOIN users u ON u.id = me.intern_id WHERE me.mentor_id = ? ORDER BY me.due_date IS NULL, me.due_date',
            (mentor,),
        ).fetchall()
    return {'items': [serialize(row) for row in rows]}


@router.post('/evaluations', status_code=201)
def create_evaluation(payload: EvaluationInput, token=Depends(require_roles('mentor'))):
    mentor = mentor_id(token)
    with get_db() as db:
        ensure_assignment(db, mentor, payload.intern_id)
        cursor = db.execute(
            'INSERT INTO mentor_evaluations (mentor_id, intern_id, score, summary, status, due_date, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (mentor, payload.intern_id, payload.score, payload.summary.strip(), payload.status, payload.due_date, datetime.now(timezone.utc).isoformat() if payload.status == 'submitted' else None),
        )
        db.commit()
        row = db.execute('SELECT me.*, u.full_name AS intern_name FROM mentor_evaluations me JOIN users u ON u.id = me.intern_id WHERE me.id = ?', (cursor.lastrowid,)).fetchone()
    return serialize(row)



# ============ Mentorship Execution Engine: Phase 1 foundation ============
# Internship → Project → Master Tasks → Project Chunks.
# Distribution of chunks onto intern mentor_tasks is Phase 2 — not built here.


class ProjectInput(BaseModel):
    internship_id: int
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    objective: str | None = Field(default=None, max_length=2000)
    deliverable: str | None = Field(default=None, max_length=2000)
    status: str = Field(default="draft", pattern="^(draft|active|completed|archived)$")
    start_date: str | None = None
    end_date: str | None = None


class DistributeInput(BaseModel):
    mode: str = Field(default="workload_balanced", pattern="^(equal|priority|workload_balanced)$")


class ProjectUpdateInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    objective: str | None = Field(default=None, max_length=2000)
    deliverable: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(draft|active|completed|archived)$")
    start_date: str | None = None
    end_date: str | None = None


class MasterTaskInput(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    estimated_hours: float | None = Field(default=None, ge=0)
    sequence: int | None = Field(default=None, ge=0)


class MasterTaskUpdateInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    priority: str | None = Field(default=None, pattern="^(low|normal|high)$")
    estimated_hours: float | None = Field(default=None, ge=0)
    sequence: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(pending|in_progress|completed)$")


class ChunkInput(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    estimated_hours: float | None = Field(default=None, ge=0)
    sequence: int | None = Field(default=None, ge=0)


class ChunkUpdateInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    priority: str | None = Field(default=None, pattern="^(low|normal|high)$")
    estimated_hours: float | None = Field(default=None, ge=0)
    sequence: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(pending|in_progress|completed)$")


def _owned_project(db, mentor, project_id):
    """Load a project the mentor owns via an active assignment to its internship."""
    project = db.execute(
        """SELECT p.* FROM projects p
           WHERE p.id = ? AND p.mentor_id = ?
             AND EXISTS (
               SELECT 1 FROM mentor_assignments ma
               WHERE ma.mentor_id = p.mentor_id
                 AND ma.internship_id = p.internship_id
                 AND ma.status = 'active'
             )""",
        (project_id, mentor),
    ).fetchone()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return dict(project)


def _owned_master_task(db, mentor, task_id):
    task = db.execute(
        """SELECT mtk.* FROM master_tasks mtk
           JOIN projects p ON p.id = mtk.project_id
           WHERE mtk.id = ? AND p.mentor_id = ?
             AND EXISTS (
               SELECT 1 FROM mentor_assignments ma
               WHERE ma.mentor_id = p.mentor_id
                 AND ma.internship_id = p.internship_id
                 AND ma.status = 'active'
             )""",
        (task_id, mentor),
    ).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Master task not found.")
    return task


@router.get("/projects")
def list_projects(token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        rows = db.execute(
            """SELECT p.*, i.title AS internship_title,
                      (SELECT COUNT(*) FROM master_tasks mtk WHERE mtk.project_id = p.id) AS master_task_count
               FROM projects p
               JOIN internships i ON i.id = p.internship_id
               WHERE p.mentor_id = ?
               ORDER BY p.created_at DESC""",
            (mentor,),
        ).fetchall()
    return {"items": [serialize(row) for row in rows]}


@router.post("/projects", status_code=201)
def create_project(payload: ProjectInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    if payload.start_date and payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="End date cannot precede start date.")
    with get_db() as db:
        # The mentor must hold an active assignment for this internship.
        assignment = db.execute(
            "SELECT id FROM mentor_assignments WHERE mentor_id = ? AND internship_id = ? AND status = 'active'",
            (mentor, payload.internship_id),
        ).fetchone()
        if not assignment:
            raise HTTPException(status_code=403, detail="You are not assigned to this internship.")
        try:
            cursor = db.execute(
                """INSERT INTO projects (internship_id, mentor_id, title, description, objective, deliverable, status, start_date, end_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (payload.internship_id, mentor, payload.title.strip(), payload.description, payload.objective,
                 payload.deliverable, payload.status, payload.start_date, payload.end_date),
            )
            db.commit()
        except Exception as error:
            if "UNIQUE constraint" in str(error):
                raise HTTPException(status_code=409, detail="A project with this title already exists for this internship.") from error
            raise
        row = db.execute("SELECT * FROM projects WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize(row)


@router.get("/projects/{project_id}")
def get_project(project_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        project = _owned_project(db, mentor, project_id)
        tasks = db.execute(
            "SELECT * FROM master_tasks WHERE project_id = ? ORDER BY sequence, id",
            (project_id,),
        ).fetchall()
        chunks = db.execute(
            """SELECT pc.* FROM project_chunks pc
               JOIN master_tasks mtk ON mtk.id = pc.master_task_id
               WHERE mtk.project_id = ? ORDER BY mtk.sequence, mtk.id, pc.sequence, pc.id""",
            (project_id,),
        ).fetchall()
        internship_title = db.execute(
            "SELECT title FROM internships WHERE id = ?", (project["internship_id"],)
        ).fetchone()["title"]
    result = serialize(project)
    result["internship_title"] = internship_title
    result["master_tasks"] = [serialize(t) for t in tasks]
    result["chunks"] = [serialize(c) for c in chunks]
    return result


@router.patch("/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdateInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    fields = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update.")
    with get_db() as db:
        existing = _owned_project(db, mentor, project_id)
        new_start = fields.get("start_date", existing.get("start_date"))
        new_end = fields.get("end_date", existing.get("end_date"))
        if new_start and new_end and new_end < new_start:
            raise HTTPException(status_code=422, detail="End date cannot precede start date.")
        setters = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE projects SET {setters}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*fields.values(), project_id),
        )
        db.commit()
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return serialize(row)


@router.post("/projects/{project_id}/distribute/preview")
def preview_project_distribution(project_id: int, payload: DistributeInput | None = None, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    mode = payload.mode if payload else "workload_balanced"
    with get_db() as db:
        return preview_distribution(db, mentor, project_id, mode)


@router.post("/projects/{project_id}/distribute")
def distribute_project_tasks(project_id: int, payload: DistributeInput | None = None, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    mode = payload.mode if payload else "workload_balanced"
    with get_db() as db:
        return execute_distribution(db, mentor, project_id, mode)


@router.post("/projects/{project_id}/schedule/preview")
def preview_project_schedule(project_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        return preview_schedule(db, mentor, project_id)


@router.post("/projects/{project_id}/schedule")
def schedule_project_tasks(project_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        return execute_schedule(db, mentor, project_id)


@router.get("/projects/{project_id}/tasks")
def list_master_tasks(project_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        _owned_project(db, mentor, project_id)
        rows = db.execute(
            """SELECT mtk.*, (SELECT COUNT(*) FROM project_chunks pc WHERE pc.master_task_id = mtk.id) AS chunk_count
               FROM master_tasks mtk WHERE mtk.project_id = ? ORDER BY mtk.sequence, mtk.id""",
            (project_id,),
        ).fetchall()
    return {"items": [serialize(row) for row in rows]}


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_master_task(project_id: int, payload: MasterTaskInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        _owned_project(db, mentor, project_id)
        sequence = payload.sequence
        if sequence is None:
            sequence = db.execute(
                "SELECT COALESCE(MAX(sequence), -1) + 1 AS next_seq FROM master_tasks WHERE project_id = ?",
                (project_id,),
            ).fetchone()["next_seq"]
        cursor = db.execute(
            """INSERT INTO master_tasks (project_id, title, description, priority, estimated_hours, sequence)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (project_id, payload.title.strip(), payload.description, payload.priority, payload.estimated_hours, sequence),
        )
        db.commit()
        row = db.execute("SELECT * FROM master_tasks WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize(row)


@router.patch("/projects/{project_id}/tasks/{task_id}")
def update_master_task(project_id: int, task_id: int, payload: MasterTaskUpdateInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    fields = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update.")
    with get_db() as db:
        _owned_project(db, mentor, project_id)
        task = db.execute(
            "SELECT * FROM master_tasks WHERE id = ? AND project_id = ?", (task_id, project_id)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Master task not found.")
        setters = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE master_tasks SET {setters}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*fields.values(), task_id),
        )
        db.commit()
        row = db.execute("SELECT * FROM master_tasks WHERE id = ?", (task_id,)).fetchone()
    return serialize(row)


@router.delete("/projects/{project_id}/tasks/{task_id}", status_code=204)
def delete_master_task(project_id: int, task_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        _owned_project(db, mentor, project_id)
        task = db.execute(
            "SELECT * FROM master_tasks WHERE id = ? AND project_id = ?", (task_id, project_id)
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="Master task not found.")
        db.execute("DELETE FROM project_chunks WHERE master_task_id = ?", (task_id,))
        db.execute("DELETE FROM master_tasks WHERE id = ?", (task_id,))
        db.commit()
    return None


@router.get("/tasks/{task_id}/chunks")
def list_chunks(task_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        _owned_master_task(db, mentor, task_id)
        rows = db.execute(
            "SELECT * FROM project_chunks WHERE master_task_id = ? ORDER BY sequence, id", (task_id,)
        ).fetchall()
    return {"items": [serialize(row) for row in rows]}


@router.post("/tasks/{task_id}/chunks", status_code=201)
def create_chunk(task_id: int, payload: ChunkInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        _owned_master_task(db, mentor, task_id)
        sequence = payload.sequence
        if sequence is None:
            sequence = db.execute(
                "SELECT COALESCE(MAX(sequence), -1) + 1 AS next_seq FROM project_chunks WHERE master_task_id = ?",
                (task_id,),
            ).fetchone()["next_seq"]
        cursor = db.execute(
            """INSERT INTO project_chunks (master_task_id, title, description, priority, estimated_hours, sequence)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (task_id, payload.title.strip(), payload.description, payload.priority, payload.estimated_hours, sequence),
        )
        db.commit()
        row = db.execute("SELECT * FROM project_chunks WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize(row)


@router.patch("/chunks/{chunk_id}")
def update_chunk(chunk_id: int, payload: ChunkUpdateInput, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    fields = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update.")
    with get_db() as db:
        chunk = db.execute(
            """SELECT pc.* FROM project_chunks pc
               JOIN master_tasks mtk ON mtk.id = pc.master_task_id
               JOIN projects p ON p.id = mtk.project_id
               WHERE pc.id = ? AND p.mentor_id = ?""",
            (chunk_id, mentor),
        ).fetchone()
        if not chunk:
            raise HTTPException(status_code=404, detail="Chunk not found.")
        setters = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE project_chunks SET {setters}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*fields.values(), chunk_id),
        )
        db.commit()
        row = db.execute("SELECT * FROM project_chunks WHERE id = ?", (chunk_id,)).fetchone()
    return serialize(row)


@router.delete("/chunks/{chunk_id}", status_code=204)
def delete_chunk(chunk_id: int, token=Depends(require_roles("mentor"))):
    mentor = mentor_id(token)
    with get_db() as db:
        chunk = db.execute(
            """SELECT pc.id FROM project_chunks pc
               JOIN master_tasks mtk ON mtk.id = pc.master_task_id
               JOIN projects p ON p.id = mtk.project_id
               WHERE pc.id = ? AND p.mentor_id = ?""",
            (chunk_id, mentor),
        ).fetchone()
        if not chunk:
            raise HTTPException(status_code=404, detail="Chunk not found.")
        db.execute("DELETE FROM project_chunks WHERE id = ?", (chunk_id,))
        db.commit()
    return None
