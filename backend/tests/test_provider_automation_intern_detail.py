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


def _seed_automation_test_world():
    """Seed provider, mentor, intern, assignments, tasks, submissions, feedback, skills, observations."""
    suffix = uuid.uuid4().hex[:8]
    with get_db() as db:
        # Provider A
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Provider Alpha', ?, 'hash', 'provider')",
            (f'prov-alpha-{suffix}@test.com',),
        )
        prov_a_id = db.execute("SELECT id FROM users WHERE email=?", (f'prov-alpha-{suffix}@test.com',)).fetchone()[0]

        # Provider B (Unauthorized)
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Provider Beta', ?, 'hash', 'provider')",
            (f'prov-beta-{suffix}@test.com',),
        )
        prov_b_id = db.execute("SELECT id FROM users WHERE email=?", (f'prov-beta-{suffix}@test.com',)).fetchone()[0]

        # Mentor
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Mentor Alpha', ?, 'hash', 'mentor')",
            (f'mentor-alpha-{suffix}@test.com',),
        )
        mentor_id = db.execute("SELECT id FROM users WHERE email=?", (f'mentor-alpha-{suffix}@test.com',)).fetchone()[0]

        # Intern A (under Provider A)
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Alpha', ?, 'hash', 'intern')",
            (f'intern-alpha-{suffix}@test.com',),
        )
        intern_a_id = db.execute("SELECT id FROM users WHERE email=?", (f'intern-alpha-{suffix}@test.com',)).fetchone()[0]

        # Intern B (under Provider B)
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Beta', ?, 'hash', 'intern')",
            (f'intern-beta-{suffix}@test.com',),
        )
        intern_b_id = db.execute("SELECT id FROM users WHERE email=?", (f'intern-beta-{suffix}@test.com',)).fetchone()[0]

        # Provider A's Internship
        ship_a_cur = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Alpha Engineering', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')",
            (prov_a_id,),
        )
        ship_a_id = ship_a_cur.lastrowid

        # Provider B's Internship
        ship_b_cur = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Beta Product', 'Product', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')",
            (prov_b_id,),
        )
        ship_b_id = ship_b_cur.lastrowid

        # Mentor Assignments
        asg_a_cur = db.execute(
            "INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')",
            (mentor_id, intern_a_id, ship_a_id),
        )
        asg_a_id = asg_a_cur.lastrowid

        db.execute(
            "INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')",
            (mentor_id, intern_b_id, ship_b_id),
        )

        # Mentor Task & Submission for Intern A
        task_cur = db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, priority, status) VALUES (?, ?, ?, 'Build Automation Connector', 'Detail description', 'high', 'in_progress')",
            (mentor_id, intern_a_id, ship_a_id),
        )
        task_id = task_cur.lastrowid

        sub_cur = db.execute(
            "INSERT INTO task_submissions (task_id, intern_id, content, status) VALUES (?, ?, 'Completed initial API integration', 'pending')",
            (task_id, intern_a_id),
        )

        # Mentor Feedback for Intern A
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, task_id, feedback, strengths, improvements, next_steps) VALUES (?, ?, ?, 'Great progress on automation', 'Fast implementation', 'Add unit tests', 'Deploy to staging')",
            (mentor_id, intern_a_id, task_id),
        )

        # Skill & Skill Observation
        db.execute("INSERT INTO skills (name, category) VALUES (?, 'Technical')", (f'Python-{suffix}',))
        skill_id = db.execute("SELECT id FROM skills WHERE name=?", (f'Python-{suffix}',)).fetchone()[0]

        db.execute(
            "INSERT INTO candidate_skills (intern_id, skill_id, source) VALUES (?, ?, 'candidate_profile')",
            (intern_a_id, skill_id),
        )

        db.execute(
            "INSERT INTO mentor_skill_observations (mentor_id, intern_id, skill_id, task_id, level, note) VALUES (?, ?, ?, ?, 'proficient', 'Demonstrated solid understanding')",
            (mentor_id, intern_a_id, skill_id, task_id),
        )

        db.commit()

    return {
        'prov_a': prov_a_id,
        'prov_b': prov_b_id,
        'mentor': mentor_id,
        'intern_a': intern_a_id,
        'intern_b': intern_b_id,
        'ship_a': ship_a_id,
        'ship_b': ship_b_id,
        'skill_name': f'Python-{suffix}',
    }


def test_valid_provider_access_authorized_intern():
    data = _seed_automation_test_world()
    token = create_token(data['prov_a'], 'provider')
    headers = {'Authorization': f'Bearer {token}'}

    resp = client.get(f"/api/provider/automation/interns/{data['intern_a']}/detail", headers=headers)
    assert resp.status_code == 200
    payload = resp.json()

    # Response structure verification
    assert 'intern' in payload
    assert 'assignment' in payload
    assert 'tasks' in payload
    assert 'submissions' in payload
    assert 'feedback' in payload
    assert 'skills' in payload
    assert 'observations' in payload

    # Content verification
    assert payload['intern']['id'] == data['intern_a']
    assert payload['assignment']['internship_title'] == 'Alpha Engineering'
    assert len(payload['tasks']) >= 1
    assert payload['tasks'][0]['title'] == 'Build Automation Connector'
    assert len(payload['submissions']) >= 1
    assert 'Completed initial API integration' in payload['submissions'][0]['content']
    assert len(payload['feedback']) >= 1
    assert 'Great progress on automation' in payload['feedback'][0]['feedback']
    assert any(s['name'] == data['skill_name'] for s in payload['skills'])
    assert any(o['skill_name'] == data['skill_name'] for o in payload['observations'])


def test_provider_cannot_access_unauthorized_intern():
    data = _seed_automation_test_world()
    # Provider B attempts to access Intern A (who belongs to Provider A)
    token_b = create_token(data['prov_b'], 'provider')
    headers_b = {'Authorization': f'Bearer {token_b}'}

    resp = client.get(f"/api/provider/automation/interns/{data['intern_a']}/detail", headers=headers_b)
    assert resp.status_code in (403, 404)
    assert 'Forbidden' in resp.json()['detail'] or 'not belong' in resp.json()['detail'].lower() or 'not found' in resp.json()['detail'].lower()


def test_provider_automation_non_existent_intern():
    data = _seed_automation_test_world()
    token = create_token(data['prov_a'], 'provider')
    headers = {'Authorization': f'Bearer {token}'}

    resp = client.get("/api/provider/automation/interns/999999/detail", headers=headers)
    assert resp.status_code == 404
    assert 'Intern not found' in resp.json()['detail']


def test_missing_or_invalid_provider_authentication():
    data = _seed_automation_test_world()
    intern_id = data['intern_a']

    # Missing auth header
    resp_no_auth = client.get(f"/api/provider/automation/interns/{intern_id}/detail")
    assert resp_no_auth.status_code in (401, 403)

    # Invalid token
    resp_bad_auth = client.get(
        f"/api/provider/automation/interns/{intern_id}/detail",
        headers={'Authorization': 'Bearer invalid.jwt.token'},
    )
    assert resp_bad_auth.status_code in (401, 403)

    # Wrong role token (Mentor token trying to access provider automation)
    mentor_token = create_token(data['mentor'], 'mentor')
    resp_wrong_role = client.get(
        f"/api/provider/automation/interns/{intern_id}/detail",
        headers={'Authorization': f'Bearer {mentor_token}'},
    )
    assert resp_wrong_role.status_code == 403


def test_existing_mentor_endpoint_continues_to_work():
    data = _seed_automation_test_world()
    token_mentor = create_token(data['mentor'], 'mentor')
    headers_mentor = {'Authorization': f'Bearer {token_mentor}'}

    # Assigned mentor accesses Intern A
    resp = client.get(f"/api/mentor/interns/{data['intern_a']}/detail", headers=headers_mentor)
    assert resp.status_code == 200
    payload = resp.json()
    assert payload['intern']['id'] == data['intern_a']
    assert payload['assignment']['internship_title'] == 'Alpha Engineering'
    assert len(payload['tasks']) >= 1
    assert payload['tasks'][0]['title'] == 'Build Automation Connector'
    assert len(payload['submissions']) >= 1
    assert len(payload['feedback']) >= 1
    assert any(s['name'] == data['skill_name'] for s in payload['skills'])
    assert any(o['skill_name'] == data['skill_name'] for o in payload['observations'])

    # Unassigned mentor access rejected
    unassigned_mentor_token = create_token(99999, 'mentor')
    resp_unassigned = client.get(
        f"/api/provider/automation/interns/{data['intern_a']}/detail",
        headers={'Authorization': f'Bearer {unassigned_mentor_token}'},
    )
    assert resp_unassigned.status_code == 403
