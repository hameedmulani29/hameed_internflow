import pytest
from fastapi.testclient import TestClient

from app.applications.worker import process_screening_job_sync
from app.core.security import create_token
from app.db import get_db, init_db
from app.main import app

client = TestClient(app)


def auth(user_id: int, role: str):
    return {'Authorization': f'Bearer {create_token(user_id, role)}'}


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    with get_db() as db:
        db.execute('DELETE FROM application_communications')
        db.execute('DELETE FROM application_screening_results')
        db.execute('DELETE FROM applications')
        db.execute('DELETE FROM internships')
        db.execute('DELETE FROM users')

        # Insert provider 1, provider 2, intern 1
        p1_id = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role, organization) VALUES ('Provider One', 'p1@dev.in', 'hash', 'provider', 'Acme')"
        ).lastrowid

        p2_id = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role, organization) VALUES ('Provider Two', 'p2@dev.in', 'hash', 'provider', 'Beta')"
        ).lastrowid

        intern_id = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Aisha Intern', 'aisha@dev.in', 'hash', 'intern')"
        ).lastrowid

        # Insert published internship for provider 1
        internship_id = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Python AI Engineer', 'AI', 'Build LLM API tools and FastAPI microservices with vector search.', 'Remote', 'Remote', '3 Months', 'INR 25,000 / month', 'published')",
            (p1_id,),
        ).lastrowid

        db.commit()

    yield {
        'provider_one': p1_id,
        'provider_two': p2_id,
        'intern': intern_id,
        'internship': internship_id,
    }


def test_1_application_creation_and_persistence(setup_db):
    payload = {
        'internship_id': setup_db['internship'],
        'resume_text': 'Experienced Python backend developer with FastAPI, PostgreSQL, React, and LLM prompt engineering.',
        'resume_file_name': 'resume.pdf',
        'resume_mime_type': 'application/pdf',
    }
    response = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data['internship_id'] == setup_db['internship']
    assert data['status'] == 'applied'

    # Verify persisted in database
    with get_db() as db:
        app_row = db.execute('SELECT * FROM applications WHERE id = ?', (data['id'],)).fetchone()
        assert app_row is not None
        assert app_row['applicant_id'] == setup_db['intern']


def test_2_provider_visibility(setup_db):
    # Submit application
    payload = {
        'internship_id': setup_db['internship'],
        'resume_text': 'Python developer with FastAPI experience.',
    }
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    assert app_res.status_code == 201

    # Provider 1 lists applications
    list_res = client.get('/api/applications', headers=auth(setup_db['provider_one'], 'provider'))
    assert list_res.status_code == 200
    items = list_res.json()['items']
    assert len(items) == 1
    assert items[0]['applicant_name'] == 'Aisha Intern'
    assert items[0]['internship_title'] == 'Python AI Engineer'


def test_3_unauthorized_provider(setup_db):
    # Submit application for Provider One's internship
    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer'}
    client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)

    # Provider Two tries to list applications
    list_res = client.get('/api/applications', headers=auth(setup_db['provider_two'], 'provider'))
    assert list_res.status_code == 200
    assert len(list_res.json()['items']) == 0


def test_4_screening_job_creation(setup_db):
    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python AI engineer resume with vector DBs.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    # Verify screening job exists in DB with status = 'pending', 'queued', 'processing', 'completed', or 'failed'
    with get_db() as db:
        job = db.execute('SELECT * FROM application_screening_results WHERE application_id = ?', (app_id,)).fetchone()
        assert job is not None
        assert job['status'] in {'pending', 'queued', 'processing', 'completed', 'failed'}


def test_5_failed_application_creation(setup_db):
    # Try creating application for non-existent internship
    payload = {'internship_id': 99999, 'resume_text': 'Fake resume'}
    response = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    assert response.status_code == 404

    # Verify no orphan screening jobs in database
    with get_db() as db:
        jobs = db.execute('SELECT * FROM application_screening_results WHERE internship_id = 99999').fetchall()
        assert len(jobs) == 0


def test_6_and_7_worker_picks_queued_job_and_gemini_success(monkeypatch, setup_db):
    def fake_screening(*args, **kwargs):
        return {
            'overall_score': 94,
            'skills_match': 96,
            'experience_match': 90,
            'education_match': 92,
            'matched_skills': ['Python', 'FastAPI', 'React', 'LLMs'],
            'missing_skills': ['Docker'],
            'strengths': ['Strong Python systems background', 'FastAPI experience'],
            'gaps': ['Needs more containerization practice'],
            'summary': 'Excellent candidate fit for the Python AI Engineer role.',
            'recommendation': 'Proceed to technical assessment.',
        }

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening)

    # Submit application
    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python engineer with 2 years FastAPI experience.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    # Run worker on application
    res = process_screening_job_sync(app_id)
    assert res['status'] == 'completed'
    assert res['overall_score'] == 94


def test_8_gemini_failure_handling(monkeypatch, setup_db):
    def fake_screening_fail(*args, **kwargs):
        raise RuntimeError('Gemini service rate limit exceeded.')

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening_fail)

    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer resume text.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    res = process_screening_job_sync(app_id)
    assert res['status'] == 'failed'
    assert 'rate limit' in res['summary']

    # Verify application remains intact in database
    with get_db() as db:
        app_row = db.execute('SELECT * FROM applications WHERE id = ?', (app_id,)).fetchone()
        assert app_row is not None


def test_9_invalid_gemini_response_handling(monkeypatch, setup_db):
    def fake_screening_invalid(*args, **kwargs):
        raise ValueError('Gemini returned malformed screening JSON.')

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening_invalid)

    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer resume text.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    res = process_screening_job_sync(app_id)
    assert res['status'] == 'failed'
    assert 'malformed' in res['summary']


def test_10_missing_resume_handling(setup_db):
    # Application with empty resume text
    payload = {'internship_id': setup_db['internship'], 'resume_text': ''}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    res = process_screening_job_sync(app_id)
    assert res['status'] == 'failed'
    assert 'missing' in res['summary'].lower()


def test_11_idempotency(monkeypatch, setup_db):
    call_count = 0

    def fake_screening(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return {
            'overall_score': 88,
            'skills_match': 90,
            'experience_match': 85,
            'education_match': 85,
            'matched_skills': ['Python'],
            'missing_skills': [],
            'strengths': ['Good foundation'],
            'gaps': [],
            'summary': 'Good candidate.',
            'recommendation': 'Proceed',
        }

    monkeypatch.setattr('app.applications.worker.run_resume_screening', fake_screening)

    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer resume text.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    res1 = process_screening_job_sync(app_id)
    assert res1['status'] == 'completed'
    assert call_count == 1

    # Run second time
    res2 = process_screening_job_sync(app_id)
    assert res2['status'] == 'completed'
    assert call_count == 1  # Not executed again!


def test_12_provider_authorization_for_screening_result(setup_db):
    # Application created for Provider One's internship
    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer resume.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    app_id = app_res.json()['id']

    # Provider One can fetch screening result
    p1_res = client.get(f'/api/applications/{app_id}/screening', headers=auth(setup_db['provider_one'], 'provider'))
    assert p1_res.status_code == 200

    # Provider Two is blocked
    p2_res = client.get(f'/api/applications/{app_id}/screening', headers=auth(setup_db['provider_two'], 'provider'))
    assert p2_res.status_code == 404


def test_13_application_remains_visible_before_screening_completes(setup_db):
    payload = {'internship_id': setup_db['internship'], 'resume_text': 'Python developer resume.'}
    app_res = client.post('/api/applications', headers=auth(setup_db['intern'], 'intern'), json=payload)
    assert app_res.status_code == 201

    # Immediately check provider applications listing before worker finishes
    list_res = client.get('/api/applications', headers=auth(setup_db['provider_one'], 'provider'))
    assert list_res.status_code == 200
    items = list_res.json()['items']
    assert len(items) == 1
    assert items[0]['status'] == 'applied'
    assert items[0]['screening_status'] in {'pending', 'queued', 'processing', 'completed', 'failed'}
