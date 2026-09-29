r"""
Intern → Mentor Feedback — authorization & flow tests.

Uses a temp-file SQLite DB (set before importing app.db) and a minimal
FastAPI stub for app.main so tests don't depend on all other routers.
"""
import os
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'true'

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import init_db
from app.mentor_feedback.router import router as mentor_feedback_router

app = FastAPI()
app.include_router(mentor_feedback_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    from app.db import get_db

    with get_db() as db:
        db.execute('DELETE FROM mentor_feedback')
        db.execute('DELETE FROM mentor_assignments')
        db.execute('DELETE FROM users')

        def make_user(name, email, role):
            db.execute(
                'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
                (name, email, 'x', role),
            )
            return db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()[0]

        intern_id = make_user('Test Intern', 'ti@t.dev', 'intern')
        mentor_id = make_user('Test Mentor', 'tm@t.dev', 'mentor')
        stranger_id = make_user('Stranger Mentor', 'sm@t.dev', 'mentor')
        other_intern = make_user('Other Intern', 'oi@t.dev', 'intern')
        db.execute(
            'INSERT INTO mentor_assignments (mentor_id, intern_id, status) VALUES (?, ?, ?)',
            (mentor_id, intern_id, 'active'),
        )
        db.commit()
    yield {'intern': intern_id, 'mentor': mentor_id, 'stranger': stranger_id, 'other_intern': other_intern}


def auth(user_id, role):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_context_resolves_assigned_mentor(seeded_database):
    response = client.get('/api/mentor-feedback/context', headers=auth(seeded_database['intern'], 'intern'))
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert body['mentor']['name'] == 'Test Mentor'


def test_submit_creates_record_and_resolves_mentor_server_side(seeded_database):
    response = client.post(
        '/api/mentor-feedback',
        headers=auth(seeded_database['intern'], 'intern'),
        json={'feedback_type': 'guidance', 'rating': 5, 'message': 'Excellent technical guidance throughout the sprint cycles.'},
    )
    assert response.status_code == 201
    body = response.json()
    assert body['mentor_name'] == 'Test Mentor'
    assert body['created_at']


def test_message_too_short_rejected(seeded_database):
    response = client.post(
        '/api/mentor-feedback',
        headers=auth(seeded_database['intern'], 'intern'),
        json={'message': 'too short'},
    )
    assert response.status_code == 422


def test_mentor_sees_only_own_feedback(seeded_database):
    response = client.get('/api/mentor-feedback', headers=auth(seeded_database['mentor'], 'mentor'))
    assert response.status_code == 200
    items = response.json()['items']
    assert len(items) == 1
    assert items[0]['intern_name'] == 'Test Intern'


def test_unrelated_mentor_sees_nothing(seeded_database):
    response = client.get('/api/mentor-feedback', headers=auth(seeded_database['stranger'], 'mentor'))
    assert response.status_code == 200
    assert response.json()['items'] == []


def test_provider_cannot_submit_feedback(seeded_database):
    response = client.post(
        '/api/mentor-feedback',
        headers=auth(999, 'provider'),
        json={'message': 'Provider attempting to submit mentor feedback record.'},
    )
    assert response.status_code == 403


def test_mentor_cannot_submit_intern_feedback(seeded_database):
    response = client.post(
        '/api/mentor-feedback',
        headers=auth(seeded_database['mentor'], 'mentor'),
        json={'message': 'Mentor attempting to use the intern feedback endpoint.'},
    )
    assert response.status_code == 403


def test_intern_without_assignment_gets_clear_state(seeded_database, monkeypatch):
    # Demo seeding auto-assigns mentors; disable it to exercise the real no-mentor state.
    monkeypatch.setenv('INTERNFLOW_DEMO_DATA', 'false')
    response = client.get('/api/mentor-feedback/context', headers=auth(seeded_database['other_intern'], 'intern'))
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'no_mentor'
    assert 'assigned mentor' in body['message']


def test_no_auth_rejected(seeded_database):
    response = client.get('/api/mentor-feedback/context')
    assert response.status_code == 401
