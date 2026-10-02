import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db

router = APIRouter(prefix='/api/interviews', tags=['interviews'])


class InterviewScheduleInput(BaseModel):
    application_id: int
    interviewer_id: int | None = None
    scheduled_at: str = Field(min_length=10)
    duration_minutes: int = Field(default=30, ge=15, le=180)
    meeting_link: str | None = None
    notes: str | None = None


class InterviewStatusInput(BaseModel):
    status: str = Field(pattern='^(scheduled|confirmed|completed|cancelled|no_show)$')


class SkillEvaluationItem(BaseModel):
    skill_name: str
    rating: int = Field(ge=1, le=5)
    notes: str | None = None


class ScorecardInput(BaseModel):
    technical_skills: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    problem_solving: int = Field(ge=1, le=5)
    role_understanding: int = Field(ge=1, le=5)
    relevant_skills: int = Field(ge=1, le=5)
    overall_recommendation: str = Field(pattern='^(advance|reject|further_review)$')
    evidence_notes: str | None = None
    skill_evaluations: list[SkillEvaluationItem] = Field(default_factory=list)


def parse_iso_dt(dt_str: str) -> datetime:
    try:
        cleaned = dt_str.replace('Z', '+00:00')
        return datetime.fromisoformat(cleaned)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'Invalid ISO datetime string: {dt_str}') from exc


@router.post('/schedule', status_code=status.HTTP_201_CREATED)
def schedule_interview(payload: InterviewScheduleInput, user=Depends(require_roles('provider', 'mentor'))):
    requester_id = int(user['sub'])
    interviewer_id = payload.interviewer_id or requester_id

    new_start = parse_iso_dt(payload.scheduled_at)
    new_end = new_start + timedelta(minutes=payload.duration_minutes)

    with get_db() as db:
        app_row = db.execute(
            '''SELECT a.*, i.provider_id, i.title AS internship_title
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ?''',
            (payload.application_id,),
        ).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail='Application not found.')
        if app_row['provider_id'] != requester_id:
            raise HTTPException(status_code=403, detail='You are not authorized to schedule interviews for this internship.')
        if app_row['status'] not in ('shortlisted', 'interview'):
            raise HTTPException(status_code=400, detail='Only shortlisted or interview-stage applications can be scheduled.')

        candidate_id = app_row['applicant_id']
        internship_id = app_row['internship_id']

        existing_interviews = db.execute(
            '''SELECT * FROM interviews
               WHERE (candidate_id = ? OR interviewer_id = ?)
                 AND status IN ('scheduled', 'confirmed')''',
            (candidate_id, interviewer_id),
        ).fetchall()

        for ext in existing_interviews:
            ext_start = parse_iso_dt(ext['scheduled_at'])
            ext_end = ext_start + timedelta(minutes=ext['duration_minutes'])
            if max(new_start, ext_start) < min(new_end, ext_end):
                is_candidate = ext['candidate_id'] == candidate_id
                conflict_role = 'Candidate' if is_candidate else 'Interviewer'
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Interview scheduling conflict detected: {conflict_role} has another interview scheduled at {ext['scheduled_at']}."
                )

        meeting_link = payload.meeting_link or f"https://meet.internflow.com/interview-{payload.application_id}"

        cursor = db.execute(
            '''INSERT INTO interviews (application_id, internship_id, candidate_id, interviewer_id, scheduled_at, duration_minutes, meeting_link, notes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id''',
            (
                payload.application_id,
                internship_id,
                candidate_id,
                interviewer_id,
                new_start.isoformat(),
                payload.duration_minutes,
                meeting_link,
                payload.notes,
            ),
        )
        interview_id = cursor.fetchone()['id']

        db.execute("UPDATE applications SET status = 'interview' WHERE id = ?", (payload.application_id,))
        db.commit()

        row = db.execute('SELECT * FROM interviews WHERE id = ?', (interview_id,)).fetchone()

    return dict(row)


@router.get('/mine')
def list_my_interviews(user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT iv.*, i.title AS internship_title, u.full_name AS interviewer_name
               FROM interviews iv
               JOIN internships i ON i.id = iv.internship_id
               JOIN users u ON u.id = iv.interviewer_id
               WHERE iv.candidate_id = ?
               ORDER BY iv.scheduled_at DESC''',
            (candidate_id,),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/provider')
def list_provider_interviews(user=Depends(require_roles('provider', 'mentor'))):
    user_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT iv.*, i.title AS internship_title, u.full_name AS candidate_name, u.email AS candidate_email
               FROM interviews iv
               JOIN internships i ON i.id = iv.internship_id
               JOIN users u ON u.id = iv.candidate_id
               WHERE iv.interviewer_id = ? OR i.provider_id = ?
               ORDER BY iv.scheduled_at DESC''',
            (user_id, user_id),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/eligible-candidates')
def get_eligible_candidates_for_internship(internship_id: int, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT a.id AS application_id, a.applicant_id AS candidate_id, u.full_name AS candidate_name, u.email AS candidate_email, a.status, a.created_at
               FROM applications a
               JOIN users u ON u.id = a.applicant_id
               JOIN internships i ON i.id = a.internship_id
               WHERE i.provider_id = ? AND a.internship_id = ? AND a.status = 'interview'
               ORDER BY a.created_at DESC''',
            (provider_id, internship_id),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}


@router.get('/application/{application_id}')
def get_interview_for_application(application_id: int, user=Depends(require_roles('provider', 'intern', 'mentor'))):
    current_user_id = int(user['sub'])
    with get_db() as db:
        app_row = db.execute(
            'SELECT * FROM applications WHERE id = ?',
            (application_id,),
        ).fetchone()
        if not app_row:
            return {'has_interview': False, 'interview': None}

        if user['role'] == 'intern':
            if app_row['applicant_id'] != current_user_id:
                raise HTTPException(status_code=403, detail='You do not have access to this interview.')
        elif user['role'] == 'provider':
            internship_row = db.execute('SELECT provider_id FROM internships WHERE id = ?', (app_row['internship_id'],)).fetchone()
            if not internship_row or internship_row['provider_id'] != current_user_id:
                raise HTTPException(status_code=403, detail='You do not have access to this interview.')
        elif user['role'] == 'mentor':
            interviewer_row = db.execute('SELECT interviewer_id FROM interviews WHERE application_id = ? ORDER BY id DESC LIMIT 1', (application_id,)).fetchone()
            if not interviewer_row or interviewer_row['interviewer_id'] != current_user_id:
                raise HTTPException(status_code=403, detail='You do not have access to this interview.')

        row = db.execute(
            '''SELECT iv.*, i.title AS internship_title, u.full_name AS candidate_name, m.full_name AS interviewer_name,
                      sc.id AS scorecard_id, sc.overall_recommendation, sc.technical_skills, sc.communication, sc.evidence_notes
               FROM interviews iv
               JOIN internships i ON i.id = iv.internship_id
               JOIN users u ON u.id = iv.candidate_id
               JOIN users m ON m.id = iv.interviewer_id
               LEFT JOIN interview_scorecards sc ON sc.interview_id = iv.id
               WHERE iv.application_id = ? ORDER BY iv.id DESC LIMIT 1''',
            (application_id,),
        ).fetchone()

        if not row:
            return {'has_interview': False, 'interview': None}

    return {'has_interview': True, 'interview': dict(row)}


@router.patch('/{interview_id}/status')
def update_interview_status(interview_id: int, payload: InterviewStatusInput, user=Depends(require_roles('provider', 'mentor', 'intern'))):
    with get_db() as db:
        result = db.execute('UPDATE interviews SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (payload.status, interview_id))
        db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail='Interview not found.')
        row = db.execute('SELECT * FROM interviews WHERE id = ?', (interview_id,)).fetchone()
    return dict(row)


# ================= Interview Scorecards & Evidence =================

@router.post('/{interview_id}/scorecard', status_code=status.HTTP_201_CREATED)
def submit_interview_scorecard(interview_id: int, payload: ScorecardInput, user=Depends(require_roles('provider', 'mentor'))):
    interviewer_id = int(user['sub'])
    with get_db() as db:
        interview = db.execute('SELECT * FROM interviews WHERE id = ?', (interview_id,)).fetchone()
        if not interview:
            raise HTTPException(status_code=404, detail='Interview not found.')

        candidate_id = interview['candidate_id']
        eval_json = json.dumps([e.model_dump() for e in payload.skill_evaluations])

        db.execute(
            '''INSERT INTO interview_scorecards (interview_id, candidate_id, interviewer_id, technical_skills, communication, problem_solving, role_understanding, relevant_skills, overall_recommendation, evidence_notes, skill_evaluations)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(interview_id) DO UPDATE SET
               technical_skills=excluded.technical_skills, communication=excluded.communication, problem_solving=excluded.problem_solving,
               role_understanding=excluded.role_understanding, relevant_skills=excluded.relevant_skills, overall_recommendation=excluded.overall_recommendation,
               evidence_notes=excluded.evidence_notes, skill_evaluations=excluded.skill_evaluations''',
            (
                interview_id,
                candidate_id,
                interviewer_id,
                payload.technical_skills,
                payload.communication,
                payload.problem_solving,
                payload.role_understanding,
                payload.relevant_skills,
                payload.overall_recommendation,
                payload.evidence_notes,
                eval_json,
            ),
        )

        # Mark interview as completed
        db.execute("UPDATE interviews SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (interview_id,))

        # Convert evaluated skills into Evidence records!
        for ev in payload.skill_evaluations:
            sk_row = db.execute('SELECT id, name FROM skills WHERE name = %s', (ev.skill_name.casefold(),)).fetchone()
            if not sk_row:
                cursor = db.execute('INSERT INTO skills (name) VALUES (%s) RETURNING id', (ev.skill_name.casefold(),))
                sk_id = cursor.fetchone()['id']
            else:
                sk_id = sk_row['id']

            db.execute(
                '''INSERT INTO candidate_skills (intern_id, skill_id, source)
                   VALUES (?, ?, 'interview')
                   ON CONFLICT(intern_id, skill_id) DO NOTHING''',
                (candidate_id, sk_id),
            )

            pct_score = int(ev.rating / 5.0 * 100)
            note_str = ev.notes or payload.evidence_notes or f"Rated {ev.rating}/5 in technical interview"

            db.execute(
                '''INSERT INTO skill_evidence (candidate_id, skill_id, source_type, source_id, title, details, score, level)
                   VALUES (?, ?, 'interview', ?, ?, ?, ?, ?)''',
                (
                    candidate_id,
                    sk_id,
                    interview_id,
                    f"Interview Evidence ({ev.skill_name})",
                    note_str,
                    pct_score,
                    f"{ev.rating}/5",
                ),
            )

        db.commit()

        scorecard = db.execute('SELECT * FROM interview_scorecards WHERE interview_id = ?', (interview_id,)).fetchone()

    res = dict(scorecard)
    if res['skill_evaluations']:
        res['skill_evaluations'] = json.loads(res['skill_evaluations'])
    return res


@router.get('/{interview_id}/scorecard')
def get_interview_scorecard(interview_id: int, user=Depends(require_roles('provider', 'mentor', 'intern'))):
    with get_db() as db:
        scorecard = db.execute('SELECT * FROM interview_scorecards WHERE interview_id = ?', (interview_id,)).fetchone()
        if not scorecard:
            raise HTTPException(status_code=404, detail='Scorecard not found for this interview.')

    res = dict(scorecard)
    if res['skill_evaluations']:
        res['skill_evaluations'] = json.loads(res['skill_evaluations'])
    return res


class AIQuestionGenInput(BaseModel):
    application_id: int


@router.post('/ai-generate-questions')
def generate_ai_interview_questions(payload: AIQuestionGenInput, user=Depends(require_roles('provider', 'mentor'))):
    with get_db() as db:
        app_row = db.execute(
            '''SELECT a.*, i.title AS internship_title, i.description AS internship_description
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ?''',
            (payload.application_id,),
        ).fetchone()

        if not app_row:
            raise HTTPException(status_code=404, detail='Application not found.')

        req_skills = db.execute(
            '''SELECT s.name FROM internship_skills isx
               JOIN skills s ON s.id = isx.skill_id
               WHERE isx.internship_id = ?''',
            (app_row['internship_id'],),
        ).fetchall()
        skill_list = [s['name'] for s in req_skills]

    from app.interviews.question_generator import generate_interview_questions_ai
    questions = generate_interview_questions_ai(
        internship_title=app_row['internship_title'],
        internship_description=app_row['internship_description'],
        skills=skill_list,
        candidate_resume_text=app_row['resume_text'],
    )
    return {'application_id': payload.application_id, 'questions': questions}

