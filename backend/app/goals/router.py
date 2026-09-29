from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db

router = APIRouter(prefix='/api/goals', tags=['goals'])


class GoalInput(BaseModel):
    assignment_id: int
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    skill_id: int | None = None
    status: str = Field(default='in_progress', pattern='^(in_progress|completed|cancelled)$')


class MilestoneInput(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    status: str = Field(default='pending', pattern='^(pending|in_progress|completed)$')
    due_date: str | None = None


class MilestoneStatusInput(BaseModel):
    status: str = Field(pattern='^(pending|in_progress|completed)$')


@router.post('', status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalInput, user=Depends(require_roles('mentor', 'provider'))):
    mentor_id = int(user['sub'])
    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (payload.assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        intern_id = assignment['intern_id']

        cursor = db.execute(
            '''INSERT INTO internship_goals (assignment_id, intern_id, mentor_id, title, description, skill_id, status)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (payload.assignment_id, intern_id, mentor_id, payload.title.strip(), payload.description, payload.skill_id, payload.status),
        )
        goal_id = cursor.lastrowid
        db.commit()

        row = db.execute('SELECT g.*, s.name AS skill_name FROM internship_goals g LEFT JOIN skills s ON s.id = g.skill_id WHERE g.id = ?', (goal_id,)).fetchone()
    return dict(row)


@router.get('/assignment/{assignment_id}')
def get_assignment_goals(assignment_id: int, user=Depends(require_roles('mentor', 'provider', 'intern'))):
    with get_db() as db:
        goals = db.execute(
            '''SELECT g.*, s.name AS skill_name FROM internship_goals g
               LEFT JOIN skills s ON s.id = g.skill_id
               WHERE g.assignment_id = ? ORDER BY g.id ASC''',
            (assignment_id,),
        ).fetchall()

        result = []
        for g in goals:
            g_dict = dict(g)
            milestones = db.execute(
                'SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY id ASC',
                (g['id'],),
            ).fetchall()
            g_dict['milestones'] = [dict(m) for m in milestones]
            result.append(g_dict)

    return {'items': result}


@router.get('/me')
def get_my_goals(user=Depends(require_roles('intern'))):
    intern_id = int(user['sub'])
    with get_db() as db:
        assignment = db.execute(
            "SELECT * FROM mentor_assignments WHERE intern_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
            (intern_id,),
        ).fetchone()

        if not assignment:
            return {
                'has_assignment': False,
                'goals': [],
                'progress': {
                    'goals_completed': 0,
                    'total_goals': 0,
                    'milestones_completed': 0,
                    'total_milestones': 0,
                    'tasks_completed': 0,
                    'total_tasks': 0,
                },
            }

        goals = db.execute(
            '''SELECT g.*, s.name AS skill_name FROM internship_goals g
               LEFT JOIN skills s ON s.id = g.skill_id
               WHERE g.assignment_id = ? ORDER BY g.id ASC''',
            (assignment['id'],),
        ).fetchall()

        result_goals = []
        tot_milestones = 0
        comp_milestones = 0

        for g in goals:
            g_dict = dict(g)
            milestones = db.execute('SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY id ASC', (g['id'],)).fetchall()
            m_list = [dict(m) for m in milestones]
            g_dict['milestones'] = m_list

            tot_milestones += len(m_list)
            comp_milestones += sum(1 for m in m_list if m['status'] == 'completed')

            result_goals.append(g_dict)

        tot_goals = len(result_goals)
        comp_goals = sum(1 for g in result_goals if g['status'] == 'completed')

        # Real task counts from DB
        tasks_row = db.execute(
            '''SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
               FROM mentor_tasks WHERE intern_id = ?''',
            (intern_id,),
        ).fetchone()
        tot_tasks = tasks_row['total'] or 0
        comp_tasks = tasks_row['completed'] or 0

        # Developing skills from candidate_skills + evidence
        dev_skills_rows = db.execute(
            '''SELECT DISTINCT s.name FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ?''',
            (intern_id,),
        ).fetchall()
        developing_skills = [r['name'] for r in dev_skills_rows]

    return {
        'has_assignment': True,
        'assignment_id': assignment['id'],
        'goals': result_goals,
        'progress': {
            'goals_completed': comp_goals,
            'total_goals': tot_goals,
            'milestones_completed': comp_milestones,
            'total_milestones': tot_milestones,
            'tasks_completed': comp_tasks,
            'total_tasks': tot_tasks,
            'developing_skills': developing_skills,
        },
    }


@router.post('/{goal_id}/milestones', status_code=status.HTTP_201_CREATED)
def add_milestone(goal_id: int, payload: MilestoneInput, user=Depends(require_roles('mentor', 'provider'))):
    with get_db() as db:
        goal = db.execute('SELECT * FROM internship_goals WHERE id = ?', (goal_id,)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail='Goal not found.')

        cursor = db.execute(
            'INSERT INTO goal_milestones (goal_id, title, status, due_date) VALUES (?, ?, ?, ?)',
            (goal_id, payload.title.strip(), payload.status, payload.due_date),
        )
        milestone_id = cursor.lastrowid
        db.commit()

        row = db.execute('SELECT * FROM goal_milestones WHERE id = ?', (milestone_id,)).fetchone()
    return dict(row)


@router.patch('/milestones/{milestone_id}/status')
def update_milestone_status(milestone_id: int, payload: MilestoneStatusInput, user=Depends(require_roles('mentor', 'provider', 'intern'))):
    with get_db() as db:
        result = db.execute('UPDATE goal_milestones SET status = ? WHERE id = ?', (payload.status, milestone_id))
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail='Milestone not found.')

        row = db.execute('SELECT * FROM goal_milestones WHERE id = ?', (milestone_id,)).fetchone()

        # Check if all milestones for goal are completed
        goal_id = row['goal_id']
        pending = db.execute("SELECT COUNT(*) AS count FROM goal_milestones WHERE goal_id = ? AND status != 'completed'", (goal_id,)).fetchone()['count']
        if pending == 0:
            db.execute("UPDATE internship_goals SET status = 'completed' WHERE id = ?", (goal_id,))
            db.commit()

    return dict(row)
