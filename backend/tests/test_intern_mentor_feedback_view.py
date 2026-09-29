import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'intern_feedback_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.interns.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.interns.router import router as intern_router

app = FastAPI()
app.include_router(intern_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM mentor_feedback')
        db.execute('DELETE FROM users')

        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'mentor')",
            (10, 'Feedback Mentor', 'fb.mentor@dev.in', 'x'),
        )
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'intern')",
            (11, 'Feedback Intern', 'fb.intern@dev.in', 'x'),
        )
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'intern')",
            (12, 'Other Intern', 'fb.other@dev.in', 'x'),
        )
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'provider')",
            (13, 'FB Provider', 'fb.provider@dev.in', 'x'),
        )
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, task_id, feedback, strengths, improvements, next_steps) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (10, 11, None, 'Strong work on the smoke suite.', 'Careful edge-case handling', 'Add async tests', 'Own the next release'),
        )
        db.commit()
    yield


def _auth(role, user_id):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_feedback_requires_auth():
    assert client.get('/api/interns/me/feedback').status_code == 401


def test_feedback_rejects_non_intern_roles():
    assert client.get('/api/interns/me/feedback', headers=_auth('provider', 13)).status_code == 403
    assert client.get('/api/interns/me/feedback', headers=_auth('mentor', 10)).status_code == 403


def test_feedback_returns_only_own_rows():
    with get_db() as db:
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback) VALUES (?, ?, ?)",
            (10, 12, 'Feedback for a different intern.'),
        )
        db.commit()

    res = client.get('/api/interns/me/feedback', headers=_auth('intern', 11))
    assert res.status_code == 200
    items = res.json()['items']
    assert len(items) == 1
    item = items[0]
    assert item['feedback'] == 'Strong work on the smoke suite.'
    assert item['mentor_name'] == 'Feedback Mentor'
    assert item['task_title'] is None
    assert item['strengths'] == 'Careful edge-case handling'


def test_feedback_empty_state_shape():
    # Intern 12 already has one row; a fresh intern sees an empty list, not an error.
    with get_db() as db:
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'intern')",
            (14, 'No Feedback Intern', 'fb.none@dev.in', 'x'),
        )
        db.commit()

    res = client.get('/api/interns/me/feedback', headers=_auth('intern', 14))
    assert res.status_code == 200
    assert res.json() == {'items': []}


def test_unread_count_and_unread_list():
    with get_db() as db:
        # Insert historical feedback (is_read = 1) and brand new feedback (is_read = 0)
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, ?, 1)",
            (10, 11, 'Old historical feedback',),
        )
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, ?, 0)",
            (10, 11, 'New unread feedback 1',),
        )
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, ?, 0)",
            (10, 11, 'New unread feedback 2',),
        )
        db.commit()

    # Unread count endpoint check
    res_count = client.get('/api/interns/feedback/unread-count', headers=_auth('intern', 11))
    assert res_count.status_code == 200
    assert res_count.json()['unread_count'] >= 2

    # Unread list endpoint check
    res_unread = client.get('/api/interns/feedback/unread', headers=_auth('intern', 11))
    assert res_unread.status_code == 200
    items = res_unread.json()['items']
    assert all(item['is_read'] is False for item in items)
    fb_ids = [item['id'] for item in items]

    # Test mark as read
    target_id = fb_ids[0]
    res_mark = client.patch(f'/api/interns/feedback/{target_id}/read', headers=_auth('intern', 11))
    assert res_mark.status_code == 200
    assert res_mark.json()['is_read'] is True
    assert res_mark.json()['read_at'] is not None

    # Verify unread count decreased by 1
    res_count_after = client.get('/api/interns/feedback/unread-count', headers=_auth('intern', 11))
    assert res_count_after.json()['unread_count'] == res_count.json()['unread_count'] - 1


def test_mark_as_read_idempotence():
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, ?, 0)",
            (10, 11, 'Idempotency test feedback',),
        )
        fb_id = cursor.lastrowid
        db.commit()

    # Mark as read once
    res1 = client.patch(f'/api/interns/feedback/{fb_id}/read', headers=_auth('intern', 11))
    assert res1.status_code == 200
    assert res1.json()['is_read'] is True

    # Mark as read second time (idempotent)
    res2 = client.patch(f'/api/interns/feedback/{fb_id}/read', headers=_auth('intern', 11))
    assert res2.status_code == 200
    assert res2.json()['is_read'] is True


def test_cannot_mark_other_intern_feedback_as_read():
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, ?, 0)",
            (10, 12, 'Feedback for intern 12',),
        )
        fb_id = cursor.lastrowid
        db.commit()

    # Intern 11 tries to mark Intern 12's feedback as read
    res = client.patch(f'/api/interns/feedback/{fb_id}/read', headers=_auth('intern', 11))
    assert res.status_code == 404

