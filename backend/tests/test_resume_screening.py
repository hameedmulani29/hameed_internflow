import os
import sys
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ['INTERNFLOW_DB_PATH'] = os.path.join(_tmpdir, 'resume_screening_test.db')
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'
for module_name in ['app.db', 'app.core.security', 'app.applications.router']:
    sys.modules.pop(module_name, None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.applications.router import router as applications_router
from app.core.security import create_token
from app.db import get_db, init_db

app = FastAPI()
app.include_router(applications_router)
client = TestClient(app)


@pytest.fixture(scope='module', autouse=True)
def seeded_database():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM application_screening_results')
        db.execute('DELETE FROM application_communications')
        db.execute('DELETE FROM applications')
        db.execute('DELETE FROM internships')
        db.execute('DELETE FROM mentor_assignments')
        db.execute('DELETE FROM users')

        provider_one_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Provider One', 'provider1@company.dev', 'x', 'provider', 'Acme Labs'),
        ).lastrowid
        provider_two_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Provider Two', 'provider2@company.dev', 'x', 'provider', 'Beta Labs'),
        ).lastrowid
        intern_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Intern One', 'intern1@dev.in', 'x', 'intern', 'InternFlow'),
        ).lastrowid
        mentor_id = db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            ('Mentor One', 'mentor1@dev.in', 'x', 'mentor', 'InternFlow'),
        ).lastrowid

        internship_id = db.execute(
            'INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status, openings, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (provider_one_id, 'AI Engineering Intern', 'AI / ML', 'Build retrieval pipelines and apply LLMs in production.', 'Remote', 'Remote', '3 months', '$600', 'published', 2, '2026-10-15'),
        ).lastrowid

        app_id = db.execute(
            'INSERT INTO applications (internship_id, applicant_id, resume_text, resume_file_name) VALUES (?, ?, ?, ?)',
            (internship_id, intern_id, 'Python backend engineer with FastAPI, SQL, React, Git, NLP, vector search, LLM APIs, and microservice deployment experience.', 'candidate_resume.pdf'),
        ).lastrowid

        db.execute(
            'INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, ?)',
            (mentor_id, intern_id, internship_id, 'active'),
        )
        db.commit()

    yield {
        'provider_one': provider_one_id,
        'provider_two': provider_two_id,
        'intern': intern_id,
        'mentor': mentor_id,
        'internship': internship_id,
        'application': app_id,
    }


def auth(user_id, role):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


def test_provider_can_screen_application_and_persist_result(monkeypatch, seeded_database):
    def fake_screening(*args, **kwargs):
        return {
            'overall_score': 92,
            'skills_match': 95,
            'experience_match': 88,
            'education_match': 90,
            'matched_skills': ['Python', 'FastAPI', 'SQL', 'LLM APIs'],
            'missing_skills': ['Docker'],
            'strengths': ['Strong backend systems exposure', 'Relevant Python experience'],
            'gaps': ['Could use more deployment tooling experience'],
            'summary': 'Strong match for the backend role.',
            'recommendation': 'Proceed to technical assessment.',
        }

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening)
    response = client.post(
        f"/api/applications/{seeded_database['application']}/screen",
        headers=auth(seeded_database['provider_one'], 'provider'),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['application_id'] == seeded_database['application']
    assert payload['overall_score'] == 92
    assert payload['status'] == 'completed'


def test_screening_is_not_available_to_unauthorized_provider(seeded_database):
    response = client.post(
        f"/api/applications/{seeded_database['application']}/screen",
        headers=auth(seeded_database['provider_two'], 'provider'),
    )
    assert response.status_code == 404


def test_invalid_resume_text_is_rejected(monkeypatch, seeded_database):
    def fake_screening(*args, **kwargs):
        raise ValueError('Resume text is required for screening.')

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening)
    with get_db() as db:
        db.execute('DELETE FROM application_screening_results WHERE application_id = ?', (seeded_database['application'],))
        db.commit()

    response = client.post(
        f"/api/applications/{seeded_database['application']}/screen",
        headers=auth(seeded_database['provider_one'], 'provider'),
    )
    assert response.status_code in {400, 422}


def test_screening_result_is_retrievable(monkeypatch, seeded_database):
    def fake_screening(*args, **kwargs):
        return {
            'overall_score': 91,
            'skills_match': 94,
            'experience_match': 86,
            'education_match': 88,
            'matched_skills': ['Python', 'FastAPI', 'SQL'],
            'missing_skills': [],
            'strengths': ['Strong backend foundation'],
            'gaps': [],
            'summary': 'Looks like a strong backend candidate.',
            'recommendation': 'Move to next round.',
        }

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening)
    client.post(
        f"/api/applications/{seeded_database['application']}/screen",
        headers=auth(seeded_database['provider_one'], 'provider'),
    )
    response = client.get(
        f"/api/applications/{seeded_database['application']}/screening",
        headers=auth(seeded_database['provider_one'], 'provider'),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['application_id'] == seeded_database['application']
    assert payload['overall_score'] >= 0


def test_screening_requires_authentication(seeded_database):
    response = client.post(f"/api/applications/{seeded_database['application']}/screen")
    assert response.status_code == 401
