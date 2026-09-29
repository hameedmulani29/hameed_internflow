import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_goals_milestones_observations_final_eval():
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Mentor M', 'mentor-p20@test.com', 'hash', 'mentor')")
        m_id = db.execute("SELECT id FROM users WHERE email='mentor-p20@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Intern Dev', 'intern-dev-p20@test.com', 'hash', 'intern')")
        i_id = db.execute("SELECT id FROM users WHERE email='intern-dev-p20@test.com'").fetchone()[0]

        cur = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, status) VALUES (?, ?, 'active')", (m_id, i_id))
        assignment_id = cur.lastrowid
        db.commit()

    mentor_token = create_token(m_id, 'mentor')
    m_headers = {'Authorization': f'Bearer {mentor_token}'}

    intern_token = create_token(i_id, 'intern')
    i_headers = {'Authorization': f'Bearer {intern_token}'}

    # Mentor creates goal
    g_resp = client.post(
        '/api/goals',
        json={'assignment_id': assignment_id, 'title': 'Build REST API Service'},
        headers=m_headers,
    )
    assert g_resp.status_code == 201
    goal_id = g_resp.json()['id']

    # Mentor adds milestone
    m_resp = client.post(
        f'/api/goals/{goal_id}/milestones',
        json={'title': 'Design OpenAPI spec', 'status': 'completed'},
        headers=m_headers,
    )
    assert m_resp.status_code == 201

    # Intern checks my goals & progress
    my_g_resp = client.get('/api/goals/me', headers=i_headers)
    assert my_g_resp.status_code == 200
    progress_data = my_g_resp.json()['progress']
    assert progress_data['milestones_completed'] == 1

    # Mentor submits skill observation
    obs_resp = client.post(
        '/api/evidence/observations',
        json={'intern_id': i_id, 'skill_name': 'fastapi', 'level': 'proficient', 'note': 'Created clean routes.'},
        headers=m_headers,
    )
    assert obs_resp.status_code == 201

    # Mentor submits final evaluation
    fe_resp = client.post(
        '/api/evidence/final-evaluations',
        json={
            'assignment_id': assignment_id,
            'technical_skills': 5,
            'communication': 4,
            'problem_solving': 5,
            'reliability': 5,
            'task_execution': 5,
            'learning_adaptability': 5,
            'professionalism': 5,
            'strengths': 'Outstanding code quality.',
            'areas_for_improvement': 'None noted.',
            'overall_evaluation': 'exceeds_expectations',
            'skill_observations': [
                {'intern_id': i_id, 'skill_name': 'python', 'level': 'strong', 'note': 'Mastered backend patterns.'}
            ],
        },
        headers=m_headers,
    )
    assert fe_resp.status_code == 201
    assert fe_resp.json()['overall_evaluation'] == 'exceeds_expectations'
