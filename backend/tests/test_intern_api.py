import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'intern_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.interns.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.interns.router import router as intern_router
from app.internships.router import router as internships_router

app = FastAPI()
app.include_router(intern_router)
app.include_router(internships_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM task_submissions')
        db.execute('DELETE FROM mentor_tasks')
        db.execute('DELETE FROM mentor_assignments')
        db.execute('DELETE FROM internships')
        db.execute('DELETE FROM users')

        def make_user(name, email, role):
            db.execute(
                'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
                (name, email, 'x', role, 'InternFlow'),
            )
            return db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()[0]

        provider_id = make_user('Provider One', 'provider@company.dev', 'provider')
        mentor_id = make_user('Mentor One', 'mentor@dev.in', 'mentor')
        intern_one_id = make_user('Intern One', 'intern1@dev.in', 'intern')
        intern_two_id = make_user('Intern Two', 'intern2@dev.in', 'intern')

        internship_id = db.execute(
            'INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (provider_id, 'AI Engineering Intern', 'AI', 'Build LLM workflows', 'Remote', 'Remote', '3 months', '$500', 'published', 2, '2026-10-10'),
        ).lastrowid

        db.execute(
            'INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, ?)',
            (mentor_id, intern_one_id, internship_id, 'active'),
        )
        db.execute(
            'INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, ?)',
            (mentor_id, intern_two_id, internship_id, 'active'),
        )

        task_one_id = db.execute(
            'INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (mentor_id, intern_one_id, 'Build onboarding mini app', 'Create auth screens and alerts', 'high', '2026-10-05', 'assigned'),
        ).lastrowid
        task_two_id = db.execute(
            'INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (mentor_id, intern_one_id, 'Write user journey notes', 'Document early findings', 'normal', '2026-10-08', 'in_progress'),
        ).lastrowid
        db.execute(
            'INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (mentor_id, intern_two_id, 'Review metrics dashboard', 'Prepare weekly metrics review', 'low', '2026-10-09', 'assigned'),
        )

        db.execute(
            'INSERT INTO task_submissions (task_id, intern_id, content, status, submitted_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            (task_one_id, intern_one_id, 'Completed auth screens and validation workflow.', 'pending'),
        )
        db.commit()

    yield {
        'provider': provider_id,
        'mentor': mentor_id,
        'intern_one': intern_one_id,
        'intern_two': intern_two_id,
    }


def auth(user_id, role):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_workspace_requires_intern_role(seeded_database):
    response = client.get('/api/interns/me/workspace', headers=auth(seeded_database['provider'], 'provider'))
    assert response.status_code == 403


def test_workspace_returns_only_current_intern_data(seeded_database):
    response = client.get('/api/interns/me/workspace', headers=auth(seeded_database['intern_one'], 'intern'))
    assert response.status_code == 200
    payload = response.json()
    assert payload['intern']['id'] == seeded_database['intern_one']
    assert payload['mentor']['name'] == 'Mentor One'
    assert payload['internship']['title'] == 'AI Engineering Intern'
    assert payload['task_summary']['total_tasks'] >= 2


def test_tasks_returns_only_assigned_tasks_for_current_intern(seeded_database):
    response = client.get('/api/interns/tasks', headers=auth(seeded_database['intern_one'], 'intern'))
    assert response.status_code == 200
    payload = response.json()
    items = payload['items']
    assert len(items) == 2
    assert {item['intern_id'] for item in items} == {seeded_database['intern_one']}


def test_valid_submission_creates_submission_and_updates_task_status(seeded_database):
    task_id = client.get('/api/interns/tasks', headers=auth(seeded_database['intern_one'], 'intern')).json()['items'][1]['id']
    response = client.post(
        f'/api/interns/tasks/{task_id}/submit',
        headers=auth(seeded_database['intern_one'], 'intern'),
        json={'content': 'Completed the user journey notes and linked the final artifact. This is a valid submission payload.', 'repo_url': 'https://github.com/example/repo'}
    )
    assert response.status_code == 201
    body = response.json()
    assert body['task_id'] == task_id
    assert body['status'] == 'pending'


def test_submission_for_other_interns_task_is_rejected(seeded_database):
    other_task_id = client.get('/api/interns/tasks', headers=auth(seeded_database['intern_two'], 'intern')).json()['items'][0]['id']
    response = client.post(
        f'/api/interns/tasks/{other_task_id}/submit',
        headers=auth(seeded_database['intern_one'], 'intern'),
        json={'content': 'Attempting to submit another intern task.'}
    )
    assert response.status_code == 404


def test_status_update_allows_valid_intern_transition(seeded_database):
    task_id = client.get('/api/interns/tasks', headers=auth(seeded_database['intern_one'], 'intern')).json()['items'][0]['id']
    response = client.patch(
        f'/api/interns/tasks/{task_id}/status',
        headers=auth(seeded_database['intern_one'], 'intern'),
        json={'status': 'in_progress'}
    )
    assert response.status_code == 200
    assert response.json()['status'] == 'in_progress'


def test_status_update_rejects_mentor_only_transition(seeded_database):
    task_id = client.get('/api/interns/tasks', headers=auth(seeded_database['intern_one'], 'intern')).json()['items'][0]['id']
    response = client.patch(
        f'/api/interns/tasks/{task_id}/status',
        headers=auth(seeded_database['intern_one'], 'intern'),
        json={'status': 'completed'}
    )
    assert response.status_code == 422


def test_new_provider_internship_is_immediately_visible_to_interns(seeded_database):
    response = client.post(
        '/api/internships',
        headers=auth(seeded_database['provider'], 'provider'),
        json={
            'title': 'Quantum ML Research Intern',
            'department': 'AI / ML',
            'description': 'Work on research prototypes, model evaluation, and production experiments.',
            'location': 'Remote',
            'work_mode': 'Remote',
            'duration': '3 months',
            'stipend': '$700',
            'openings': 3,
            'deadline': '2026-11-01'
        }
    )
    assert response.status_code == 201
    body = response.json()
    assert body['status'] == 'published'

    list_response = client.get('/api/internships', headers=auth(seeded_database['intern_one'], 'intern'))
    assert list_response.status_code == 200
    titles = {item['title'] for item in list_response.json()['items']}
    assert 'Quantum ML Research Intern' in titles


def test_unauthenticated_request_is_rejected():
    response = client.get('/api/interns/me/workspace')
    assert response.status_code == 401


def test_invalid_task_submission_payload_is_rejected(seeded_database):
    response = client.post(
        '/api/interns/tasks/999/submit',
        headers=auth(seeded_database['intern_one'], 'intern'),
        json={'content': 'short'}
    )
    assert response.status_code == 404 or response.status_code == 422
