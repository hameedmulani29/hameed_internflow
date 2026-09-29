import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_full_internflow_end_to_end_lifecycle_and_failure_scenarios():
    # 1. Setup Provider & Candidate Accounts
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role, organization) VALUES ('Tech Corp Inc', 'e2e-prov@test.com', 'hash', 'provider', 'TechCorp')")
        p_id = db.execute("SELECT id FROM users WHERE email='e2e-prov@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Mentor Dave', 'e2e-mentor@test.com', 'hash', 'mentor')")
        m_id = db.execute("SELECT id FROM users WHERE email='e2e-mentor@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Candidate Alice', 'e2e-cand@test.com', 'hash', 'intern')")
        c_id = db.execute("SELECT id FROM users WHERE email='e2e-cand@test.com'").fetchone()[0]
        db.commit()

    prov_headers = {'Authorization': f'Bearer {create_token(p_id, "provider")}'}
    mentor_headers = {'Authorization': f'Bearer {create_token(m_id, "mentor")}'}
    cand_headers = {'Authorization': f'Bearer {create_token(c_id, "intern")}'}

    # 2. Provider creates published internship
    pub_resp = client.post(
        '/api/internships',
        json={
            'title': 'Senior Backend Intern',
            'department': 'Software Engineering',
            'description': 'Build scalable APIs in Python and SQL.',
            'location': 'Remote',
            'work_mode': 'Remote',
            'duration': '3 months',
            'stipend': '$1,500 / month',
            'openings': 2,
            'skills': ['python', 'fastapi', 'sql'],
        },
        headers=prov_headers,
    )
    assert pub_resp.status_code == 201
    internship_id = pub_resp.json()['id']

    # 3. Candidate PDF Resume Extraction (FAILURE & SUCCESS SCENARIOS)
    # 3a. Invalid File Format
    bad_pdf_resp = client.post(
        '/api/applications/upload-resume',
        files={'file': ('resume.txt', b'NOT A PDF FILE', 'text/plain')},
        headers=cand_headers,
    )
    assert bad_pdf_resp.status_code == 400
    assert 'pdf' in bad_pdf_resp.json()['detail'].lower()

    # 3b. Valid PDF File Extraction
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n(Alice Smith Senior Python Developer Resume) TJ\n"
    ok_pdf_resp = client.post(
        '/api/applications/upload-resume',
        files={'file': ('resume.pdf', pdf_bytes, 'application/pdf')},
        headers=cand_headers,
    )
    assert ok_pdf_resp.status_code == 200

    # 4. Candidate Applies
    app_resp = client.post(
        '/api/applications',
        json={
            'internship_id': internship_id,
            'resume_text': 'Experienced Python developer with FastAPI and SQL knowledge.',
            'resume_file_name': 'alice_resume.pdf',
        },
        headers=cand_headers,
    )
    assert app_resp.status_code == 201
    application_id = app_resp.json()['id']

    # 5. Provider explicit AI decision -> Advance
    dec_resp = client.post(
        f'/api/applications/{application_id}/decision',
        json={'decision': 'advance', 'notes': 'Strong technical foundation.'},
        headers=prov_headers,
    )
    assert dec_resp.status_code == 200
    assert dec_resp.json()['decision'] == 'advance'

    # 6. Assessment Stage (Server-side scoring & Evidence generation)
    avail_resp = client.get(f'/api/assessments/available/{application_id}', headers=cand_headers)
    assert avail_resp.status_code == 200
    ass_id = avail_resp.json()['assessment']['id']

    start_resp = client.post(f'/api/assessments/{ass_id}/start?application_id={application_id}', headers=cand_headers)
    assert start_resp.status_code == 200
    attempt_id = start_resp.json()['attempt_id']
    questions = start_resp.json()['questions']

    # Submit answers
    responses = [{'question_id': q['id'], 'response': '4' if 'Python' in q['question_text'] else '@app.get()'} for q in questions]
    sub_resp = client.post(f'/api/assessments/attempts/{attempt_id}/submit', json={'responses': responses}, headers=cand_headers)
    assert sub_resp.status_code == 200
    assert sub_resp.json()['passed'] is True

    # 7. Interview Stage (Schedule, Conflict Check & Scorecard)
    sch_resp = client.post(
        '/api/interviews/schedule',
        json={
            'application_id': application_id,
            'interviewer_id': p_id,
            'scheduled_at': '2026-10-10T10:00:00Z',
            'duration_minutes': 45,
            'notes': 'System Design & Python Deep Dive',
        },
        headers=prov_headers,
    )
    assert sch_resp.status_code == 201
    interview_id = sch_resp.json()['id']

    # Submit scorecard
    sc_resp = client.post(
        f'/api/interviews/{interview_id}/scorecard',
        json={
            'technical_skills': 5,
            'communication': 5,
            'problem_solving': 4,
            'role_understanding': 5,
            'relevant_skills': 5,
            'overall_recommendation': 'advance',
            'evidence_notes': 'Demonstrated strong API architecture skills.',
            'skill_evaluations': [{'skill_name': 'python', 'rating': 5, 'notes': 'Solid'}],
        },
        headers=prov_headers,
    )
    assert sc_resp.status_code == 201

    # 8. Active Mentorship Development (Assignment, Goals, Tasks, Final Eval)
    with get_db() as db:
        cur_assign = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')", (m_id, c_id, internship_id))
        assignment_id = cur_assign.lastrowid
        db.commit()

    # Mentor creates goal & milestone
    g_resp = client.post('/api/goals', json={'assignment_id': assignment_id, 'title': 'Deploy FastAPI Service'}, headers=mentor_headers)
    assert g_resp.status_code == 201

    # Mentor submits final evaluation
    fe_resp = client.post(
        '/api/evidence/final-evaluations',
        json={
            'assignment_id': assignment_id,
            'technical_skills': 5,
            'communication': 5,
            'problem_solving': 5,
            'reliability': 5,
            'task_execution': 5,
            'learning_adaptability': 5,
            'professionalism': 5,
            'strengths': 'Outstanding developer',
            'areas_for_improvement': 'None noted',
            'overall_evaluation': 'exceeds_expectations',
            'skill_observations': [{'intern_id': c_id, 'skill_name': 'fastapi', 'level': 'strong', 'note': 'Expert'}],
        },
        headers=mentor_headers,
    )
    assert fe_resp.status_code == 201

    # 9. Complete Outcome & Verify Certificate
    out_resp = client.post(f'/api/outcomes/complete/{assignment_id}', headers=prov_headers)
    assert out_resp.status_code == 200
    outcome_data = out_resp.json()
    cert_id = outcome_data['certificate']['certificate_id']

    # Public Verification API
    verify_resp = client.get(f'/api/verify/{cert_id}')
    assert verify_resp.status_code == 200
    v_body = verify_resp.json()
    assert v_body['valid'] is True
    assert v_body['candidate_name'] == 'Candidate Alice'
    assert v_body['provider_name'] == 'TechCorp'
    assert 'python' in v_body['verified_skills']

    # 10. Role Protection / Authorization Checks (UNAUTHORIZED Scenario)
    unauth_resp = client.get('/api/applications', headers=cand_headers) # Candidate requesting provider queue -> 403 Forbidden
    assert unauth_resp.status_code == 403
