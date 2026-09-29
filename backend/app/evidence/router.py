import json
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db
from app.skills.router import get_or_create_skill

router = APIRouter(prefix='/api/evidence', tags=['evidence'])


class ObservationInput(BaseModel):
    intern_id: int | None = None
    skill_name: str = Field(min_length=1, max_length=60)
    level: str = Field(pattern='^(emerging|developing|proficient|strong)$')
    note: str | None = None
    task_id: int | None = None


class FinalEvaluationInput(BaseModel):
    assignment_id: int
    technical_skills: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    problem_solving: int = Field(ge=1, le=5)
    reliability: int = Field(ge=1, le=5)
    task_execution: int = Field(ge=1, le=5)
    learning_adaptability: int = Field(ge=1, le=5)
    professionalism: int = Field(ge=1, le=5)
    strengths: str = Field(min_length=5)
    areas_for_improvement: str = Field(min_length=5)
    overall_evaluation: str = Field(pattern='^(exceeds_expectations|meets_expectations|needs_improvement)$')
    skill_observations: list[ObservationInput] = Field(default_factory=list)
    status: str = Field(default='submitted', pattern='^(draft|submitted)$')


@router.post('/observations', status_code=status.HTTP_201_CREATED)
def record_mentor_observation(payload: ObservationInput, user=Depends(require_roles('mentor', 'provider'))):
    if not payload.intern_id:
        raise HTTPException(status_code=422, detail='intern_id is required for mentor observation.')

    mentor_id = int(user['sub'])
    with get_db() as db:
        skill_id, norm_name = get_or_create_skill(db, payload.skill_name)

        # Ensure candidate_skills record
        db.execute(
            '''INSERT INTO candidate_skills (intern_id, skill_id, source)
               VALUES (?, ?, 'mentor_observation')
               ON CONFLICT(intern_id, skill_id) DO NOTHING''',
            (payload.intern_id, skill_id),
        )

        # Insert mentor_skill_observations
        cursor = db.execute(
            '''INSERT INTO mentor_skill_observations (mentor_id, intern_id, task_id, skill_id, level, note)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (mentor_id, payload.intern_id, payload.task_id, skill_id, payload.level, payload.note),
        )
        obs_id = cursor.lastrowid

        # Insert into skill_evidence
        level_score_map = {'emerging': 60, 'developing': 75, 'proficient': 88, 'strong': 98}
        score = level_score_map.get(payload.level, 75)

        db.execute(
            '''INSERT INTO skill_evidence (candidate_id, skill_id, source_type, source_id, title, details, score, level)
               VALUES (?, ?, 'mentor_observation', ?, ?, ?, ?, ?)''',
            (
                payload.intern_id,
                skill_id,
                obs_id,
                f"Mentor Observation ({norm_name.capitalize()})",
                payload.note or f"Observed as {payload.level} by mentor during task execution",
                score,
                payload.level,
            ),
        )
        db.commit()

        row = db.execute(
            '''SELECT mso.*, s.name AS skill_name FROM mentor_skill_observations mso
               JOIN skills s ON s.id = mso.skill_id
               WHERE mso.id = ?''',
            (obs_id,),
        ).fetchone()

    return dict(row)


@router.get('/me')
def get_my_evidence(user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT se.*, s.name AS skill_name FROM skill_evidence se
               JOIN skills s ON s.id = se.skill_id
               WHERE se.candidate_id = ?
               ORDER BY se.created_at DESC''',
            (candidate_id,),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/growth/{candidate_id}')
def get_skill_growth_timeline(candidate_id: int, user=Depends(require_roles('intern', 'mentor', 'provider'))):
    with get_db() as db:
        skills = db.execute(
            '''SELECT DISTINCT s.id, s.name FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ? ORDER BY s.name''',
            (candidate_id,),
        ).fetchall()

        growth_by_skill = []
        for sk in skills:
            evidence = db.execute(
                '''SELECT * FROM skill_evidence
                   WHERE candidate_id = ? AND skill_id = ?
                   ORDER BY created_at ASC''',
                (candidate_id, sk['id']),
            ).fetchall()

            growth_by_skill.append({
                'skill_id': sk['id'],
                'skill_name': sk['name'],
                'evidence_count': len(evidence),
                'timeline': [dict(e) for e in evidence],
            })

    return {'candidate_id': candidate_id, 'skills': growth_by_skill}


@router.post('/final-evaluations', status_code=status.HTTP_201_CREATED)
def submit_final_evaluation(payload: FinalEvaluationInput, user=Depends(require_roles('mentor', 'provider'))):
    mentor_id = int(user['sub'])
    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (payload.assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        intern_id = assignment['intern_id']

        skill_obs_json = json.dumps([so.model_dump() for so in payload.skill_observations])

        db.execute(
            '''INSERT INTO final_evaluations (assignment_id, intern_id, mentor_id, technical_skills, communication, problem_solving, reliability, task_execution, learning_adaptability, professionalism, strengths, areas_for_improvement, overall_evaluation, skill_observations, status, submitted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(assignment_id) DO UPDATE SET
               technical_skills=excluded.technical_skills, communication=excluded.communication, problem_solving=excluded.problem_solving,
               reliability=excluded.reliability, task_execution=excluded.task_execution, learning_adaptability=excluded.learning_adaptability,
               professionalism=excluded.professionalism, strengths=excluded.strengths, areas_for_improvement=excluded.areas_for_improvement,
               overall_evaluation=excluded.overall_evaluation, skill_observations=excluded.skill_observations, status=excluded.status, submitted_at=CURRENT_TIMESTAMP''',
            (
                payload.assignment_id,
                intern_id,
                mentor_id,
                payload.technical_skills,
                payload.communication,
                payload.problem_solving,
                payload.reliability,
                payload.task_execution,
                payload.learning_adaptability,
                payload.professionalism,
                payload.strengths,
                payload.areas_for_improvement,
                payload.overall_evaluation,
                skill_obs_json,
                payload.status,
            ),
        )

        fe_row = db.execute('SELECT * FROM final_evaluations WHERE assignment_id = ?', (payload.assignment_id,)).fetchone()
        fe_id = fe_row['id']

        # Save individual skill observations if included
        for so in payload.skill_observations:
            sk_id, norm_name = get_or_create_skill(db, so.skill_name)
            level_score_map = {'emerging': 60, 'developing': 75, 'proficient': 88, 'strong': 98}
            score = level_score_map.get(so.level, 85)

            db.execute(
                '''INSERT INTO skill_evidence (candidate_id, skill_id, source_type, source_id, title, details, score, level)
                   VALUES (?, ?, 'final_evaluation', ?, ?, ?, ?, ?)''',
                (
                    intern_id,
                    sk_id,
                    fe_id,
                    f"Final Evaluation Evidence ({norm_name.capitalize()})",
                    f"Confirmed at {so.level} level by mentor in final internship evaluation",
                    score,
                    so.level,
                ),
            )

        db.commit()

    res = dict(fe_row)
    if res['skill_observations']:
        res['skill_observations'] = json.loads(res['skill_observations'])
    return res


@router.get('/final-evaluations/assignment/{assignment_id}')
def get_final_evaluation(assignment_id: int, user=Depends(require_roles('mentor', 'provider', 'intern'))):
    with get_db() as db:
        fe_row = db.execute('SELECT * FROM final_evaluations WHERE assignment_id = ?', (assignment_id,)).fetchone()
        if not fe_row:
            return {'has_evaluation': False, 'evaluation': None}

    res = dict(fe_row)
    if res['skill_observations']:
        res['skill_observations'] = json.loads(res['skill_observations'])
    return {'has_evaluation': True, 'evaluation': res}
