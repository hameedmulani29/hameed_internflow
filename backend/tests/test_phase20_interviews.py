import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import sqlite3

from app.main import app
from app.core.security import create_token
from app.db import get_db, get_db_path, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    db_path = get_db_path()
    with sqlite3.connect(db_path) as connection:
        connection.execute('PRAGMA foreign_keys = OFF')
        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        for table in tables:
            connection.execute(f'DELETE FROM "{table}"')
            connection.execute('DELETE FROM sqlite_sequence WHERE name = ?', (table,))
        connection.execute('PRAGMA foreign_keys = ON')
        connection.commit()
    init_db()

def test_interview_scheduling_conflict_and_scorecard():
    with get_db() as db:
        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Interviewer Prov', 'interviewer-p20@test.com', 'hash', 'provider')")
        p_id = db.execute("SELECT id FROM users WHERE email='interviewer-p20@test.com'").fetchone()[0]

        db.execute("INSERT OR IGNORE INTO users (full_name, email, password_hash, role) VALUES ('Cand 1', 'cand1-p20@test.com', 'hash', 'intern')")
        c1_id = db.execute("SELECT id FROM users WHERE email='cand1-p20@test.com'").fetchone()[0]

        cursor = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'QA Lead', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')", (p_id,))
        ship_id = cursor.lastrowid

        app_cur = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'shortlisted')", (ship_id, c1_id))
        app_id = app_cur.lastrowid
        db.commit()

    token = create_token(p_id, 'provider')
    headers = {'Authorization': f'Bearer {token}'}

    now_iso = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()

    # Schedule 1st interview
    sch_resp = client.post(
        '/api/interviews/schedule',
        json={
            'application_id': app_id,
            'interviewer_id': p_id,
            'scheduled_at': now_iso,
            'duration_minutes': 45,
            'notes': 'Technical interview round',
        },
        headers=headers,
    )
    assert sch_resp.status_code == 201
    interview_data = sch_resp.json()
    interview_id = interview_data['id']

    # Attempt to schedule overlapping interview (CONFLICT test)
    conflict_resp = client.post(
        '/api/interviews/schedule',
        json={
            'application_id': app_id,
            'interviewer_id': p_id,
            'scheduled_at': now_iso,
            'duration_minutes': 30,
        },
        headers=headers,
    )
    assert conflict_resp.status_code == 409
    assert 'conflict' in conflict_resp.json()['detail'].lower()

    # Submit scorecard
    sc_resp = client.post(
        f'/api/interviews/{interview_id}/scorecard',
        json={
            'technical_skills': 5,
            'communication': 4,
            'problem_solving': 4,
            'role_understanding': 4,
            'relevant_skills': 5,
            'overall_recommendation': 'advance',
            'evidence_notes': 'Demonstrated excellent API design understanding.',
            'skill_evaluations': [
                {'skill_name': 'python', 'rating': 5, 'notes': 'Deep understanding of async Python.'}
            ],
        },
        headers=headers,
    )
    assert sc_resp.status_code == 201
    sc_data = sc_resp.json()
    assert sc_data['overall_recommendation'] == 'advance'

    # Verify interview status is updated to completed
    with get_db() as db:
        inv_status = db.execute("SELECT status FROM interviews WHERE id = ?", (interview_id,)).fetchone()[0]
        assert inv_status == 'completed'

        # Check evidence recorded
        ev_row = db.execute("SELECT * FROM skill_evidence WHERE candidate_id = ? AND source_type = 'interview'", (c1_id,)).fetchone()
        assert ev_row is not None
        assert ev_row['level'] == '5/5'


def test_interview_eligibility_and_candidate_visibility_are_enforced():
    with get_db() as db:
        provider_one = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'provider')", ('Provider One', 'provider.one.flow@test.com', 'hash'))
        p_id = provider_one.lastrowid

        provider_two = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'provider')", ('Provider Two', 'provider.two.flow@test.com', 'hash'))
        p2_id = provider_two.lastrowid

        candidate_a = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'intern')", ('Candidate A', 'cand.a.flow@test.com', 'hash'))
        c1_id = candidate_a.lastrowid

        candidate_b = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'intern')", ('Candidate B', 'cand.b.flow@test.com', 'hash'))
        c2_id = candidate_b.lastrowid

        candidate_c = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'intern')", ('Candidate C', 'cand.c.flow@test.com', 'hash'))
        c3_id = candidate_c.lastrowid

        internship_a = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Internship A', 'Engineering', 'desc', 'Remote', 'Remote', '3 months', '1000', 'published')", (p_id,))
        internship_a_id = internship_a.lastrowid

        internship_b = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Internship B', 'Design', 'desc', 'Remote', 'Remote', '3 months', '1000', 'published')", (p2_id,))
        internship_b_id = internship_b.lastrowid

        app_a = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'interview')", (internship_a_id, c1_id))
        app_a_id = app_a.lastrowid
        db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'shortlisted')", (internship_a_id, c2_id))
        db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'interview')", (internship_b_id, c3_id))
        db.commit()

    provider_token = create_token(p_id, 'provider')
    headers = {'Authorization': f'Bearer {provider_token}'}

    response = client.get(f'/api/interviews/eligible-candidates?internship_id={internship_a_id}', headers=headers)
    assert response.status_code == 200
    items = response.json()['items']
    assert [item['candidate_id'] for item in items] == [c1_id]

    candidate_token = create_token(c1_id, 'intern')
    candidate_headers = {'Authorization': f'Bearer {candidate_token}'}

    interview_resp = client.post(
        '/api/interviews/schedule',
        json={
            'application_id': app_a_id,
            'scheduled_at': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            'duration_minutes': 30,
        },
        headers=headers,
    )
    assert interview_resp.status_code == 201

    other_candidate = client.get(f'/api/interviews/application/{app_a_id}', headers={'Authorization': f'Bearer {create_token(c2_id, "intern")}'} )
    assert other_candidate.status_code == 403

    candidate_view = client.get(f'/api/interviews/application/{app_a_id}', headers=candidate_headers)
    assert candidate_view.status_code == 200
    assert candidate_view.json()['has_interview'] is True
