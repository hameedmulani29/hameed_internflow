import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'shortlist_communication_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in [
    'app.db',
    'app.core.security',
    'app.applications.router',
    'app.notifications.router',
    'app.notifications.shortlist_service',
]:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.applications.router import router as applications_router
from app.core.security import create_token
from app.db import get_db, init_db
from app.notifications.router import router as notifications_router

app = FastAPI()
app.include_router(applications_router)
app.include_router(notifications_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM application_communications')
        db.execute('DELETE FROM application_screening_results')
        db.execute('DELETE FROM applications')
        db.execute('DELETE FROM internships')
        db.execute('DELETE FROM users')

        provider_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Provider One', 'provider1@company.dev', 'x', 'provider', 'Acme Labs'),
        ).lastrowid
        candidate_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Candidate One', 'candidate@example.com', 'x', 'intern', 'InternFlow'),
        ).lastrowid
        other_candidate_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Other Candidate', 'other@example.com', 'x', 'intern', 'InternFlow'),
        ).lastrowid
        internship_id = db.execute(
            'INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (provider_id, 'AI Engineering Intern', 'AI / ML', 'Build retrieval pipelines and LLM-powered products.', 'Remote', 'Remote', '3 months', '$600', 'published', 2, '2026-10-15'),
        ).lastrowid
        app_id = db.execute(
            'INSERT INTO applications (internship_id, applicant_id, resume_text, resume_file_name) VALUES (?, ?, ?, ?)',
            (internship_id, candidate_id, 'Python backend engineer with FastAPI and SQL experience.', 'resume.pdf'),
        ).lastrowid
        no_email_id = db.execute(
            'INSERT INTO applications (internship_id, applicant_id, resume_text, resume_file_name) VALUES (?, ?, ?, ?)',
            (internship_id, other_candidate_id, 'Candidate without email for failure case.', 'resume.pdf'),
        ).lastrowid
        db.execute(
            'UPDATE users SET email = ? WHERE id = ?',
            ('', other_candidate_id),
        )
        mailer_failure_candidate_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Mailer Failure Candidate', 'mailer@example.com', 'x', 'intern', 'InternFlow'),
        ).lastrowid
        mailer_failure_application_id = db.execute(
            'INSERT INTO applications (internship_id, applicant_id, resume_text, resume_file_name) VALUES (?, ?, ?, ?)',
            (internship_id, mailer_failure_candidate_id, 'Candidate for mailer failure.', 'resume.pdf'),
        ).lastrowid
        db.commit()
    yield {
        'provider': provider_id,
        'candidate': candidate_id,
        'no_email_candidate': other_candidate_id,
        'mailer_failure_candidate': mailer_failure_candidate_id,
        'internship': internship_id,
        'application': app_id,
        'no_email_application': no_email_id,
        'mailer_failure_application': mailer_failure_application_id,
    }


def auth(user_id, role):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_shortlist_status_sends_notification_and_records_result(seeded_database):
    response = client.patch(
        f"/api/applications/{seeded_database['application']}/status",
        headers=auth(seeded_database['provider'], 'provider'),
        json={'status': 'shortlisted'},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'shortlisted'
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' ORDER BY created_at DESC LIMIT 1",
            (seeded_database['application'],),
        ).fetchone()
    assert row is not None
    assert row['status'] == 'sent'
    assert row['recipient_email'] == 'candidate@example.com'
    assert 'AI Engineering Intern' in row['subject']


def test_shortlist_communication_requires_provider_authorization(seeded_database):
    response = client.post(
        f"/api/applications/{seeded_database['application']}/shortlist-notify",
        headers=auth(seeded_database['provider'] + 999, 'provider'),
    )
    assert response.status_code == 404


def test_shortlist_communication_requires_authentication(seeded_database):
    response = client.post(f"/api/applications/{seeded_database['application']}/shortlist-notify")
    assert response.status_code == 401


def test_missing_candidate_email_records_failed_communication(seeded_database):
    response = client.patch(
        f"/api/applications/{seeded_database['no_email_application']}/status",
        headers=auth(seeded_database['provider'], 'provider'),
        json={'status': 'shortlisted'},
    )
    assert response.status_code == 200
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' ORDER BY created_at DESC LIMIT 1",
            (seeded_database['no_email_application'],),
        ).fetchone()
    assert row is not None
    assert row['status'] == 'failed'
    assert 'email' in (row['error_message'] or '').lower()


def test_idempotent_shortlist_notification_only_sends_once(seeded_database):
    with get_db() as db:
        before_count = db.execute(
            "SELECT COUNT(*) FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' AND status = 'sent'",
            (seeded_database['application'],),
        ).fetchone()[0]
    response = client.post(
        f"/api/applications/{seeded_database['application']}/shortlist-notify",
        headers=auth(seeded_database['provider'], 'provider'),
    )
    assert response.status_code == 200
    with get_db() as db:
        total_sent = db.execute(
            "SELECT COUNT(*) FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' AND status = 'sent'",
            (seeded_database['application'],),
        ).fetchone()[0]
    assert total_sent == before_count


def test_mailer_failure_records_error_without_removing_shortlist_status(seeded_database, monkeypatch):
    def raise_error(*args, **kwargs):
        raise RuntimeError('SMTP unavailable')

    monkeypatch.setattr('app.notifications.shortlist_service.send_shortlist_email', raise_error)
    response = client.patch(
        f"/api/applications/{seeded_database['mailer_failure_application']}/status",
        headers=auth(seeded_database['provider'], 'provider'),
        json={'status': 'shortlisted'},
    )
    assert response.status_code == 200
    with get_db() as db:
        application = db.execute('SELECT status FROM applications WHERE id = ?', (seeded_database['mailer_failure_application'],)).fetchone()
        row = db.execute(
            "SELECT * FROM application_communications WHERE application_id = ? AND communication_type = 'shortlist' ORDER BY created_at DESC LIMIT 1",
            (seeded_database['mailer_failure_application'],),
        ).fetchone()
    assert application['status'] == 'shortlisted'
    assert row is not None
    assert row['status'] == 'failed'
    assert 'SMTP unavailable' in (row['error_message'] or '')
