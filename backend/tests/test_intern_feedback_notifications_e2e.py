import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'intern_feedback_e2e.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'

for module_name in ['app.db', 'app.core.security', 'app.interns.router', 'app.mentors.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.interns.router import router as intern_router
from app.mentors.router import router as mentor_router

app = FastAPI()
app.include_router(mentor_router)
app.include_router(intern_router)
client = TestClient(app)


def _auth(role, user_id):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


@pytest.fixture(scope='module', autouse=True)
def setup_db():
    init_db()
    with get_db() as db:
        db.execute("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (101, 'Mentor Alice', 'alice@dev.in', 'x', 'mentor')")
        db.execute("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (102, 'Intern Bob', 'bob@dev.in', 'x', 'intern')")
        db.execute("INSERT INTO users (id, full_name, email, password_hash, role) VALUES (103, 'Intern Charlie', 'charlie@dev.in', 'x', 'intern')")
        db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id) VALUES (101, 102)")
        db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id) VALUES (101, 103)")
        db.commit()
    yield


def test_full_mentor_to_intern_feedback_flow():
    # 1. Mentor Alice submits feedback for Intern Bob
    fb_res = client.post(
        '/api/mentor/feedback',
        headers=_auth('mentor', 101),
        json={
            'intern_id': 102,
            'feedback': 'Great job refactoring the API endpoints.',
            'strengths': 'Clean code and thorough test coverage',
            'improvements': 'Focus on optimizing SQL query latency',
            'next_steps': 'Implement caching layer for hot endpoints',
        }
    )
    assert fb_res.status_code == 201
    fb_data = fb_res.json()
    fb_id = fb_data['id']
    assert fb_data['is_read'] == 0 or fb_data['is_read'] is False

    # 2. Intern Bob checks unread count -> 1
    count_res = client.get('/api/interns/feedback/unread-count', headers=_auth('intern', 102))
    assert count_res.status_code == 200
    assert count_res.json()['unread_count'] == 1

    # 3. Intern Bob retrieves unread list -> contains feedback
    unread_res = client.get('/api/interns/feedback/unread', headers=_auth('intern', 102))
    assert unread_res.status_code == 200
    items = unread_res.json()['items']
    assert len(items) == 1
    assert items[0]['id'] == fb_id
    assert items[0]['feedback'] == 'Great job refactoring the API endpoints.'
    assert items[0]['message'] == 'Great job refactoring the API endpoints.'
    assert items[0]['strengths'] == 'Clean code and thorough test coverage'
    assert items[0]['improvements'] == 'Focus on optimizing SQL query latency'
    assert items[0]['areas_for_improvement'] == 'Focus on optimizing SQL query latency'
    assert items[0]['next_steps'] == 'Implement caching layer for hot endpoints'
    assert items[0]['mentor_name'] == 'Mentor Alice'
    assert items[0]['mentor'] == 'Mentor Alice'
    assert items[0]['is_read'] is False

    # 4. Intern Charlie (different intern) checks unread count -> 0
    charlie_count = client.get('/api/interns/feedback/unread-count', headers=_auth('intern', 103))
    assert charlie_count.status_code == 200
    assert charlie_count.json()['unread_count'] == 0

    # 5. Intern Charlie attempts to mark Bob's feedback as read -> 404
    charlie_read = client.patch(f'/api/interns/feedback/{fb_id}/read', headers=_auth('intern', 103))
    assert charlie_read.status_code == 404

    # 6. Intern Bob marks feedback as read -> 200 (is_read: true)
    read_res = client.patch(f'/api/interns/feedback/{fb_id}/read', headers=_auth('intern', 102))
    assert read_res.status_code == 200
    assert read_res.json()['is_read'] is True
    assert read_res.json()['read_at'] is not None

    # 7. Intern Bob checks unread count -> 0
    count_after = client.get('/api/interns/feedback/unread-count', headers=_auth('intern', 102))
    assert count_after.json()['unread_count'] == 0

    # 8. Feedback remains accessible in Bob's all feedback history
    history_res = client.get('/api/interns/me/feedback', headers=_auth('intern', 102))
    assert history_res.status_code == 200
    history_items = history_res.json()['items']
    assert len(history_items) == 1
    assert history_items[0]['id'] == fb_id
    assert history_items[0]['is_read'] is True
