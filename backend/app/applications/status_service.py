import logging
import os

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def transition_application_status(db, application_id: int, provider_id: int, new_status: str):
    application = db.execute(
        '''SELECT a.*, candidate.id AS candidate_id,
                  candidate.full_name AS candidate_name,
                  candidate.email AS candidate_email,
                  i.provider_id, i.title AS internship_title,
                  provider.email AS provider_email
           FROM applications a
           JOIN users candidate ON candidate.id = a.applicant_id
           JOIN internships i ON i.id = a.internship_id
           JOIN users provider ON provider.id = i.provider_id
           WHERE a.id = ? AND i.provider_id = ?''',
        (application_id, provider_id),
    ).fetchone()
    if not application:
        raise HTTPException(status_code=404, detail='Application not found.')

    result = db.execute(
        'UPDATE applications SET status = ? WHERE id = ? AND internship_id IN (SELECT id FROM internships WHERE provider_id = ?)',
        (new_status, application_id, provider_id),
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail='Application not found.')

    updated_application = db.execute(
        'SELECT * FROM applications WHERE id = ?',
        (application_id,),
    ).fetchone()

    webhook_payload = None
    if application['status'] != 'shortlisted' and new_status == 'shortlisted':
        webhook_payload = {
            'event': 'INTERVIEW_REQUIRED',
            'applicationId': application['id'],
            'candidateId': application['candidate_id'],
            'candidateName': application['candidate_name'],
            'candidateEmail': application['candidate_email'],
            'internshipId': application['internship_id'],
            'internshipTitle': application['internship_title'],
            'providerId': application['provider_id'],
            'providerEmail': application['provider_email'],
        }

    return dict(updated_application), webhook_payload


def send_interview_required_webhook(payload: dict):
    webhook_url = os.getenv('INTERNFLOW_MAKE_INTERVIEW_WEBHOOK_URL') or os.getenv('INTFLOW_MAKE_INTERVIEW_WEBHOOK_URL')
    if not webhook_url:
        logger.warning(
            'Make INTERVIEW_REQUIRED webhook URL is not configured for application_id=%s',
            payload['applicationId'],
        )
        return

    try:
        response = httpx.post(webhook_url, json=payload, timeout=10.0)
        response.raise_for_status()
    except Exception as error:
        logger.warning(
            'Make INTERVIEW_REQUIRED webhook failed for application_id=%s error_type=%s',
            payload['applicationId'],
            type(error).__name__,
        )
        return

    logger.info(
        'Make INTERVIEW_REQUIRED webhook succeeded for application_id=%s status_code=%s',
        payload['applicationId'],
        response.status_code,
    )