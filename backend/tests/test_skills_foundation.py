import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'skills_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.skills.router', 'app.interns.router', 'app.mentors.router', 'app.internships.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.internships.router import router as internships_router
from app.interns.router import router as interns_router
from app.mentors.router import router as mentors_router
from app.skills.router import router as skills_router

app = FastAPI()
app.include_router(skills_router)
app.include_router(internships_router)
app.include_router(interns_router)
app.include_router(mentors_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        for table in ('mentor_skill_observations', 'candidate_skills', 'internship_skills', 'skills',
                      'task_submissions', 'mentor_tasks', 'mentor_feedback', 'mentor_assignments',
                      'internships', 'users'):
            db.execute(f'DELETE FROM {table}')

        def make_user(uid, name, email, role):
            db.execute(
                "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
                (uid, name, email, 'x', role),
            )

        make_user(20, 'Skills Provider', 'sk.provider@dev.in', 'provider')
        make_user(21, 'Skills Mentor', 'sk.mentor@dev.in', 'mentor')
        make_user(22, 'Skills Intern', 'sk.intern@dev.in', 'intern')
        make_user(23, 'Other Mentor', 'sk.mentor2@dev.in', 'mentor')

        db.execute(
            '''INSERT INTO internships (id, provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (30, 20, 'Backend Skills Role', 'Engineering', 'A role about building APIs and data layers for skills tracking.',
             'Remote', 'Remote', '3 Months', '15k', 'published', 1, None),
        )
        db.execute(
            "INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')",
            (21, 22, 30),
        )
        db.commit()
    yield


def _auth(role, uid):
    return {'Authorization': f'Bearer {create_token(uid, role)}'}


CREATED_INTERNSHIP_ID = None


def test_skill_catalog_normalizes_and_dedupes():
    global CREATED_INTERNSHIP_ID
    res = client.post('/api/internships', headers=_auth('provider', 20), json={
        'title': 'Python API Builder Role',
        'department': 'Engineering',
        'description': 'Build REST APIs with FastAPI and SQL databases for production usage.',
        'location': 'Remote',
        'work_mode': 'Remote',
        'duration': '3 Months',
        'stipend': '12k',
        'skills': ['Python', 'python ', 'Python 3', 'FastAPI', 'SQL'],
    })
    assert res.status_code == 201, res.text
    created = res.json()
    CREATED_INTERNSHIP_ID = created['id']

    # 'Python', 'python ' and 'Python 3' normalize to one 'python' skill.
    assert created['skills'] == ['fastapi', 'python', 'sql']

    catalog = client.get('/api/skills').json()['items']
    names = [s['name'] for s in catalog]
    assert names.count('python') == 1
    assert 'fastapi' in names and 'sql' in names


def test_internship_list_includes_required_skills():
    items = client.get('/api/internships').json()['items']
    target = next(i for i in items if i['id'] == CREATED_INTERNSHIP_ID)
    assert set(target['skills']) == {'fastapi', 'python', 'sql'}


def test_candidate_skill_crud_round_trip():
    res = client.put('/api/interns/me/skills', headers=_auth('intern', 22),
                     json={'skills': ['Python', 'Docker', 'Python']})
    assert res.status_code == 200
    names = [s['name'] for s in res.json()['items']]
    assert names == ['docker', 'python']  # deduped, sorted

    # Replace the whole set
    res = client.put('/api/interns/me/skills', headers=_auth('intern', 22),
                     json={'skills': ['Python', 'FastAPI']})
    names = [s['name'] for s in res.json()['items']]
    assert names == ['fastapi', 'python']
    sources = {s['name']: s['source'] for s in res.json()['items']}
    assert sources['python'] == 'candidate_profile'


def test_candidate_skills_require_auth_and_role():
    assert client.put('/api/interns/me/skills', json={'skills': ['X']}).status_code == 401
    assert client.put('/api/interns/me/skills', headers=_auth('mentor', 21), json={'skills': ['X']}).status_code == 403


def test_skill_match_for_intern():
    res = client.get(f'/api/skills/match/{CREATED_INTERNSHIP_ID}', headers=_auth('intern', 22))
    assert res.status_code == 200
    payload = res.json()
    # Intern declared python + fastapi; internship requires fastapi, python, sql
    matched = {s['name'] for s in payload['matched_skills']}
    gaps = {s['name'] for s in payload['potential_gaps']}
    assert matched == {'fastapi', 'python'}
    assert gaps == {'sql'}
    assert payload['internship']['title'] == 'Python API Builder Role'


def test_mentor_observation_round_trip_and_authorization():
    # Assigned mentor records an observation
    res = client.post('/api/mentor/interns/22/observations', headers=_auth('mentor', 21), json={
        'intern_id': 22,
        'skill': 'Python',
        'level': 'proficient',
        'note': 'Implemented the skills API endpoints cleanly with tests.',
    })
    assert res.status_code == 201, res.text
    observation = res.json()
    assert observation['skill_name'] == 'python'
    assert observation['level'] == 'proficient'

    # Observation becomes mentor-sourced candidate skill evidence
    skills = client.get('/api/interns/me/skills', headers=_auth('intern', 22)).json()['items']
    python = next(s for s in skills if s['name'] == 'python')
    assert python['source'] == 'mentor_observation'

    # Profile edit preserves mentor-sourced evidence
    res = client.put('/api/interns/me/skills', headers=_auth('intern', 22), json={'skills': ['Python']})
    sources = {s['name']: s['source'] for s in res.json()['items']}
    assert sources['python'] == 'mentor_observation'

    # A different mentor cannot observe this intern
    assert client.post('/api/mentor/interns/22/observations', headers=_auth('mentor', 23), json={
        'intern_id': 22, 'skill': 'SQL', 'level': 'emerging',
    }).status_code == 403

    # Provider cannot create observations
    assert client.post('/api/mentor/interns/22/observations', headers=_auth('provider', 20), json={
        'intern_id': 22, 'skill': 'SQL', 'level': 'emerging',
    }).status_code == 403

    # Invalid level is rejected
    assert client.post('/api/mentor/interns/22/observations', headers=_auth('mentor', 21), json={
        'intern_id': 22, 'skill': 'SQL', 'level': 'genius',
    }).status_code == 422


def test_mentor_intern_detail_aggregates_workflow():
    res = client.get('/api/mentor/interns/22/detail', headers=_auth('mentor', 21))
    assert res.status_code == 200
    payload = res.json()
    assert payload['intern']['full_name'] == 'Skills Intern'
    assert payload['assignment']['internship_title'] == 'Backend Skills Role'
    assert isinstance(payload['tasks'], list)
    assert isinstance(payload['submissions'], list)
    assert isinstance(payload['feedback'], list)
    assert any(s['name'] == 'python' for s in payload['skills'])
    assert any(o['skill_name'] == 'python' for o in payload['observations'])

    # Unassigned mentor denied
    assert client.get('/api/mentor/interns/22/detail', headers=_auth('mentor', 23)).status_code == 403


def test_normalize_skill_name_directly():
    from app.skills.router import normalize_skill_name
    assert normalize_skill_name('  Python ') == 'python'
    assert normalize_skill_name('PYTHON') == 'python'
    assert normalize_skill_name('Python   3') == 'python'  # version suffix collapses
    assert normalize_skill_name('SQL Server') == 'sql server'  # words are not versions
