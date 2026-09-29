import asyncio
import json
import logging

import app.db as db_mod
from app.applications.screening_service import run_resume_screening

logger = logging.getLogger(__name__)


def process_screening_job_sync(application_id: int) -> dict:
    """Synchronous worker function to process a queued resume screening job."""
    with db_mod.get_db() as db:
        app_row = db.execute(
            '''SELECT a.*, i.title AS internship_title, i.description AS internship_description, i.department
               FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.id = ?''',
            (application_id,),
        ).fetchone()

        if not app_row:
            return {'status': 'error', 'detail': 'Application not found.'}

        # Check existing screening state for idempotency (Phase 11)
        existing = db.execute(
            'SELECT * FROM application_screening_results WHERE application_id = ?',
            (application_id,),
        ).fetchone()

        if existing and existing['status'] == 'completed':
            return dict(existing)

        # Update or create screening job record with status 'processing'
        if existing:
            db.execute(
                "UPDATE application_screening_results SET status = 'processing', model_used = 'gemini-2.0-flash', updated_at = CURRENT_TIMESTAMP WHERE application_id = ?",
                (application_id,),
            )
        else:
            db.execute(
                "INSERT INTO application_screening_results (application_id, internship_id, applicant_id, status, model_used, created_at, updated_at) VALUES (?, ?, ?, 'processing', 'gemini-2.0-flash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                (application_id, app_row['internship_id'], app_row['applicant_id']),
            )
        db.commit()

    resume_text = (app_row['resume_text'] or '').strip()

    # Phase 7: Missing or invalid resume text
    if not resume_text:
        with db_mod.get_db() as db:
            db.execute(
                "UPDATE application_screening_results SET status = 'failed', summary = 'Resume text is missing or unreadable.', updated_at = CURRENT_TIMESTAMP WHERE application_id = ?",
                (application_id,),
            )
            db.commit()
            record = db.execute('SELECT * FROM application_screening_results WHERE application_id = ?', (application_id,)).fetchone()
        return dict(record)

    # Phase 6 & 8: Call existing P1.1 screening service with internship requirements
    try:
        result = run_resume_screening(
            resume_text=resume_text,
            internship_title=app_row['internship_title'],
            internship_description=app_row['internship_description'],
            department=app_row['department'],
        )
    except (ValueError, RuntimeError) as exc:
        # Phase 9: Gemini/AI failure handling -> Application remains intact, screening job marked failed
        with db_mod.get_db() as db:
            db.execute(
                "UPDATE application_screening_results SET status = 'failed', summary = ?, updated_at = CURRENT_TIMESTAMP WHERE application_id = ?",
                (str(exc), application_id),
            )
            db.commit()
            record = db.execute('SELECT * FROM application_screening_results WHERE application_id = ?', (application_id,)).fetchone()
        return dict(record) if record else {'status': 'failed', 'summary': str(exc)}

    # Phase 10: Save validated result
    with db_mod.get_db() as db:
        db.execute(
            '''UPDATE application_screening_results
               SET status = 'completed', overall_score = ?, skills_match = ?, experience_match = ?, education_match = ?,
                   matched_skills = ?, missing_skills = ?, strengths = ?, gaps = ?, summary = ?, recommendation = ?,
                   model_used = 'gemini-2.0-flash', updated_at = CURRENT_TIMESTAMP, screened_at = CURRENT_TIMESTAMP, raw_response = ?
               WHERE application_id = ?''',
            (
                int(result['overall_score']),
                int(result['skills_match']),
                int(result['experience_match']),
                int(result['education_match']),
                json.dumps(result['matched_skills'] or []),
                json.dumps(result['missing_skills'] or []),
                json.dumps(result['strengths'] or []),
                json.dumps(result['gaps'] or []),
                result['summary'],
                result['recommendation'],
                json.dumps(result),
                application_id,
            ),
        )
        db.commit()
        record = db.execute('SELECT * FROM application_screening_results WHERE application_id = ?', (application_id,)).fetchone()

    return dict(record)


async def process_screening_job(application_id: int):
    """Async wrapper to run screening job in background thread executor."""
    return await asyncio.to_thread(process_screening_job_sync, application_id)
