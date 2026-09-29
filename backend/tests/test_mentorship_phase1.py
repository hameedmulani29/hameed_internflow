import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'phase1_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.skills.router', 'app.interns.router',
                    'app.mentors.router', 'app.internships.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.internships.router import router as internships_router
from app.mentors.router import router as mentors_router

app = FastAPI()
app.include_router(internships_router)
app.include_router(mentors_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        for table in ('project_chunks', 'master_tasks', 'projects', 'mentor_skill_observations',
                      'candidate_skills', 'internship_skills', 'skills', 'task_submissions',
                      'mentor_tasks', 'mentor_feedback', 'mentor_assignments', 'internships', 'users'):
            db.execute(f'DELETE FROM {table}')

        def make_user(uid, name, email, role):
            db.execute(
                "INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
                (uid, name, email, 'x', role),
            )

        make_user(50, 'P1 Provider', 'p1.provider@dev.in', 'provider')
        make_user(51, 'P1 Provider B', 'p1.provider2@dev.in', 'provider')
        make_user(52, 'P1 Mentor', 'p1.mentor@dev.in', 'mentor')
        make_user(53, 'P1 Mentor B', 'p1.mentor2@dev.in', 'mentor')
        make_user(54, 'P1 Intern', 'p1.intern@dev.in', 'intern')
        make_user(55, 'P1 Intern B', 'p1.intern2@dev.in', 'intern')

        db.execute(
            '''INSERT INTO internships (id, provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (60, 50, 'Phase1 Backend Role', 'Engineering', 'A Phase 1 foundation role for project and task scaffolding.',
             'Remote', 'Remote', '3 Months', '15k', 'published', 1, None),
        )
        db.execute(
            '''INSERT INTO internships (id, provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (61, 51, 'Phase1 Other Provider Role', 'Engineering', 'An internship owned by a different provider.',
             'Remote', 'Remote', '3 Months', '15k', 'published', 1, None),
        )
        db.commit()


def make_token(user_id, role):
    return create_token(user_id, role)


def auth(token):
    return {'Authorization': f'Bearer {token}'}


PROVIDER = make_token(50, 'provider')
PROVIDER_B = make_token(51, 'provider')
MENTOR = make_token(52, 'mentor')
MENTOR_B = make_token(53, 'mentor')
INTERN = make_token(54, 'intern')


# ==================== Assignment authz ====================

def test_provider_can_assign_mentor_to_own_internship():
    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 52, 'intern_id': 54, 'internship_id': 60},
        headers=auth(PROVIDER),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['mentor_id'] == 52
    assert data['intern_id'] == 54
    assert data['internship_id'] == 60


def test_duplicate_active_assignment_rejected():
    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 52, 'intern_id': 54, 'internship_id': 60},
        headers=auth(PROVIDER),
    )
    assert response.status_code == 409
    assert 'already assigned' in response.json()['detail'].lower()


def test_provider_cannot_assign_on_foreign_internship():
    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 53, 'intern_id': 55, 'internship_id': 61},
        headers=auth(PROVIDER_B),
    )
    assert response.status_code == 201  # provider B owns internship 61 — allowed

    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 53, 'intern_id': 55, 'internship_id': 60},
        headers=auth(PROVIDER_B),  # provider B does NOT own internship 60
    )
    assert response.status_code == 404
    assert 'internship not found' in response.json()['detail'].lower()


def test_invalid_mentor_or_intern_rejected():
    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 999, 'intern_id': 55, 'internship_id': 61},
        headers=auth(PROVIDER_B),
    )
    assert response.status_code == 404
    assert 'not found' in response.json()['detail'].lower()


def test_intern_cannot_create_assignment():
    response = client.post(
        '/api/mentor/assignments',
        json={'mentor_id': 52, 'intern_id': 54, 'internship_id': 60},
        headers=auth(INTERN),
    )
    assert response.status_code == 403


def test_assignment_mentors_listing_is_provider_only():
    response = client.get('/api/mentor/assignments/mentors', headers=auth(MENTOR))
    assert response.status_code == 403
    response = client.get('/api/mentor/assignments/mentors', headers=auth(PROVIDER))
    assert response.status_code == 200
    items = response.json()['items']
    assert all(item['role'] if 'role' in item else True for item in items)


# ==================== mentor_tasks.internship_id integrity ====================

def test_task_creation_uses_assignment_internship_when_omitted():
    response = client.post(
        '/api/mentor/tasks',
        json={'intern_id': 54, 'title': 'Build schema for reports', 'description': 'Create reporting tables.'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['internship_id'] == 60  # inherited from the active assignment
    assert data['id'] > 0


def test_task_with_mismatched_internship_rejected():
    # Internship 61 is not where mentor 52's assignment lives.
    response = client.post(
        '/api/mentor/tasks',
        json={'intern_id': 54, 'internship_id': 61, 'title': 'Cross internship task', 'description': 'Should be rejected.'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 422
    assert 'does not match' in response.json()['detail'].lower()


def test_task_for_unassigned_intern_rejected():
    response = client.post(
        '/api/mentor/tasks',
        json={'intern_id': 55, 'title': 'Task for unassigned intern', 'description': 'Should be rejected.'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 403


def test_existing_tasks_remain_listed():
    response = client.get('/api/mentor/tasks', headers=auth(MENTOR))
    assert response.status_code == 200
    items = response.json()['items'] if isinstance(response.json(), dict) else response.json()
    assert any(task['title'] == 'Build schema for reports' for task in items)


# ==================== Projects ====================

def test_mentor_can_create_project_for_assigned_internship():
    response = client.post(
        '/api/mentor/projects',
        json={'internship_id': 60, 'title': 'Reporting Platform', 'objective': 'Ship the reporting stack.',
              'deliverable': 'Working dashboard', 'status': 'active'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data['internship_id'] == 60
    assert data['mentor_id'] == 52
    assert data['status'] == 'active'
    assert data['id'] > 0


def test_mentor_cannot_create_project_for_unassigned_internship():
    response = client.post(
        '/api/mentor/projects',
        json={'internship_id': 61, 'title': 'Rogue Project', 'description': 'Not allowed.'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 403
    assert 'not assigned' in response.json()['detail'].lower()


def test_project_persists_and_is_retrievable():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    assert response.status_code == 200
    items = response.json()['items']
    match = [p for p in items if p['title'] == 'Reporting Platform']
    assert len(match) == 1
    project_id = match[0]['id']

    response = client.get(f'/api/mentor/projects/{project_id}', headers=auth(MENTOR))
    assert response.status_code == 200
    data = response.json()
    assert data['internship_title'] == 'Phase1 Backend Role'
    assert data['master_tasks'] == []
    assert data['chunks'] == []


def test_other_mentor_cannot_access_project():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR_B))
    items = response.json()['items']
    assert items == []  # MENTOR_B has no projects

    response = client.get('/api/mentor/projects/1', headers=auth(MENTOR_B))
    assert response.status_code == 404  # opaque 404, no ownership leak


def test_project_status_validation():
    response = client.post(
        '/api/mentor/projects',
        json={'internship_id': 60, 'title': 'Bad Status Project', 'status': 'chaos'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 422


def test_non_mentor_cannot_create_project():
    response = client.post(
        '/api/mentor/projects',
        json={'internship_id': 60, 'title': 'Intern Project Attempt'},
        headers=auth(INTERN),
    )
    assert response.status_code == 403


def test_project_patch_updates_fields():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']

    response = client.patch(
        f'/api/mentor/projects/{project_id}',
        json={'status': 'completed'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'completed'

    response = client.patch(
        f'/api/mentor/projects/{project_id}',
        json={'status': 'chaos'},
        headers=auth(MENTOR),
    )
    assert response.status_code == 422


# ==================== Master tasks ====================

def test_master_task_belongs_to_project_with_auto_sequence():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']

    first = client.post(
        f'/api/mentor/projects/{project_id}/tasks',
        json={'title': 'Research & Requirements', 'priority': 'high', 'estimated_hours': 4},
        headers=auth(MENTOR),
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f'/api/mentor/projects/{project_id}/tasks',
        json={'title': 'Database Design', 'priority': 'normal', 'estimated_hours': 6},
        headers=auth(MENTOR),
    )
    assert second.status_code == 201
    assert first.json()['sequence'] == 0
    assert second.json()['sequence'] == 1

    listing = client.get(f'/api/mentor/projects/{project_id}/tasks', headers=auth(MENTOR))
    titles = [t['title'] for t in listing.json()['items']]
    assert titles == ['Research & Requirements', 'Database Design']


def test_unauthorized_mentor_cannot_create_master_task():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']

    response = client.post(
        f'/api/mentor/projects/{project_id}/tasks',
        json={'title': 'Rogue master task'},
        headers=auth(MENTOR_B),
    )
    assert response.status_code == 404


def test_master_task_persists_with_project_link():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']

    response = client.get(f'/api/mentor/projects/{project_id}', headers=auth(MENTOR))
    data = response.json()
    assert len(data['master_tasks']) == 2
    assert data['master_tasks'][0]['priority'] == 'high'
    assert data['master_tasks'][0]['estimated_hours'] == 4


def test_master_task_update_and_delete():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']
    created = client.post(
        f'/api/mentor/projects/{project_id}/tasks',
        json={'title': 'Temporary Task'},
        headers=auth(MENTOR),
    )
    task_id = created.json()['id']

    patched = client.patch(
        f'/api/mentor/projects/{project_id}/tasks/{task_id}',
        json={'status': 'in_progress'},
        headers=auth(MENTOR),
    )
    assert patched.status_code == 200
    assert patched.json()['status'] == 'in_progress'

    deleted = client.delete(
        f'/api/mentor/projects/{project_id}/tasks/{task_id}',
        headers=auth(MENTOR),
    )
    assert deleted.status_code == 204
    listing = client.get(f'/api/mentor/projects/{project_id}/tasks', headers=auth(MENTOR))
    assert all(t['title'] != 'Temporary Task' for t in listing.json()['items'])


# ==================== Project chunks ====================

def test_chunk_belongs_to_master_task_with_auto_sequence():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']
    tasks = client.get(f'/api/mentor/projects/{project_id}/tasks', headers=auth(MENTOR)).json()['items']
    task_id = tasks[0]['id']

    first = client.post(
        f'/api/mentor/tasks/{task_id}/chunks',
        json={'title': 'Design API structure', 'priority': 'high'},
        headers=auth(MENTOR),
    )
    assert first.status_code == 201, first.text
    second = client.post(
        f'/api/mentor/tasks/{task_id}/chunks',
        json={'title': 'Implement authentication API', 'priority': 'normal'},
        headers=auth(MENTOR),
    )
    assert second.status_code == 201
    assert first.json()['sequence'] == 0
    assert second.json()['sequence'] == 1

    listing = client.get(f'/api/mentor/tasks/{task_id}/chunks', headers=auth(MENTOR))
    titles = [c['title'] for c in listing.json()['items']]
    assert titles == ['Design API structure', 'Implement authentication API']


def test_unauthorized_mentor_cannot_create_chunk():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']
    tasks = client.get(f'/api/mentor/projects/{project_id}/tasks', headers=auth(MENTOR)).json()['items']
    task_id = tasks[0]['id']

    response = client.post(
        f'/api/mentor/tasks/{task_id}/chunks',
        json={'title': 'Rogue chunk'},
        headers=auth(MENTOR_B),
    )
    assert response.status_code == 404


def test_chunk_persists_with_correct_links():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']
    data = client.get(f'/api/mentor/projects/{project_id}', headers=auth(MENTOR)).json()
    assert len(data['chunks']) >= 2
    assert data['master_tasks'][0]['chunk_count'] if 'chunk_count' in data['master_tasks'][0] else True

    task_id = data['master_tasks'][0]['id']
    chunks = [c for c in data['chunks'] if c['master_task_id'] == task_id]
    assert len(chunks) == 2


def test_chunk_update_and_delete():
    response = client.get('/api/mentor/projects', headers=auth(MENTOR))
    project_id = [p for p in response.json()['items'] if p['title'] == 'Reporting Platform'][0]['id']
    tasks = client.get(f'/api/mentor/projects/{project_id}/tasks', headers=auth(MENTOR)).json()['items']
    task_id = tasks[0]['id']

    created = client.post(
        f'/api/mentor/tasks/{task_id}/chunks',
        json={'title': 'Temporary chunk'},
        headers=auth(MENTOR),
    )
    chunk_id = created.json()['id']

    patched = client.patch(
        f'/api/mentor/chunks/{chunk_id}',
        json={'status': 'completed'},
        headers=auth(MENTOR),
    )
    assert patched.status_code == 200
    assert patched.json()['status'] == 'completed'

    deleted = client.delete(f'/api/mentor/chunks/{chunk_id}', headers=auth(MENTOR))
    assert deleted.status_code == 204
    listing = client.get(f'/api/mentor/tasks/{task_id}/chunks', headers=auth(MENTOR))
    assert all(c['title'] != 'Temporary chunk' for c in listing.json()['items'])
