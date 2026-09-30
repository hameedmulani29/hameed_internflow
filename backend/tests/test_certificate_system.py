import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db
from app.services.webhook_service import emit_certificate_issued_event

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def test_certificate_full_lifecycle():
    # 1. Setup seed database entities
    with get_db() as db:
        db.execute(
            "INSERT OR IGNORE INTO users (full_name, email, password_hash, role, organization) VALUES ('Tech Innovations Provider', 'provider-cert@test.com', 'hash', 'provider', 'Tech Innovations')"
        )
        provider_id = db.execute("SELECT id FROM users WHERE email='provider-cert@test.com'").fetchone()[0]

        db.execute(
            "INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Mentor Robert', 'mentor-cert@test.com', 'hash', 'mentor')"
        )
        mentor_id = db.execute("SELECT id FROM users WHERE email='mentor-cert@test.com'").fetchone()[0]

        db.execute(
            "INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Intern Alex', 'alex-cert@test.com', 'hash', 'intern')"
        )
        intern_a_id = db.execute("SELECT id FROM users WHERE email='alex-cert@test.com'").fetchone()[0]

        db.execute(
            "INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Intern Unauthorized', 'other-cert@test.com', 'hash', 'intern')"
        )
        intern_b_id = db.execute("SELECT id FROM users WHERE email='other-cert@test.com'").fetchone()[0]

        cursor = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'AI & Machine Learning Intern', 'AI', 'Desc', 'Remote', 'Remote', '3m', '20k', 'published')",
            (provider_id,),
        )
        internship_id = cursor.lastrowid

        db.execute(
            "INSERT OR IGNORE INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')",
            (mentor_id, intern_a_id, internship_id),
        )
        assignment_id = db.execute(
            "SELECT id FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ?",
            (mentor_id, intern_a_id),
        ).fetchone()[0]

        # Clean up any leftover evaluation/outcome records for this assignment to ensure clean test state
        db.execute("DELETE FROM certificates WHERE outcome_id IN (SELECT id FROM internship_outcomes WHERE assignment_id = ?)", (assignment_id,))
        db.execute("DELETE FROM internship_outcomes WHERE assignment_id = ?", (assignment_id,))
        db.execute("DELETE FROM final_evaluations WHERE assignment_id = ?", (assignment_id,))
        db.commit()

    provider_token = create_token(provider_id, 'provider')
    p_headers = {'Authorization': f'Bearer {provider_token}'}

    # 2. Test Ineligibility Check (No final evaluation -> should fail 400)
    ineligible_resp = client.post(f'/api/outcomes/complete/{assignment_id}', headers=p_headers)
    assert ineligible_resp.status_code == 400
    assert 'Final evaluation must be submitted' in ineligible_resp.json()['detail']

    # 3. Submit final evaluation to make intern eligible
    with get_db() as db:
        db.execute(
            '''INSERT INTO final_evaluations (assignment_id, intern_id, mentor_id, technical_skills, communication, problem_solving, reliability, task_execution, learning_adaptability, professionalism, strengths, areas_for_improvement, overall_evaluation, status)
               VALUES (?, ?, ?, 5, 5, 5, 5, 5, 5, 5, 'Outstanding work', 'None', 'exceeds_expectations', 'submitted')''',
            (assignment_id, intern_a_id, mentor_id),
        )
        db.commit()

    # 4. Trigger Certificate Generation
    complete_resp = client.post(f'/api/outcomes/complete/{assignment_id}', headers=p_headers)
    assert complete_resp.status_code == 200
    data = complete_resp.json()

    assert data['outcome']['status'] == 'completed'
    cert = data['certificate']
    cert_id = cert['certificate_id']
    assert cert_id.startswith('IF-2026-')
    assert cert['candidate_name'] == 'Intern Alex'
    assert cert['provider_name'] == 'Tech Innovations'
    assert cert['internship_title'] == 'AI & Machine Learning Intern'
    assert cert['file_path'] is not None

    # Check physical PDF file on disk
    pdf_path = Path(cert['file_path'])
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 0

    # 5. Test Idempotency: Triggering complete again returns identical certificate record
    complete_resp_again = client.post(f'/api/outcomes/complete/{assignment_id}', headers=p_headers)
    assert complete_resp_again.status_code == 200
    assert complete_resp_again.json()['certificate']['certificate_id'] == cert_id

    # 6. Test Intern Access & Authorization
    intern_a_token = create_token(intern_a_id, 'intern')
    a_headers = {'Authorization': f'Bearer {intern_a_token}'}

    intern_b_token = create_token(intern_b_id, 'intern')
    b_headers = {'Authorization': f'Bearer {intern_b_token}'}

    # Intern A lists certificates
    my_certs = client.get('/api/certificates/me', headers=a_headers).json()
    assert len(my_certs['items']) >= 1
    assert my_certs['items'][0]['certificate_id'] == cert_id

    # Intern A accesses own certificate details
    detail_resp = client.get(f'/api/certificates/{cert_id}', headers=a_headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()['certificate_id'] == cert_id

    # Intern B attempts to access Intern A's certificate details -> 403 Forbidden (IDOR Protection)
    forbidden_resp = client.get(f'/api/certificates/{cert_id}', headers=b_headers)
    assert forbidden_resp.status_code == 403

    # 7. Test View & Download Endpoints
    view_resp = client.get(f'/api/certificates/{cert_id}/view', headers=a_headers)
    assert view_resp.status_code == 200
    assert view_resp.headers['content-type'] == 'application/pdf'

    download_resp = client.get(f'/api/certificates/{cert_id}/download', headers=a_headers)
    assert download_resp.status_code == 200
    assert download_resp.headers['content-type'] == 'application/pdf'
    assert 'attachment' in download_resp.headers['content-disposition']

    # 8. Test Public Verification
    verify_resp = client.get(f'/api/verify/{cert_id}')
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data['valid'] is True
    assert v_data['candidate_name'] == 'Intern Alex'
    assert v_data['provider_name'] == 'Tech Innovations'

    # Nonexistent cert verify -> 404
    bad_verify = client.get('/api/verify/INVALID-ID-999')
    assert bad_verify.status_code == 404

    # 9. Test Make #25 Event Payload Generation
    event_payload = emit_certificate_issued_event(
        certificate_id=cert_id,
        intern_id=intern_a_id,
        intern_name='Intern Alex',
        intern_email='alex-cert@test.com',
        internship_id=internship_id,
        internship_title='AI & Machine Learning Intern',
        provider_id=provider_id,
        provider_name='Tech Innovations',
        issue_date=cert['issue_date'],
        verification_url=cert['verification_url'],
        download_url=cert['download_url'],
    )
    assert event_payload['event'] == 'certificate.issued'
    assert event_payload['data']['certificate_id'] == cert_id
    assert event_payload['data']['intern']['email'] == 'alex-cert@test.com'
    assert event_payload['data']['certificate']['download_url'] == f"/api/certificates/{cert_id}/download"
