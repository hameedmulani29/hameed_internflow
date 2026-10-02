import os
import smtplib
from email.message import EmailMessage

from fastapi import HTTPException

from app.db import get_db


def build_shortlist_email(application, candidate, internship, provider):
    provider_name = (provider.get('organization') or provider.get('full_name') or 'the organization').strip()
    internship_title = internship.get('title') or 'this opportunity'
    candidate_name = candidate.get('full_name') or 'Candidate'

    subject = f"Shortlist Update: {internship_title}"
    body = (
        f"Dear {candidate_name},\n\n"
        f"Congratulations! Your application for the {internship_title} internship with {provider_name} has been shortlisted.\n\n"
        "This means the hiring team is moving your application forward. We will be in touch with the next step in the process.\n\n"
        f"Role: {internship_title}\n"
        f"Organization: {provider_name}\n"
        "Status: Shortlisted\n\n"
        "Thank you for your interest in this opportunity.\n\n"
        "Kind regards,\n"
        f"{provider_name} Hiring Team"
    )
    return subject, body


def send_shortlist_email(recipient_email: str, subject: str, body: str) -> str:
    smtp_host = os.getenv('INTERNFLOW_SMTP_HOST')
    if not smtp_host:
        return 'simulated-email-delivery'

    smtp_port = int(os.getenv('INTERNFLOW_SMTP_PORT', '587'))
    username = os.getenv('INTERNFLOW_SMTP_USERNAME')
    password = os.getenv('INTERNFLOW_SMTP_PASSWORD')
    from_address = os.getenv('INTERNFLOW_EMAIL_FROM', username or 'noreply@internflow.local')
    use_tls = os.getenv('INTERNFLOW_SMTP_USE_TLS', 'true').lower() not in {'0', 'false', 'no'}

    if not recipient_email or '@' not in recipient_email:
        raise ValueError('Candidate email is missing or invalid.')

    message = EmailMessage()
    message['To'] = recipient_email
    message['From'] = from_address
    message['Subject'] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if use_tls:
                server.starttls()
            if username and password:
                server.login(username, password)
            server.send_message(message)
    except Exception as exc:
        raise RuntimeError(f'Email delivery failed: {exc}') from exc

    return 'smtp-delivery-confirmed'


def _record_communication(application_id: int, applicant_id: int, internship_id: int, *, recipient_email: str, subject: str, body: str, status: str, error_message: str | None = None):
    with get_db() as db:
        cursor = db.execute(
            '''
            INSERT INTO application_communications (
                application_id, applicant_id, internship_id, communication_type,
                recipient_email, subject, body, status, error_message, created_at, updated_at
            ) VALUES (%s, %s, %s, 'shortlist', %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
            ''',
            (
                application_id,
                applicant_id,
                internship_id,
                recipient_email,
                subject,
                body,
                status,
                error_message,
            ),
        )
        comm_id = cursor.fetchone()['id']
        db.commit()
        return db.execute('SELECT * FROM application_communications WHERE id = %s', (comm_id,)).fetchone()


def trigger_shortlist_communication(application_id: int, provider_id: int | None = None, *, force_retry: bool = False):
    with get_db() as db:
        application = db.execute(
            '''
            SELECT a.*, u.full_name AS applicant_name, u.email AS applicant_email,
                   i.provider_id, i.title AS internship_title,
                   p.full_name AS provider_name, p.organization AS provider_organization
            FROM applications a
            JOIN users u ON u.id = a.applicant_id
            JOIN internships i ON i.id = a.internship_id
            JOIN users p ON p.id = i.provider_id
            WHERE a.id = ?
            ''',
            (application_id,),
        ).fetchone()

        if not application:
            raise LookupError('Application not found.')
        if provider_id is not None and application['provider_id'] != provider_id:
            raise PermissionError('Application not found.')

        existing_sent = db.execute(
            "SELECT * FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' AND status = 'sent' ORDER BY created_at DESC LIMIT 1",
            (application_id,),
        ).fetchone()
        if existing_sent and not force_retry:
            return {
                'application_id': application_id,
                'communication_status': 'sent',
                'recipient_email': existing_sent['recipient_email'],
                'subject': existing_sent['subject'],
                'status': application['status'],
            }

    if not application['applicant_email'] or '@' not in str(application['applicant_email']).strip():
        record = _record_communication(
            application_id,
            application['applicant_id'],
            application['internship_id'],
            recipient_email=str(application['applicant_email'] or '').strip(),
            subject=f"Shortlist Update: {application['internship_title']}",
            body='Candidate email is missing or invalid.',
            status='failed',
            error_message='Candidate email is missing or invalid.',
        )
        return {
            'application_id': application_id,
            'communication_status': 'failed',
            'recipient_email': str(application['applicant_email'] or '').strip(),
            'subject': record['subject'],
            'status': application['status'],
            'error_message': 'Candidate email is missing or invalid.',
        }

    subject, body = build_shortlist_email(
        application=application,
        candidate={'full_name': application['applicant_name']},
        internship={'title': application['internship_title']},
        provider={'organization': application['provider_organization'], 'full_name': application['provider_name']},
    )
    record = _record_communication(
        application_id,
        application['applicant_id'],
        application['internship_id'],
        recipient_email=application['applicant_email'],
        subject=subject,
        body=body,
        status='pending',
    )

    try:
        send_shortlist_email(application['applicant_email'], subject, body)
    except Exception as exc:
        with get_db() as db:
            db.execute(
                "UPDATE application_communications SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (str(exc), record['id']),
            )
            db.commit()
        return {
            'application_id': application_id,
            'communication_status': 'failed',
            'recipient_email': application['applicant_email'],
            'subject': subject,
            'status': application['status'],
            'error_message': str(exc),
        }

    with get_db() as db:
        db.execute(
            "UPDATE application_communications SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, error_message = NULL WHERE id = ?",
            (record['id'],),
        )
        db.commit()

    return {
        'application_id': application_id,
        'communication_status': 'sent',
        'recipient_email': application['applicant_email'],
        'subject': subject,
        'status': application['status'],
    }


def get_shortlist_communication(application_id: int):
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' ORDER BY created_at DESC LIMIT 1",
            (application_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Shortlist communication not found.')
    return dict(row)
