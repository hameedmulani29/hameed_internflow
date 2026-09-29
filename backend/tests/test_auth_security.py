import os
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def _reset_db(tmp_path, monkeypatch):
    db_path = tmp_path / 'auth_security.db'
    monkeypatch.setenv('INTERNFLOW_DB_PATH', str(db_path))
    monkeypatch.setenv('INTERNFLOW_DEMO_DATA', 'false')
    monkeypatch.setenv('PROVIDER_ALLOWED_EMAIL_DOMAINS', 'gmail.com,co.in')
    monkeypatch.setenv('MENTOR_ALLOWED_EMAIL_DOMAINS', 'gmail.com,dev.in')
    return db_path


def test_demo_provider_gmail_account_can_create_published_internship(monkeypatch, tmp_path):
    _reset_db(tmp_path, monkeypatch)
    client = TestClient(app)

    register = client.post('/api/auth/register', json={
        'role': 'provider',
        'full_name': 'Demo Provider',
        'email': 'demo.provider@gmail.com',
        'password': 'DemoPass123',
        'organization': 'Demo Org',
    })
    assert register.status_code == 200, register.text

    login = client.post('/api/auth/login', json={
        'email': 'demo.provider@gmail.com',
        'password': 'DemoPass123',
    })
    assert login.status_code == 200, login.text
    token = login.json()['token']
    headers = {'Authorization': f'Bearer {token}'}

    internship = client.post('/api/internships', json={
        'title': 'AI Intern',
        'department': 'Engineering',
        'description': 'Build AI assistant features for the product team.',
        'location': 'Remote',
        'work_mode': 'Remote',
        'duration': '3 months',
        'stipend': 'INR 20000',
        'openings': 2,
        'skills': ['Python', 'FastAPI'],
    }, headers=headers)
    assert internship.status_code == 201, internship.text
    assert internship.json()['status'] == 'published'


def test_unapproved_or_suspended_provider_is_denied_privileged_access(monkeypatch, tmp_path):
    _reset_db(tmp_path, monkeypatch)
    client = TestClient(app)

    provider = client.post('/api/auth/register', json={
        'role': 'provider',
        'full_name': 'Restricted Provider',
        'email': 'restricted.provider@gmail.com',
        'password': 'DemoPass123',
        'organization': 'Restricted Org',
    })
    assert provider.status_code == 200, provider.text

    from app.db import get_db
    with get_db() as db:
        db.execute('UPDATE users SET is_approved = 0, is_active = 0 WHERE email = ?', ('restricted.provider@gmail.com',))
        db.commit()

    login = client.post('/api/auth/login', json={
        'email': 'restricted.provider@gmail.com',
        'password': 'DemoPass123',
    })
    assert login.status_code == 403, login.text


def test_non_provider_cannot_publish_internship(monkeypatch, tmp_path):
    _reset_db(tmp_path, monkeypatch)
    client = TestClient(app)

    intern = client.post('/api/auth/register', json={
        'role': 'intern',
        'full_name': 'Candidate Person',
        'email': 'candidate.person@gmail.com',
        'password': 'DemoPass123',
    })
    assert intern.status_code == 200, intern.text

    token = client.post('/api/auth/login', json={
        'email': 'candidate.person@gmail.com',
        'password': 'DemoPass123',
    }).json()['token']

    response = client.post('/api/internships', json={
        'title': 'Secret Internship',
        'department': 'Engineering',
        'description': 'This should be denied to a non-provider.',
        'location': 'Remote',
        'work_mode': 'Remote',
        'duration': '2 months',
        'stipend': 'INR 15000',
        'openings': 1,
        'skills': ['Python'],
    }, headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 403
