import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_ai_interview_question_generator_and_weekly_progress_report():
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Prov Adv', 'adv-prov@test.com', 'hash', 'provider')")
        p_id = db.execute("SELECT id FROM users WHERE email='adv-prov@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Mentor Adv', 'adv-mentor@test.com', 'hash', 'mentor')")
        m_id = db.execute("SELECT id FROM users WHERE email='adv-mentor@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Intern Adv', 'adv-intern@test.com', 'hash', 'intern')")
        i_id = db.execute("SELECT id FROM users WHERE email='adv-intern@test.com'").fetchone()[0]

        cursor = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Cloud Engineer', 'DevOps', 'Deploy Kubernetes and Docker.', 'Remote', 'Remote', '3m', '12k', 'published')", (p_id,))
        ship_id = cursor.lastrowid

        cur_app = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'interview')", (ship_id, i_id))
        app_id = cur_app.lastrowid

        cur_assign = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')", (m_id, i_id, ship_id))
        assignment_id = cur_assign.lastrowid

        db.execute("INSERT INTO attendance (intern_id, checked_in_at, checked_out_at, work_minutes, status) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 480, 'checked_out')", (i_id,))
        db.commit()

    p_headers = {'Authorization': f'Bearer {create_token(p_id, "provider")}'}

    # 1. AI Interview Question Generator test
    q_resp = client.post('/api/interviews/ai-generate-questions', json={'application_id': app_id}, headers=p_headers)
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    assert len(q_data['questions']) >= 1
    assert 'question' in q_data['questions'][0]

    # 2. Weekly Progress Report test
    r_resp = client.get(f'/api/progress/weekly-report/{assignment_id}', headers=p_headers)
    assert r_resp.status_code == 200
    r_data = r_resp.json()
    assert r_data['summary']['total_hours'] == 8.0
    assert 'Weekly Internship Progress Report' in r_data['report_markdown']
