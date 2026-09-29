import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'attendance_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.attendance.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.attendance.router import router as attendance_router

app = FastAPI()
app.include_router(attendance_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM attendance')
        db.execute('DELETE FROM users')

        db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Intern Alpha', 'alpha@dev.in', 'x', 'intern', 'InternFlow'),
        )
        db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Mentor Beta', 'mentor@dev.in', 'x', 'mentor', 'InternFlow'),
        )
        db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Provider Gamma', 'provider@company.dev', 'x', 'provider', 'Acme'),
        )
        db.commit()
    yield


def auth(user_id, role):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def _get_user(email):
    with get_db() as db:
        row = db.execute('SELECT id, role FROM users WHERE email = ?', (email,)).fetchone()
    return row


def test_check_in_requires_intern_role():
    intern = _get_user('alpha@dev.in')['id']
    response = client.post('/api/attendance/check-in', headers=auth(intern, 'intern'), json={'notes': 'Started working on tasks.'})
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'checked_in'


def test_duplicate_check_in_is_rejected():
    intern = _get_user('alpha@dev.in')['id']
    response = client.post('/api/attendance/check-in', headers=auth(intern, 'intern'), json={'notes': 'Another check in attempt.'})
    assert response.status_code == 409


def test_provider_cannot_check_in():
    provider = _get_user('provider@company.dev')['id']
    response = client.post('/api/attendance/check-in', headers=auth(provider, 'provider'), json={})
    assert response.status_code == 403


def test_check_out_updates_work_minutes():
    intern = _get_user('alpha@dev.in')['id']
    response = client.post('/api/attendance/check-out', headers=auth(intern, 'intern'), json={'notes': 'Wrapped up for the day.'})
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'checked_out'
    assert payload['work_minutes'] >= 0


def test_today_and_logs_are_accessible_to_the_intern():
    intern = _get_user('alpha@dev.in')['id']
    today = client.get('/api/attendance/today', headers=auth(intern, 'intern'))
    logs = client.get('/api/attendance/logs', headers=auth(intern, 'intern'))
    assert today.status_code == 200
    assert logs.status_code == 200
    assert isinstance(today.json()['items'], list)
    assert isinstance(logs.json()['items'], list)


def test_unauthenticated_user_is_rejected():
    response = client.get('/api/attendance/today')
    assert response.status_code == 401
