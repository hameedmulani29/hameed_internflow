import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_full_completion_verified_skills_passport_certificate_and_public_verification():
    with get_db() as db:
        db.execute("INSERT INTO users (full_name, email, password_hash, role, organization) VALUES ('Tech Corp Provider', 'prov-outcome@test.com', 'hash', 'provider', 'TechCorp') ON CONFLICT (email) DO NOTHING")
        p_id = db.execute("SELECT id FROM users WHERE email='prov-outcome@test.com'").fetchone()[0]

        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Mentor Alex', 'mentor-outcome@test.com', 'hash', 'mentor') ON CONFLICT (email) DO NOTHING")
        m_id = db.execute("SELECT id FROM users WHERE email='mentor-outcome@test.com'").fetchone()[0]

        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Sarah', 'sarah-outcome@test.com', 'hash', 'intern') ON CONFLICT (email) DO NOTHING")
        i_id = db.execute("SELECT id FROM users WHERE email='sarah-outcome@test.com'").fetchone()[0]

        cursor = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Fullstack Developer Intern', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '15k', 'published')", (p_id,))
        ship_id = cursor.lastrowid

        cur_a = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')", (m_id, i_id, ship_id))
        assignment_id = cur_a.lastrowid

        # Insert skill & evidence
        db.execute("INSERT INTO skills (name) VALUES ('python') ON CONFLICT (name) DO NOTHING")
        py_id = db.execute("SELECT id FROM skills WHERE name='python'").fetchone()[0]
        db.execute("INSERT INTO candidate_skills (intern_id, skill_id, source) VALUES (?, ?, 'assessment')", (i_id, py_id))
        db.execute("INSERT INTO skill_evidence (candidate_id, skill_id, source_type, score, level, title) VALUES (?, ?, 'assessment', 85, 'proficient', 'Assessment Evidence')", (i_id, py_id))

        # Submit final evaluation
        db.execute(
            '''INSERT INTO final_evaluations (assignment_id, intern_id, mentor_id, technical_skills, communication, problem_solving, reliability, task_execution, learning_adaptability, professionalism, strengths, areas_for_improvement, overall_evaluation, status)
               VALUES (?, ?, ?, 5, 5, 5, 5, 5, 5, 5, 'Great work', 'None', 'exceeds_expectations', 'submitted')''',
            (assignment_id, i_id, m_id),
        )
        db.commit()

    token = create_token(p_id, 'provider')
    headers = {'Authorization': f'Bearer {token}'}

    # Complete internship outcome
    comp_resp = client.post(f'/api/outcomes/complete/{assignment_id}', headers=headers)
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()

    assert comp_data['outcome']['status'] == 'completed'
    assert len(comp_data['verified_skills']) >= 1
    assert comp_data['verified_skills'][0]['skill_name'] == 'python'

    cert_id = comp_data['certificate']['certificate_id']
    assert cert_id.startswith('IF-2026-')

    # Candidate passport check
    intern_token = create_token(i_id, 'intern')
    i_headers = {'Authorization': f'Bearer {intern_token}'}

    pass_resp = client.get('/api/skill-passport/me', headers=i_headers)
    assert pass_resp.status_code == 200
    passport_data = pass_resp.json()
    passport_code = passport_data['passport']['passport_code']
    assert len(passport_data['verified_skills']) >= 1

    # Check public passport (initially private -> returns 403)
    pub_pass_resp = client.get(f'/api/skill-passport/public/{passport_code}')
    assert pub_pass_resp.status_code == 403

    # Toggle passport to public
    client.post('/api/skill-passport/toggle-visibility', json={'is_public': True}, headers=i_headers)

    # Re-check public passport -> returns 200 with verified skills
    pub_pass_ok = client.get(f'/api/skill-passport/public/{passport_code}')
    assert pub_pass_ok.status_code == 200
    assert len(pub_pass_ok.json()['verified_skills']) >= 1

    # PUBLIC CERTIFICATE VERIFICATION ROUTE TEST
    verify_resp = client.get(f'/api/verify/{cert_id}')
    assert verify_resp.status_code == 200
    v_data = verify_resp.json()
    assert v_data['valid'] is True
    assert v_data['candidate_name'] == 'Intern Sarah'
    assert v_data['provider_name'] == 'TechCorp'
    assert v_data['internship_title'] == 'Fullstack Developer Intern'
    assert 'python' in v_data['verified_skills']

    # Test invalid certificate ID returns 404
    bad_verify = client.get('/api/verify/INVALID-CERT-9999')
    assert bad_verify.status_code == 404
