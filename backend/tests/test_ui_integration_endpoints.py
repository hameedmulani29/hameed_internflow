import uuid

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def _seed_provider_world():
    """Create a provider, mentor, intern, internship, application, and return IDs.

    Uses a unique suffix per run so tests are independent of leftover rows in
    the shared dev database."""
    suffix = uuid.uuid4().hex[:8]
    with get_db() as db:
        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Prov UI', ?, 'hash', 'provider')", (f'prov-ui-{suffix}@test.com',))
        p_id = db.execute("SELECT id FROM users WHERE email=?", (f'prov-ui-{suffix}@test.com',)).fetchone()[0]

        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Mentor UI', ?, 'hash', 'mentor')", (f'mentor-ui-{suffix}@test.com',))
        m_id = db.execute("SELECT id FROM users WHERE email=?", (f'mentor-ui-{suffix}@test.com',)).fetchone()[0]

        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern UI', ?, 'hash', 'intern')", (f'intern-ui-{suffix}@test.com',))
        i_id = db.execute("SELECT id FROM users WHERE email=?", (f'intern-ui-{suffix}@test.com',)).fetchone()[0]

        # A second provider to assert isolation.
        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Prov Other', ?, 'hash', 'provider')", (f'prov-other-{suffix}@test.com',))
        po_id = db.execute("SELECT id FROM users WHERE email=?", (f'prov-other-{suffix}@test.com',)).fetchone()[0]

        ship_cur = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, ?, 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')",
            (p_id, f'UI Dev Intern {suffix}'),
        )
        ship_id = ship_cur.lastrowid

        other_ship_cur = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, ?, 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')",
            (po_id, f'Other Internship {suffix}'),
        )
        other_ship_id = other_ship_cur.lastrowid

        app_cur = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'selected')", (ship_id, i_id))
        app_id = app_cur.lastrowid

        asg_cur = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')", (m_id, i_id, ship_id))
        asg_id = asg_cur.lastrowid

        outcome_cur = db.execute(
            "INSERT INTO internship_outcomes (assignment_id, intern_id, internship_id, provider_id, status) VALUES (?, ?, ?, ?, 'completed')",
            (asg_id, i_id, ship_id, p_id),
        )
        outcome_id = outcome_cur.lastrowid
        cert_code = f'CERT-UI-{suffix}'
        cert_cur = db.execute(
            "INSERT INTO certificates (certificate_id, outcome_id, intern_id, provider_id, internship_id, candidate_name, internship_title, provider_name, verified_skills, verification_url) VALUES (?, ?, ?, ?, ?, 'Intern UI', ?, 'Prov UI', '[]', 'http://x/y')",
            (cert_code, outcome_id, i_id, p_id, ship_id, f'UI Dev Intern {suffix}'),
        )
        cert_id = cert_cur.lastrowid
        db.commit()
    return {'provider': p_id, 'other_provider': po_id, 'mentor': m_id, 'intern': i_id,
            'internship': ship_id, 'other_internship': other_ship_id, 'application': app_id,
            'assignment': asg_id, 'certificate': cert_id, 'certificate_code': cert_code,
            'internship_title': f'UI Dev Intern {suffix}'}


def test_provider_internship_list_is_isolated_to_own_records():
    ids = _seed_provider_world()
    headers = {'Authorization': f"Bearer {create_token(ids['provider'], 'provider')}"}
    resp = client.get('/api/internships', headers=headers)
    assert resp.status_code == 200
    titles = [i['title'] for i in resp.json()['items']]
    assert ids['internship_title'] in titles
    # Provider B's internship must never appear in provider A's list.
    assert 'Other Internship' not in ''.join(titles)

    # Public listing still shows only published internships from anyone.
    public_resp = client.get('/api/internships')
    assert public_resp.status_code == 200


def test_provider_assessment_list_includes_attempt_stats():
    ids = _seed_provider_world()
    with get_db() as db:
        q_cur = db.execute("INSERT INTO questions (question_text, type, options, correct_answer) VALUES ('Q1?', 'mcq', '[\"a\",\"b\"]', 'a')")
        q1 = q_cur.lastrowid
        a_cur = db.execute("INSERT INTO assessments (title, provider_id, internship_id, pass_score, duration_minutes) VALUES ('UI Test', ?, ?, 70, 45)", (ids['provider'], ids['internship']))
        a_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)", (a_id, q1))
        db.execute("INSERT INTO assessment_attempts (assessment_id, candidate_id, application_id, status, overall_score, passed) VALUES (?, ?, ?, 'completed', 84, TRUE)", (a_id, ids['intern'], ids['application']))
        db.execute("INSERT INTO assessment_attempts (assessment_id, candidate_id, application_id, status) VALUES (?, ?, ?, 'in_progress')", (a_id, ids['intern'], ids['application']))
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['provider'], 'provider')}"}
    resp = client.get('/api/assessments', headers=headers)
    assert resp.status_code == 200
    items = resp.json()['items']
    row = next(i for i in items if i['id'] == a_id)
    assert row['question_count'] == 1
    assert row['attempt_count'] == 2
    assert row['completed_count'] == 1
    assert row['avg_score'] == 84
    assert row['passed_count'] == 1
    assert row['duration_minutes'] == 45


def test_start_attempt_reports_remaining_seconds_for_timed_assessment():
    ids = _seed_provider_world()
    with get_db() as db:
        q_cur = db.execute("INSERT INTO questions (question_text, type, options, correct_answer) VALUES ('Q1?', 'mcq', '[\"a\",\"b\"]', 'a')")
        q1 = q_cur.lastrowid
        a_cur = db.execute("INSERT INTO assessments (title, provider_id, internship_id, pass_score, duration_minutes) VALUES ('Timed Test', ?, ?, 70, 30)", (ids['provider'], ids['internship']))
        a_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)", (a_id, q1))
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['intern'], 'intern')}"}
    resp = client.post(f'/api/assessments/{a_id}/start?application_id={ids["application"]}', headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data['remaining_seconds'] is not None
    assert 0 < data['remaining_seconds'] <= 30 * 60

    # Reload/resume: a second start must return a NON-RESET, non-increasing timer.
    resp2 = client.post(f'/api/assessments/{a_id}/start?application_id={ids["application"]}', headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()['remaining_seconds'] <= data['remaining_seconds']


def test_untimed_assessment_returns_null_remaining_seconds():
    ids = _seed_provider_world()
    with get_db() as db:
        q_cur = db.execute("INSERT INTO questions (question_text, type, options, correct_answer) VALUES ('Q1?', 'mcq', '[\"a\",\"b\"]', 'a')")
        q1 = q_cur.lastrowid
        a_cur = db.execute("INSERT INTO assessments (title, provider_id, internship_id, pass_score) VALUES ('Untimed Test', ?, ?, 70)", (ids['provider'], ids['internship']))
        a_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)", (a_id, q1))
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['intern'], 'intern')}"}
    resp = client.post(f'/api/assessments/{a_id}/start?application_id={ids["application"]}', headers=headers)
    assert resp.status_code == 200
    assert resp.json()['remaining_seconds'] is None


def test_expired_attempt_returns_zero_remaining_and_rejects_submit():
    ids = _seed_provider_world()
    with get_db() as db:
        q_cur = db.execute("INSERT INTO questions (question_text, type, options, correct_answer) VALUES ('Q1?', 'mcq', '[\"a\",\"b\"]', 'a')")
        q1 = q_cur.lastrowid
        a_cur = db.execute("INSERT INTO assessments (title, provider_id, internship_id, pass_score, duration_minutes) VALUES ('Expired Test', ?, ?, 70, 20)", (ids['provider'], ids['internship']))
        a_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)", (a_id, q1))
        # Attempt started long ago.
        db.execute(
            "INSERT INTO assessment_attempts (assessment_id, candidate_id, application_id, status, started_at) VALUES (?, ?, ?, 'in_progress', datetime('now', '-2 hours'))",
            (a_id, ids['intern'], ids['application']),
        )
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['intern'], 'intern')}"}
    resp = client.post(f'/api/assessments/{a_id}/start?application_id={ids["application"]}', headers=headers)
    assert resp.status_code == 200
    assert resp.json()['remaining_seconds'] == 0

    # Backend must still refuse a submission for the expired attempt.
    attempt_id = resp.json()['attempt_id']
    sub = client.post(
        f'/api/assessments/attempts/{attempt_id}/submit',
        json={'responses': [{'question_id': q1, 'response': 'a'}]},
        headers=headers,
    )
    assert sub.status_code == 400


def test_provider_certificates_scoped_to_own_provider_id():
    ids = _seed_provider_world()
    headers = {'Authorization': f"Bearer {create_token(ids['provider'], 'provider')}"}
    resp = client.get('/api/certificates/provider', headers=headers)
    assert resp.status_code == 200
    items = resp.json()['items']
    assert len(items) == 1
    assert items[0]['certificate_id'] == ids['certificate_code']
    assert items[0]['provider_id'] == ids['provider']

    # The other provider must see none of provider A's certificates.
    other_headers = {'Authorization': f"Bearer {create_token(ids['other_provider'], 'provider')}"}
    resp_other = client.get('/api/certificates/provider', headers=other_headers)
    assert resp_other.status_code == 200
    assert resp_other.json()['items'] == []


def test_provider_mentee_detail_scoping_and_content():
    ids = _seed_provider_world()
    with get_db() as db:
        db.execute("INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, priority, status) VALUES (?, ?, ?, 'Build API', 'Do it', 'high', 'in_progress')", (ids['mentor'], ids['intern'], ids['internship']))
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['provider'], 'provider')}"}
    resp = client.get(f"/api/mentor/assignments/mentees/{ids['intern']}/detail", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data['intern']['id'] == ids['intern']
    assert len(data['assignments']) == 1
    assert data['assignments'][0]['internship_title'] == ids['internship_title']
    assert data['assignments'][0]['mentor_name']
    assert len(data['tasks']) == 1 and data['tasks'][0]['title'] == 'Build API'
    assert 'sessions' in data['attendance']
    assert data['outcome']['outcome_status'] == 'completed'

    # An intern NOT assigned under this provider's internships must 404.
    with get_db() as db:
        other_intern_cur = db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Stranger Intern', 'stranger@test.com', 'hash', 'intern') ON CONFLICT (email) DO NOTHING")
        other_intern_id = db.execute("SELECT id FROM users WHERE email='stranger@test.com'").fetchone()[0]
        asg_cur = db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')", (ids['mentor'], other_intern_id, ids['other_internship']))
        asg_id = asg_cur.lastrowid
        db.commit()

    resp2 = client.get(f"/api/mentor/assignments/mentees/{other_intern_id}/detail", headers=headers)
    assert resp2.status_code == 404


def test_provider_application_attempts_endpoint():
    ids = _seed_provider_world()
    with get_db() as db:
        a_cur = db.execute("INSERT INTO assessments (title, provider_id, internship_id, pass_score) VALUES ('Attempt List Test', ?, ?, 70)", (ids['provider'], ids['internship']))
        a_id = a_cur.lastrowid
        db.execute("INSERT INTO assessment_attempts (assessment_id, candidate_id, application_id, status, overall_score, passed) VALUES (?, ?, ?, 'completed', 55, FALSE)", (a_id, ids['intern'], ids['application']))
        db.commit()

    headers = {'Authorization': f"Bearer {create_token(ids['provider'], 'provider')}"}
    resp = client.get(f"/api/assessments/provider/intern/{ids['application']}/attempts", headers=headers)
    assert resp.status_code == 200
    items = resp.json()['items']
    assert len(items) == 1
    assert items[0]['overall_score'] == 55
    assert 'correct_answer' not in items[0]

    # Interns cannot use the provider endpoint.
    intern_headers = {'Authorization': f"Bearer {create_token(ids['intern'], 'intern')}"}
    resp_intern = client.get(f"/api/assessments/provider/intern/{ids['application']}/attempts", headers=intern_headers)
    assert resp_intern.status_code == 403
