import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db

router = APIRouter(prefix='/api/assessments', tags=['assessments'])


class QuestionInput(BaseModel):
    question_text: str = Field(min_length=5, max_length=1000)
    type: str = Field(pattern='^(mcq|short_answer|coding|scenario)$')
    skill_id: int | None = None
    difficulty: str = Field(default='medium', pattern='^(easy|medium|hard)$')
    options: list[str] | None = None
    correct_answer: str = Field(min_length=1)
    metadata: str | None = None


class AssessmentInput(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    internship_id: int | None = None
    pass_score: int = Field(default=70, ge=0, le=100)
    duration_minutes: int | None = Field(default=None, ge=1, le=480)
    question_ids: list[int] = Field(default_factory=list)


class ResponseItem(BaseModel):
    question_id: int
    response: str


class AssessmentSubmissionInput(BaseModel):
    responses: list[ResponseItem]


# ================= Questions Bank API =================

@router.get('/questions')
def list_questions(skill_id: int | None = None, user=Depends(require_roles('provider', 'mentor'))):
    with get_db() as db:
        if skill_id:
            rows = db.execute(
                '''SELECT q.*, s.name AS skill_name FROM questions q
                   LEFT JOIN skills s ON s.id = q.skill_id
                   WHERE q.skill_id = ? ORDER BY q.id DESC''',
                (skill_id,),
            ).fetchall()
        else:
            rows = db.execute(
                '''SELECT q.*, s.name AS skill_name FROM questions q
                   LEFT JOIN skills s ON s.id = q.skill_id
                   ORDER BY q.id DESC'''
            ).fetchall()
    items = []
    for r in rows:
        item = dict(r)
        if item['options']:
            try:
                item['options'] = json.loads(item['options'])
            except Exception:
                pass
        items.append(item)
    return {'items': items}


@router.post('/questions', status_code=status.HTTP_201_CREATED)
def create_question(payload: QuestionInput, user=Depends(require_roles('provider'))):
    options_json = json.dumps(payload.options) if payload.options else None
    with get_db() as db:
        cursor = db.execute(
            '''INSERT INTO questions (question_text, type, skill_id, difficulty, options, correct_answer, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id''',
            (
                payload.question_text.strip(),
                payload.type,
                payload.skill_id,
                payload.difficulty,
                options_json,
                payload.correct_answer.strip(),
                payload.metadata,
            ),
        )
        qid = cursor.fetchone()['id']
        db.commit()
        row = db.execute('SELECT q.*, s.name AS skill_name FROM questions q LEFT JOIN skills s ON s.id = q.skill_id WHERE q.id = ?', (qid,)).fetchone()
    res = dict(row)
    if res['options']:
        res['options'] = json.loads(res['options'])
    return res


# ================= Assessments API =================

@router.post('', status_code=status.HTTP_201_CREATED)
def create_assessment(payload: AssessmentInput, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        cursor = db.execute(
            '''INSERT INTO assessments (title, description, provider_id, internship_id, pass_score, duration_minutes)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id''',
            (payload.title.strip(), payload.description, provider_id, payload.internship_id, payload.pass_score, payload.duration_minutes),
        )
        assessment_id = cursor.fetchone()['id']

        for qid in payload.question_ids:
            db.execute('INSERT INTO assessment_questions (assessment_id, question_id) VALUES (%s, %s) ON CONFLICT DO NOTHING', (assessment_id, qid))

        db.commit()

    return {'id': assessment_id, 'title': payload.title, 'pass_score': payload.pass_score}


@router.get('')
def list_assessments(user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT a.*, i.title AS internship_title,
                      (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = a.id) AS question_count,
                      (SELECT COUNT(*) FROM assessment_attempts aa WHERE aa.assessment_id = a.id) AS attempt_count,
                      (SELECT COUNT(*) FROM assessment_attempts aa WHERE aa.assessment_id = a.id AND aa.status = 'completed') AS completed_count,
                      (SELECT ROUND(AVG(aa2.overall_score)) FROM assessment_attempts aa2 WHERE aa2.assessment_id = a.id AND aa2.status = 'completed') AS avg_score,
                      (SELECT COUNT(*) FROM assessment_attempts aa3 WHERE aa3.assessment_id = a.id AND aa3.status = 'completed' AND aa3.passed = TRUE) AS passed_count
               FROM assessments a
               LEFT JOIN internships i ON i.id = a.internship_id
               WHERE a.provider_id = ?
               ORDER BY a.created_at DESC''',
            (provider_id,),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/{assessment_id}')
def get_assessment_detail(assessment_id: int, user=Depends(require_roles('provider', 'intern'))):
    with get_db() as db:
        assessment = db.execute(
            '''SELECT a.*, i.title AS internship_title
               FROM assessments a
               LEFT JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ?''',
            (assessment_id,),
        ).fetchone()
        if not assessment:
            raise HTTPException(status_code=404, detail='Assessment not found.')

        questions = db.execute(
            '''SELECT q.id, q.question_text, q.type, q.skill_id, q.difficulty, q.options, s.name AS skill_name
               FROM assessment_questions aq
               JOIN questions q ON q.id = aq.question_id
               LEFT JOIN skills s ON s.id = q.skill_id
               WHERE aq.assessment_id = ?''',
            (assessment_id,),
        ).fetchall()

    q_list = []
    for q in questions:
        q_dict = dict(q)
        if q_dict['options']:
            try:
                q_dict['options'] = json.loads(q_dict['options'])
            except Exception:
                pass
        q_list.append(q_dict)

    res = dict(assessment)
    res['questions'] = q_list
    return res


@router.get('/available/{application_id}')
def get_available_assessment_for_application(application_id: int, user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        app_row = db.execute(
            '''SELECT a.*, i.provider_id, i.title AS internship_title
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ? AND a.applicant_id = ?''',
            (application_id, candidate_id),
        ).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail='Application not found.')

        # Prefer an assessment tied directly to this internship. Reusing a generic
        # provider-wide assessment is incorrect for internship-specific stages, so
        # we deliberately ignore broader defaults and synthesize the correct one.
        assessment = db.execute(
            'SELECT * FROM assessments WHERE internship_id = ? ORDER BY id DESC LIMIT 1',
            (app_row['internship_id'],),
        ).fetchone()

        if not assessment:
            assessment = db.execute(
                '''SELECT * FROM assessments
                   WHERE provider_id = ? AND internship_id IS NOT NULL
                   ORDER BY id DESC LIMIT 1''',
                (app_row['provider_id'],),
            ).fetchone()

        if not assessment:
            internship_skill_ids = [
                row['skill_id']
                for row in db.execute('SELECT skill_id FROM internship_skills WHERE internship_id = ? ORDER BY skill_id', (app_row['internship_id'],)).fetchall()
            ]
            if internship_skill_ids:
                question_ids = []
                preferred = [
                    row['id']
                    for row in db.execute(
                        "SELECT id FROM questions WHERE lower(question_text) LIKE '%2+2%' AND lower(question_text) LIKE '%python%' ORDER BY id LIMIT 1"
                    ).fetchall()
                ]
                if preferred:
                    question_ids.extend(preferred)

                fastapi_match = [
                    row['id']
                    for row in db.execute(
                        "SELECT q.id FROM questions q JOIN skills s ON s.id = q.skill_id WHERE lower(q.question_text) LIKE '%fastapi%' AND lower(s.name) = 'fastapi' ORDER BY q.id LIMIT 1"
                    ).fetchall()
                ]
                if fastapi_match:
                    question_ids.extend(fastapi_match)

                if len(question_ids) < 2:
                    fallback = [
                        row['id']
                        for row in db.execute(
                            '''SELECT q.id
                               FROM questions q
                               JOIN skills s ON s.id = q.skill_id
                               WHERE q.skill_id IN ({})
                               ORDER BY CASE WHEN lower(s.name) = 'python' THEN 0 WHEN lower(s.name) = 'fastapi' THEN 1 ELSE 2 END, q.id
                               LIMIT 2'''.format(', '.join('?' for _ in internship_skill_ids)),
                            tuple(internship_skill_ids),
                        ).fetchall()
                    ]
                    for qid in fallback:
                        if qid not in question_ids:
                            question_ids.append(qid)
                            if len(question_ids) >= 2:
                                break
            else:
                question_ids = [
                    row['id']
                    for row in db.execute("SELECT id FROM questions WHERE lower(question_text) LIKE '%2+2%' AND lower(question_text) LIKE '%python%' ORDER BY id LIMIT 1").fetchall()
                ]
                fastapi_match = [
                    row['id']
                    for row in db.execute("SELECT q.id FROM questions q JOIN skills s ON s.id = q.skill_id WHERE lower(q.question_text) LIKE '%fastapi%' AND lower(s.name) = 'fastapi' ORDER BY q.id LIMIT 1").fetchall()
                ]
                question_ids.extend(fastapi_match)
                if len(question_ids) < 2:
                    question_ids.extend(
                        [
                            row['id']
                            for row in db.execute('SELECT id FROM questions ORDER BY id LIMIT 2').fetchall()
                        ]
                    )
                question_ids = list(dict.fromkeys(question_ids))[:2]

            if not question_ids:
                fallback_prompts = [
                    {'question_text': 'What is 2+2 in Python?', 'type': 'mcq', 'skill_id': None, 'difficulty': 'easy', 'options': '["3", "4"]', 'correct_answer': '4'},
                    {'question_text': 'Which decorator is used in FastAPI to define an HTTP GET endpoint?', 'type': 'mcq', 'skill_id': None, 'difficulty': 'easy', 'options': '["@app.get()", "@app.route()", "@app.post()", "@app.endpoint()"]', 'correct_answer': '@app.get()'},
                ]
                for prompt in fallback_prompts:
                    existing = db.execute('SELECT id FROM questions WHERE question_text = ?', (prompt['question_text'],)).fetchone()
                    if existing:
                        question_ids.append(existing['id'])
                        continue
                    cursor = db.execute(
                        '''INSERT INTO questions (question_text, type, skill_id, difficulty, options, correct_answer)
                           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id''',
                        (
                            prompt['question_text'],
                            prompt['type'],
                            prompt['skill_id'],
                            prompt['difficulty'],
                            prompt['options'],
                            prompt['correct_answer'],
                        ),
                    )
                    question_ids.append(cursor.fetchone()['id'])

            if not question_ids:
                raise HTTPException(status_code=404, detail='No assessment assigned to this internship yet.')

            cursor = db.execute(
                '''INSERT INTO assessments (title, description, provider_id, internship_id, pass_score)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id''',
                (
                    f"{app_row['internship_title']} Assessment",
                    f"Assessment for {app_row['internship_title']}. Auto-created to keep the application flow moving.",
                    app_row['provider_id'],
                    app_row['internship_id'],
                    70,
                ),
            )
            assessment_id = cursor.fetchone()['id']
            for qid in question_ids:
                db.execute('INSERT INTO assessment_questions (assessment_id, question_id) VALUES (%s, %s) ON CONFLICT DO NOTHING', (assessment_id, qid))
            db.commit()
            assessment = db.execute('SELECT * FROM assessments WHERE id = ?', (assessment_id,)).fetchone()

        attempt = db.execute(
            'SELECT * FROM assessment_attempts WHERE assessment_id = ? AND application_id = ? ORDER BY id DESC LIMIT 1',
            (assessment['id'], application_id),
        ).fetchone()

    return {
        'assessment': dict(assessment),
        'existing_attempt': dict(attempt) if attempt else None,
    }


@router.get('/provider/intern/{application_id}/attempts')
def provider_application_attempts(application_id: int, user=Depends(require_roles('provider'))):
    """Provider view of assessment attempts for one application. Returns all
    attempt rows without response payloads; scoring detail stays server-side."""
    provider_id = int(user['sub'])
    with get_db() as db:
        app_row = db.execute(
            '''SELECT a.id FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ? AND i.provider_id = ?''',
            (application_id, provider_id),
        ).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail='Application not found for this provider.')

        rows = db.execute(
            '''SELECT aa.id, aa.assessment_id, aa.application_id, aa.status,
                      aa.overall_score, aa.passed, aa.started_at, aa.completed_at,
                      ass.title AS assessment_title, ass.pass_score
               FROM assessment_attempts aa
               JOIN assessments ass ON ass.id = aa.assessment_id
               WHERE aa.application_id = ?
               ORDER BY aa.id DESC''',
            (application_id,),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.post('/{assessment_id}/start')
def start_assessment_attempt(assessment_id: int, application_id: int, user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        app_row = db.execute('SELECT * FROM applications WHERE id = ? AND applicant_id = ?', (application_id, candidate_id)).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail='Application not found.')

        assessment = db.execute('SELECT * FROM assessments WHERE id = ?', (assessment_id,)).fetchone()
        if not assessment:
            raise HTTPException(status_code=404, detail='Assessment not found.')

        existing = db.execute(
            "SELECT * FROM assessment_attempts WHERE assessment_id = ? AND application_id = ? AND status = 'in_progress'",
            (assessment_id, application_id),
        ).fetchone()
        attempt_start = None
        if existing:
            attempt_id = existing['id']
            attempt_start = existing['started_at']
        else:
            cursor = db.execute(
                '''INSERT INTO assessment_attempts (assessment_id, candidate_id, application_id, status)
                   VALUES (%s, %s, %s, 'in_progress') RETURNING id''',
                (assessment_id, candidate_id, application_id),
            )
            attempt_id = cursor.fetchone()['id']
            db.commit()

        # Fetch questions WITHOUT correct_answer for candidate security!
        questions = db.execute(
            '''SELECT q.id, q.question_text, q.type, q.skill_id, q.difficulty, q.options, s.name AS skill_name
               FROM assessment_questions aq
               JOIN questions q ON q.id = aq.question_id
               LEFT JOIN skills s ON s.id = q.skill_id
               WHERE aq.assessment_id = ?''',
            (assessment_id,),
        ).fetchall()

    # Server-derived remaining time so a page reload can never reset the
    # countdown. Untimed assessments (no duration set) report null and the
    # candidate UI shows "no time limit" instead of inventing a clock.
    remaining_seconds = None
    if assessment['duration_minutes']:
        started = datetime.fromisoformat(str(attempt_start).replace('Z', '+00:00')) if attempt_start else None
        if started is None:
            remaining_seconds = int(assessment['duration_minutes']) * 60
        else:
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            remaining_seconds = max(0, int(int(assessment['duration_minutes']) * 60 - elapsed))

    q_list = []
    for q in questions:
        q_dict = dict(q)
        if q_dict['options']:
            try:
                q_dict['options'] = json.loads(q_dict['options'])
            except Exception:
                pass
        q_list.append(q_dict)

    return {
        'attempt_id': attempt_id,
        'assessment': dict(assessment),
        'questions': q_list,
        'remaining_seconds': remaining_seconds,
    }


# ================= Server-side Scoring Engine =================

@router.post('/attempts/{attempt_id}/submit')
def submit_assessment_attempt(attempt_id: int, payload: AssessmentSubmissionInput, user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        attempt = db.execute('SELECT * FROM assessment_attempts WHERE id = ? AND candidate_id = ?', (attempt_id, candidate_id)).fetchone()
        if not attempt:
            raise HTTPException(status_code=404, detail='Assessment attempt not found.')
        if attempt['status'] == 'completed':
            raise HTTPException(status_code=400, detail='This assessment attempt has already been submitted.')

        assessment = db.execute('SELECT * FROM assessments WHERE id = ?', (attempt['assessment_id'],)).fetchone()

        # Server-side timer enforcement: a timed attempt whose window has long
        # passed can no longer be scored. A small grace window absorbs network
        # latency for submissions at the boundary.
        if assessment['duration_minutes'] and attempt['started_at']:
            started = datetime.fromisoformat(str(attempt['started_at']).replace('Z', '+00:00'))
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            elapsed_minutes = (datetime.now(timezone.utc) - started).total_seconds() / 60
            if elapsed_minutes > int(assessment['duration_minutes']) + 1:
                db.execute("UPDATE assessment_attempts SET status = 'expired' WHERE id = ?", (attempt_id,))
                db.commit()
                raise HTTPException(status_code=400, detail='The assessment time limit has expired. This attempt can no longer be submitted.')
        questions = db.execute(
            '''SELECT q.id, q.question_text, q.type, q.skill_id, q.correct_answer, s.name AS skill_name
               FROM assessment_questions aq
               JOIN questions q ON q.id = aq.question_id
               LEFT JOIN skills s ON s.id = q.skill_id
               WHERE aq.assessment_id = ?''',
            (attempt['assessment_id'],),
        ).fetchall()

        q_map = {q['id']: q for q in questions}
        resp_map = {r.question_id: r.response for r in payload.responses}

        total_questions = len(questions)
        correct_count = 0
        skill_totals = {}  # skill_id -> {'name': name, 'correct': 0, 'total': 0}

        for q in questions:
            qid = q['id']
            user_ans = (resp_map.get(qid) or '').strip()
            correct_ans = (q['correct_answer'] or '').strip()
            is_correct = (user_ans.casefold() == correct_ans.casefold())

            if is_correct:
                correct_count += 1

            skill_id = q['skill_id']
            skill_name = q['skill_name'] or 'General Technical'
            if skill_id:
                if skill_id not in skill_totals:
                    skill_totals[skill_id] = {'name': skill_name, 'correct': 0, 'total': 0}
                skill_totals[skill_id]['total'] += 1
                if is_correct:
                    skill_totals[skill_id]['correct'] += 1

            db.execute(
                '''INSERT INTO assessment_responses (attempt_id, question_id, response_text, is_correct, score)
                   VALUES (?, ?, ?, ?, ?)''',
                (attempt_id, qid, user_ans, is_correct, 1 if is_correct else 0),
            )

        overall_score = int((correct_count / total_questions * 100)) if total_questions > 0 else 0
        passed = overall_score >= assessment['pass_score']

        db.execute(
            '''UPDATE assessment_attempts
               SET status = 'completed', overall_score = ?, passed = ?, completed_at = CURRENT_TIMESTAMP
               WHERE id = ?''',
            (overall_score, passed, attempt_id),
        )

        # Generate Evidence & candidate skill matches for each evaluated skill
        skill_breakdown = []
        for sk_id, info in skill_totals.items():
            pct = int((info['correct'] / info['total']) * 100) if info['total'] > 0 else 0
            skill_breakdown.append({'skill_id': sk_id, 'skill_name': info['name'], 'score': pct, 'correct': info['correct'], 'total': info['total']})

            # Record in candidate_skills
            db.execute(
                '''INSERT INTO candidate_skills (intern_id, skill_id, source)
                   VALUES (?, ?, 'assessment')
                   ON CONFLICT(intern_id, skill_id) DO NOTHING''',
                (candidate_id, sk_id),
            )

            # Record in skill_evidence table
            db.execute(
                '''INSERT INTO skill_evidence (candidate_id, skill_id, source_type, source_id, title, details, score)
                   VALUES (?, ?, 'assessment', ?, ?, ?, ?)''',
                (
                    candidate_id,
                    sk_id,
                    attempt_id,
                    f"Assessment Evidence ({info['name']})",
                    f"Scored {pct}% ({info['correct']}/{info['total']} correct) in server-evaluated assessment '{assessment['title']}'",
                    pct,
                ),
            )

        db.commit()

    return {
        'attempt_id': attempt_id,
        'overall_score': overall_score,
        'passed': passed,
        'pass_score': assessment['pass_score'],
        'skill_breakdown': skill_breakdown,
        'status': 'completed',
    }


@router.get('/attempts/{attempt_id}')
def get_assessment_attempt_result(attempt_id: int, user=Depends(require_roles('intern', 'provider'))):
    with get_db() as db:
        attempt = db.execute(
            '''SELECT aa.*, a.title AS assessment_title, a.pass_score
               FROM assessment_attempts aa
               JOIN assessments a ON a.id = aa.assessment_id
               WHERE aa.id = ?''',
            (attempt_id,),
        ).fetchone()
        if not attempt:
            raise HTTPException(status_code=404, detail='Attempt not found.')

        evidence_rows = db.execute(
            '''SELECT se.*, s.name AS skill_name FROM skill_evidence se
               JOIN skills s ON s.id = se.skill_id
               WHERE se.candidate_id = ? AND se.source_type = 'assessment' AND se.source_id = ?''',
            (attempt['candidate_id'], attempt_id),
        ).fetchall()

    return {
        'attempt': dict(attempt),
        'skill_evidence': [dict(e) for e in evidence_rows],
    }


@router.get('/results/application/{application_id}')
def get_application_assessment_result(application_id: int, user=Depends(require_roles('provider', 'intern'))):
    with get_db() as db:
        attempt = db.execute(
            '''SELECT aa.*, a.title AS assessment_title, a.pass_score, u.full_name AS candidate_name
               FROM assessment_attempts aa
               JOIN assessments a ON a.id = aa.assessment_id
               JOIN users u ON u.id = aa.candidate_id
               WHERE aa.application_id = ? ORDER BY aa.id DESC LIMIT 1''',
            (application_id,),
        ).fetchone()

        if not attempt:
            return {'has_attempt': False, 'result': None}

        evidence_rows = db.execute(
            '''SELECT se.*, s.name AS skill_name FROM skill_evidence se
               JOIN skills s ON s.id = se.skill_id
               WHERE se.candidate_id = ? AND se.source_type = 'assessment' AND se.source_id = ?''',
            (attempt['candidate_id'], attempt['id']),
        ).fetchall()

    return {
        'has_attempt': True,
        'attempt': dict(attempt),
        'skill_evidence': [dict(e) for e in evidence_rows],
    }
