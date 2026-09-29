import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_assessment_server_side_scoring_and_evidence():
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Provider P', 'prov-p20@test.com', 'hash', 'provider')")
        p_id = db.execute("SELECT id FROM users WHERE email='prov-p20@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Intern I', 'intern-p20@test.com', 'hash', 'intern')")
        i_id = db.execute("SELECT id FROM users WHERE email='intern-p20@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO skills (name, category) VALUES ('python', 'Engineering')")
        py_id = db.execute("SELECT id FROM skills WHERE name='python'").fetchone()[0]

        q_cur = db.execute("INSERT INTO questions (question_text, type, skill_id, options, correct_answer) VALUES ('What is 2+2 in Python?', 'mcq', ?, '[\"3\", \"4\"]', '4')", (py_id,))
        q1_id = q_cur.lastrowid

        a_cur = db.execute("INSERT INTO assessments (title, provider_id, pass_score) VALUES ('Python Test', ?, 50)", (p_id,))
        ass_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)", (ass_id, q1_id))

        cursor = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Py Dev', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')", (p_id,))
        ship_id = cursor.lastrowid

        app_cur = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'assessment')", (ship_id, i_id))
        app_id = app_cur.lastrowid
        db.commit()

    intern_token = create_token(i_id, 'intern')
    headers = {'Authorization': f'Bearer {intern_token}'}

    # Start attempt
    start_resp = client.post(f'/api/assessments/{ass_id}/start?application_id={app_id}', headers=headers)
    assert start_resp.status_code == 200
    start_data = start_resp.json()
    attempt_id = start_data['attempt_id']
    questions = start_data['questions']
    assert len(questions) == 1
    # Verify correct_answer is NOT exposed in start response
    assert 'correct_answer' not in questions[0]

    # Submit correct answer
    sub_resp = client.post(
        f'/api/assessments/attempts/{attempt_id}/submit',
        json={'responses': [{'question_id': q1_id, 'response': '4'}]},
        headers=headers,
    )
    assert sub_resp.status_code == 200
    sub_data = sub_resp.json()
    assert sub_data['overall_score'] == 100
    assert sub_data['passed'] is True
    assert len(sub_data['skill_breakdown']) == 1
    assert sub_data['skill_breakdown'][0]['skill_name'] == 'python'

    # Check evidence created in database
    with get_db() as db:
        ev_count = db.execute("SELECT COUNT(*) FROM skill_evidence WHERE candidate_id = ? AND source_type = 'assessment'", (i_id,)).fetchone()[0]
        assert ev_count >= 1
