import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'mine_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.applications.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.applications.router import router as applications_router

app = FastAPI()
app.include_router(applications_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute("DELETE FROM applications")
        db.execute("DELETE FROM internships")
        db.execute("DELETE FROM users")
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?, ?)",
            (101, 'Mine Provider', 'mine.provider@dev.in', 'x', 'provider', 'Mine Org'),
        )
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?, ?)",
            (102, 'Mine Intern', 'mine.intern@dev.in', 'x', 'intern', None),
        )
        db.execute(
            "INSERT INTO users (id, full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?, ?)",
            (103, 'Other Intern', 'mine.other@dev.in', 'x', 'intern', None),
        )
        db.execute(
            '''INSERT INTO internships (id, provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (201, 101, 'Mine Role', 'Engineering', 'Test role', 'Remote', 'remote', '3 Months', '10k', 'published', 1, None),
        )
        db.execute(
            "INSERT INTO applications (id, internship_id, applicant_id, status) VALUES (?, ?, ?, 'applied')",
            (301, 201, 102),
        )
        db.execute(
            "INSERT INTO application_screening_results (application_id, internship_id, applicant_id, status, model_used, created_at, updated_at) VALUES (?, ?, ?, 'pending', 'gemini-2.0-flash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            (301, 201, 102),
        )
        db.commit()
    yield
    db.close()


def _auth_header(role, user_id):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_mine_requires_auth():
    assert client.get('/api/applications/mine').status_code == 401


def test_mine_rejects_provider_and_mentor():
    assert client.get('/api/applications/mine', headers=_auth_header('provider', 101)).status_code == 403
    assert client.get('/api/applications/mine', headers=_auth_header('mentor', 101)).status_code == 403


def test_mine_lists_only_own_applications():
    with get_db() as db:
        db.execute(
            "INSERT INTO applications (id, internship_id, applicant_id, status) VALUES (?, ?, ?, 'screening')",
            (302, 201, 103),
        )
        db.commit()

    res = client.get('/api/applications/mine', headers=_auth_header('intern', 102))
    assert res.status_code == 200
    items = res.json()['items']
    assert [item['id'] for item in items] == [301]
    item = items[0]
    assert item['status'] == 'applied'
    assert item['internship']['title'] == 'Mine Role'
    assert item['internship']['provider_name'] == 'Mine Provider'
    assert item['screening']['status'] == 'pending'
    assert item['screening']['overall_score'] is None


def test_mine_detail_scoped_to_owner():
    assert client.get('/api/applications/mine/301', headers=_auth_header('intern', 102)).status_code == 200
    assert client.get('/api/applications/mine/301', headers=_auth_header('intern', 103)).status_code == 404
    assert client.get('/api/applications/mine/999', headers=_auth_header('intern', 102)).status_code == 404


def test_mine_detail_includes_screening_evidence():
    with get_db() as db:
        db.execute(
            '''UPDATE application_screening_results
               SET status = 'completed', overall_score = 88, matched_skills = ?, missing_skills = ?,
                   strengths = ?, gaps = ?, summary = ?, recommendation = ?
               WHERE application_id = 301''',
            ('["Python", "React"]', '["Docker"]', '["Strong fundamentals"]', '["Needs DevOps"]', 'Solid profile.', 'shortlist'),
        )
        db.commit()

    res = client.get('/api/applications/mine/301', headers=_auth_header('intern', 102))
    assert res.status_code == 200
    payload = res.json()
    assert payload['screening']['overall_score'] == 88
    assert payload['screening']['matched_skills'] == ['Python', 'React']
    assert payload['screening']['missing_skills'] == ['Docker']
    assert payload['screening']['recommendation'] == 'shortlist'
