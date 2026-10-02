import json
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.applications.screening_service import run_resume_screening
from app.applications.status_service import send_interview_required_webhook, transition_application_status
from app.applications.worker import process_screening_job, process_screening_job_sync
from app.core.permissions import require_roles
from app.db import get_db, is_unique_violation
from app.notifications.shortlist_service import trigger_shortlist_communication
from app.resumes.parser import extract_text_from_pdf_bytes, validate_pdf_file


def _resolve_skill_match(db, application_row):
    """Match internship required skills vs the applicant's declared skills.

    Evidence-based language: a matched skill means the candidate declared it;
    a gap only means 'no declaration on file', never 'cannot do it'.
    """
    internship_id = application_row['internship_id']
    applicant_id = application_row['applicant_id']
    required = db.execute(
        '''SELECT s.id, s.name FROM internship_skills isx
           JOIN skills s ON s.id = isx.skill_id
           WHERE isx.internship_id = ? ORDER BY s.name''',
        (internship_id,),
    ).fetchall()
    declared = db.execute(
        '''SELECT DISTINCT s.id, s.name, cs.source FROM candidate_skills cs
           JOIN skills s ON s.id = cs.skill_id
           WHERE cs.intern_id = ? ORDER BY s.name''',
        (applicant_id,),
    ).fetchall()
    declared_by_id = {row['id']: row for row in declared}
    matched = [
        {'name': row['name'], 'source': declared_by_id[row['id']]['source']}
        for row in required if row['id'] in declared_by_id
    ]
    gaps = [{'name': row['name']} for row in required if row['id'] not in declared_by_id]
    return {
        'required_skills': [{'id': row['id'], 'name': row['name']} for row in required],
        'candidate_skills': [{'id': row['id'], 'name': row['name'], 'source': row['source']} for row in declared],
        'matched_skills': matched,
        'potential_gaps': gaps,
    }

router = APIRouter(prefix='/api/applications', tags=['applications'])


class ApplicationInput(BaseModel):
    internship_id: int
    resume_text: str | None = None
    resume_file_name: str | None = None
    resume_mime_type: str | None = None


class ApplicationStatusInput(BaseModel):
    status: str = Field(pattern='^(applied|screening|shortlisted|assessment|interview|selected|rejected)$')


def _serialize_screening_result(row):
    return {
        'id': row['id'],
        'application_id': row['application_id'],
        'internship_id': row['internship_id'],
        'applicant_id': row['applicant_id'],
        'status': row['status'],
        'overall_score': row['overall_score'],
        'skills_match': row['skills_match'],
        'experience_match': row['experience_match'],
        'education_match': row['education_match'],
        'matched_skills': json.loads(row['matched_skills']) if row['matched_skills'] else [],
        'missing_skills': json.loads(row['missing_skills']) if row['missing_skills'] else [],
        'strengths': json.loads(row['strengths']) if row['strengths'] else [],
        'gaps': json.loads(row['gaps']) if row['gaps'] else [],
        'summary': row['summary'],
        'recommendation': row['recommendation'],
        'model_used': row['model_used'],
        'screened_at': row['screened_at'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
    }


def _serialize_my_application(row):
    """Intern-facing projection of an application + live lifecycle/screening state."""
    matched = json.loads(row['matched_skills']) if row['matched_skills'] else []
    missing = json.loads(row['missing_skills']) if row['missing_skills'] else []
    strengths = json.loads(row['strengths']) if row['strengths'] else []
    gaps = json.loads(row['gaps']) if row['gaps'] else []
    has_screening = row['screening_id'] is not None
    # overall_score is NOT NULL DEFAULT 0 in the schema; it only carries meaning once completed.
    score_available = has_screening and row['screening_status'] == 'completed'
    return {
        'id': row['id'],
        'internship_id': row['internship_id'],
        'status': row['status'],
        'resume_file_name': row['resume_file_name'],
        'created_at': row['created_at'],
        'internship': {
            'id': row['internship_id'],
            'title': row['internship_title'],
            'department': row['department'],
            'location': row['location'],
            'work_mode': row['work_mode'],
            'duration': row['duration'],
            'stipend': row['stipend'],
            'deadline': row['deadline'],
            'provider_name': row['provider_name'],
        },
        'screening': {
            'id': row['screening_id'],
            'status': row['screening_status'],
            'overall_score': row['screening_overall_score'] if score_available else None,
            'matched_skills': matched if score_available else [],
            'missing_skills': missing if score_available else [],
            'strengths': strengths if score_available else [],
            'gaps': gaps if score_available else [],
            'summary': row['summary'] if score_available else None,
            'recommendation': row['recommendation'],
            'screened_at': row['screened_at'],
        } if has_screening else None,
    }


@router.post('/upload-resume', status_code=status.HTTP_200_OK)
async def upload_resume_pdf(file: UploadFile = File(...), user=Depends(require_roles('intern'))):
    contents = await file.read()
    filename = file.filename or 'resume.pdf'

    valid, err_msg = validate_pdf_file(contents, filename)
    if not valid:
        raise HTTPException(status_code=400, detail=err_msg)

    try:
        text = extract_text_from_pdf_bytes(contents)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f'PDF text extraction failed: {str(exc)}') from exc

    return {
        'filename': filename,
        'mime_type': file.content_type or 'application/pdf',
        'extracted_text': text,
    }


@router.post('', status_code=status.HTTP_201_CREATED)
async def apply(payload: ApplicationInput, background_tasks: BackgroundTasks, user=Depends(require_roles('intern'))):
    with get_db() as db:
        internship = db.execute("SELECT id FROM internships WHERE id = %s AND status = 'published'", (payload.internship_id,)).fetchone()
        if not internship:
            raise HTTPException(status_code=404, detail='Published internship not found.')
        try:
            cursor = db.execute(
                'INSERT INTO applications (internship_id, applicant_id, resume_text, resume_file_name, resume_mime_type) VALUES (%s, %s, %s, %s, %s) RETURNING id',
                (payload.internship_id, int(user['sub']), payload.resume_text.strip() if payload.resume_text else None, payload.resume_file_name, payload.resume_mime_type),
            )
            app_id = cursor.fetchone()['id']
            db.execute(
                "INSERT INTO application_screening_results (application_id, internship_id, applicant_id, status, model_used, created_at, updated_at) VALUES (%s, %s, %s, 'pending', 'gemini-2.0-flash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                (app_id, payload.internship_id, int(user['sub'])),
            )
            db.commit()
        except Exception as error:
            if is_unique_violation(error) or 'UNIQUE constraint' in str(error):
                raise HTTPException(status_code=409, detail='You have already applied to this internship.') from error
            raise

    # Trigger automatic Python screening worker after DB commit
    background_tasks.add_task(process_screening_job, app_id)

    return {'id': app_id, 'internship_id': payload.internship_id, 'status': 'applied'}


@router.get('')
def list_applications(user=Depends(require_roles('provider'))):
    with get_db() as db:
        rows = db.execute(
            '''SELECT applications.*,
                      users.full_name AS applicant_name,
                      users.email AS applicant_email,
                      internships.title AS internship_title,
                      sr.status AS screening_status,
                      sr.overall_score AS screening_overall_score,
                      sr.summary AS screening_summary,
                      sr.recommendation AS screening_recommendation
               FROM applications
               JOIN users ON users.id = applications.applicant_id
               JOIN internships ON internships.id = applications.internship_id
               LEFT JOIN application_screening_results sr ON sr.application_id = applications.id
               WHERE internships.provider_id = ?
               ORDER BY applications.created_at DESC''',
            (int(user['sub']),),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}


@router.get('/screening-queue')
@router.get('/screening-queue/')
def get_screening_queue(user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT sr.*,
                      a.created_at AS application_created_at,
                      a.status AS application_status,
                      a.resume_file_name,
                      u.full_name AS applicant_name,
                      u.email AS applicant_email,
                      i.title AS internship_title,
                      i.department AS internship_department
               FROM application_screening_results sr
               JOIN applications a ON a.id = sr.application_id
               JOIN users u ON u.id = a.applicant_id
               JOIN internships i ON i.id = sr.internship_id
               WHERE i.provider_id = ?
               ORDER BY sr.created_at DESC''',
            (provider_id,),
        ).fetchall()
    return {'items': [dict(row) for row in rows]}


@router.get('/{application_id}/detail')
def get_application_detail(application_id: int, user=Depends(require_roles('provider'))):
    """Unified provider view of one application: candidate, internship, skills
    match, screening evidence, and lifecycle state."""
    provider_id = int(user['sub'])
    with get_db() as db:
        row = db.execute(
            '''SELECT a.*, u.full_name AS applicant_name, u.email AS applicant_email,
                      i.title AS internship_title, i.department, i.location, i.work_mode,
                      i.duration, i.stipend, i.deadline, i.description AS internship_description,
                      sr.status AS screening_status, sr.overall_score AS screening_overall_score,
                      sr.matched_skills AS screening_matched, sr.missing_skills AS screening_missing,
                      sr.strengths AS screening_strengths, sr.gaps AS screening_gaps,
                      sr.summary AS screening_summary, sr.recommendation AS screening_recommendation,
                      sr.screened_at AS screening_screened_at, sr.model_used AS screening_model
               FROM applications a
               JOIN users u ON u.id = a.applicant_id
               JOIN internships i ON i.id = a.internship_id
               LEFT JOIN application_screening_results sr ON sr.application_id = a.id
               WHERE a.id = ? AND i.provider_id = ?''',
            (application_id, provider_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Application not found.')

        skill_match = _resolve_skill_match(db, row)

    screening = None
    if row['screening_status'] is not None:
        completed = row['screening_status'] == 'completed'
        screening = {
            'status': row['screening_status'],
            'overall_score': row['screening_overall_score'] if completed else None,
            'matched_skills': json.loads(row['screening_matched']) if completed and row['screening_matched'] else [],
            'missing_skills': json.loads(row['screening_missing']) if completed and row['screening_missing'] else [],
            'strengths': json.loads(row['screening_strengths']) if completed and row['screening_strengths'] else [],
            'gaps': json.loads(row['screening_gaps']) if completed and row['screening_gaps'] else [],
            'summary': row['screening_summary'] if completed else None,
            'recommendation': row['screening_recommendation'] if completed else None,
            'screened_at': row['screening_screened_at'],
            'model_used': row['screening_model'],
        }

    return {
        'id': row['id'],
        'status': row['status'],
        'created_at': row['created_at'],
        'resume_file_name': row['resume_file_name'],
        'resume_text': row['resume_text'],
        'candidate': {
            'id': row['applicant_id'],
            'name': row['applicant_name'],
            'email': row['applicant_email'],
        },
        'internship': {
            'id': row['internship_id'],
            'title': row['internship_title'],
            'department': row['department'],
            'location': row['location'],
            'work_mode': row['work_mode'],
            'duration': row['duration'],
            'stipend': row['stipend'],
            'deadline': row['deadline'],
            'description': row['internship_description'],
        },
        'skills': skill_match,
        'screening': screening,
    }


@router.get('/mine')
@router.get('/mine/')
def list_my_applications(user=Depends(require_roles('intern'))):
    with get_db() as db:
        rows = db.execute(
            '''SELECT a.id, a.internship_id, a.status, a.resume_file_name, a.created_at,
                      i.title AS internship_title, i.department, i.location, i.work_mode,
                      i.duration, i.stipend, i.deadline,
                      u.full_name AS provider_name,
                      sr.id AS screening_id, sr.status AS screening_status,
                      sr.overall_score AS screening_overall_score,
                      sr.matched_skills, sr.missing_skills, sr.strengths, sr.gaps,
                      sr.summary, sr.recommendation, sr.screened_at
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               LEFT JOIN users u ON u.id = i.provider_id
               LEFT JOIN application_screening_results sr ON sr.application_id = a.id
               WHERE a.applicant_id = ?
               ORDER BY a.created_at DESC''',
            (int(user['sub']),),
        ).fetchall()
    return {'items': [_serialize_my_application(row) for row in rows]}


@router.get('/mine/{application_id}')
@router.get('/mine/{application_id}/')
def get_my_application(application_id: int, user=Depends(require_roles('intern'))):
    with get_db() as db:
        row = db.execute(
            '''SELECT a.id, a.internship_id, a.status, a.resume_file_name, a.created_at,
                      i.title AS internship_title, i.department, i.location, i.work_mode,
                      i.duration, i.stipend, i.deadline,
                      u.full_name AS provider_name,
                      sr.id AS screening_id, sr.status AS screening_status,
                      sr.overall_score AS screening_overall_score,
                      sr.matched_skills, sr.missing_skills, sr.strengths, sr.gaps,
                      sr.summary, sr.recommendation, sr.screened_at
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               LEFT JOIN users u ON u.id = i.provider_id
               LEFT JOIN application_screening_results sr ON sr.application_id = a.id
               WHERE a.applicant_id = ? AND a.id = ?''',
            (int(user['sub']), application_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Application not found.')
    return _serialize_my_application(row)


@router.patch('/{application_id}/status')
def update_application(application_id: int, payload: ApplicationStatusInput, background_tasks: BackgroundTasks, user=Depends(require_roles('provider'))):
    with get_db() as db:
        row, webhook_payload = transition_application_status(
            db,
            application_id,
            int(user['sub']),
            payload.status,
        )
        db.commit()

    if payload.status == 'shortlisted':
        try:
            trigger_shortlist_communication(application_id, provider_id=int(user['sub']))
        except Exception:
            pass

    if webhook_payload:
        background_tasks.add_task(send_interview_required_webhook, webhook_payload)

    return row


@router.post('/{application_id}/screen', status_code=status.HTTP_200_OK)
@router.post('/{application_id}/screen/', status_code=status.HTTP_200_OK)
@router.post('/{application_id}/ai-screening', status_code=status.HTTP_200_OK)
@router.post('/{application_id}/ai-screening/', status_code=status.HTTP_200_OK)
def screen_application(application_id: int, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        application = db.execute(
            '''SELECT a.*, i.provider_id
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ?''',
            (application_id,),
        ).fetchone()
        if not application:
            raise HTTPException(status_code=404, detail='Application not found.')
        if application['provider_id'] != provider_id:
            raise HTTPException(status_code=404, detail='Application not found.')

    res = process_screening_job_sync(application_id)
    if res.get('status') == 'failed':
        summary = res.get('summary', 'Screening failed.')
        raise HTTPException(status_code=422, detail=summary)

    with get_db() as db:
        record = db.execute('SELECT * FROM application_screening_results WHERE application_id = ?', (application_id,)).fetchone()
    if not record:
        raise HTTPException(status_code=404, detail='Screening result not found.')
    return _serialize_screening_result(record)


@router.get('/{application_id}/screening')
@router.get('/{application_id}/screening/')
def get_screening(application_id: int, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        row = db.execute(
            '''SELECT sr.*, i.provider_id
               FROM application_screening_results sr
               JOIN internships i ON i.id = sr.internship_id
               WHERE sr.application_id = ?''',
            (application_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Screening result not found.')
        if row['provider_id'] != provider_id:
            raise HTTPException(status_code=404, detail='Screening result not found.')
    return _serialize_screening_result(row)


class ProviderDecisionInput(BaseModel):
    decision: str = Field(pattern='^(advance|reject|keep_in_review|move_to_assessment|invite_to_interview)$')
    notes: str | None = None


@router.post('/{application_id}/decision')
@router.post('/{application_id}/decision/')
def record_provider_decision(application_id: int, payload: ProviderDecisionInput, background_tasks: BackgroundTasks, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    # Map decision to corresponding application lifecycle status
    status_map = {
        'advance': 'shortlisted',
        'reject': 'rejected',
        'keep_in_review': 'screening',
        'move_to_assessment': 'assessment',
        'invite_to_interview': 'interview',
    }
    new_status = status_map.get(payload.decision)
    webhook_payload = None
    with get_db() as db:
        if new_status:
            _, webhook_payload = transition_application_status(
                db,
                application_id,
                provider_id,
                new_status,
            )

        db.execute(
            '''INSERT INTO application_provider_decisions (application_id, provider_id, decision, notes, updated_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(application_id) DO UPDATE SET
               decision=excluded.decision, notes=excluded.notes, updated_at=CURRENT_TIMESTAMP''',
            (application_id, provider_id, payload.decision, payload.notes),
        )
        db.commit()

        decision_row = db.execute('SELECT * FROM application_provider_decisions WHERE application_id = ?', (application_id,)).fetchone()

    if webhook_payload:
        background_tasks.add_task(send_interview_required_webhook, webhook_payload)

    return dict(decision_row)


@router.get('/{application_id}/decision')
def get_provider_decision(application_id: int, user=Depends(require_roles('provider'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        row = db.execute('SELECT * FROM application_provider_decisions WHERE application_id = ? AND provider_id = ?', (application_id, provider_id)).fetchone()
        if not row:
            return {'application_id': application_id, 'decision': None, 'notes': None}
    return dict(row)


