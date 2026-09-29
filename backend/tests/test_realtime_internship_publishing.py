import pytest
from fastapi.testclient import TestClient

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

        # Insert test users
        cursor = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role, organization) VALUES ('Provider User', 'provider@dev.in', 'hash', 'provider', 'Acme Corp')"
        )
        provider_id = cursor.lastrowid

        cursor = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern One', 'intern1@dev.in', 'hash', 'intern')"
        )
        intern_one_id = cursor.lastrowid

        cursor = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Two', 'intern2@dev.in', 'hash', 'intern')"
        )
        intern_two_id = cursor.lastrowid

        db.commit()

    yield {
        'provider': provider_id,
        'intern_one': intern_one_id,
        'intern_two': intern_two_id,
    }


def test_provider_creates_published_internship_success(setup_db):
    payload = {
        'title': 'Frontend Developer Intern',
        'department': 'Engineering',
        'description': 'Work on sleek React components.',
        'location': 'Bengaluru, India',
        'work_mode': 'Hybrid',
        'duration': '3 Months',
        'stipend': 'INR 25,000 / month',
        'openings': 3,
        'deadline': '2026-11-30',
        'skills': ['React', 'TypeScript', 'CSS'],
    }
    response = client.post('/api/internships', headers=auth(setup_db['provider'], 'provider'), json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data['title'] == payload['title']
    assert data['status'] == 'published'
    assert data['company'] == 'Acme Corp'
    assert 'created_at' in data
    assert any(s.lower() == 'react' for s in data['skills'])


def test_realtime_event_generated_on_internship_creation(setup_db):
    token = create_token(setup_db['intern_one'], 'intern')
    with client.websocket_connect(f'/api/internships/ws?token={token}') as websocket:
        payload = {
            'title': 'Realtime AI Engineer',
            'department': 'Artificial Intelligence',
            'description': 'Build real-time streaming LLM pipelines.',
            'location': 'Remote',
            'work_mode': 'Remote',
            'duration': '6 Months',
            'stipend': 'INR 30,000 / month',
            'openings': 2,
            'deadline': '2026-12-01',
            'skills': ['Python', 'FastAPI'],
        }
        res = client.post('/api/internships', headers=auth(setup_db['provider'], 'provider'), json=payload)
        assert res.status_code == 201

        ws_msg = websocket.receive_json()
        assert ws_msg['type'] == 'internship_published'
        assert ws_msg['internship']['title'] == payload['title']
        assert ws_msg['internship']['status'] == 'published'
        assert ws_msg['internship']['company'] == 'Acme Corp'
        assert 'created_at' in ws_msg['internship']
        assert any(s.lower() == 'python' for s in ws_msg['internship']['skills'])


def test_draft_internship_status_change_triggers_event_only_when_published(setup_db):
    # First create an internship in DB directly with status 'draft'
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Draft Intern', 'Research', 'Draft description long enough', 'Remote', 'Remote', '2 Months', '10000', 'draft')",
            (setup_db['provider'],),
        )
        db.commit()
        internship_id = cursor.lastrowid

    token = create_token(setup_db['intern_one'], 'intern')
    with client.websocket_connect(f'/api/internships/ws?token={token}') as websocket:
        # Updating to draft should not trigger event
        patch_res = client.patch(f'/api/internships/{internship_id}/status?status=draft', headers=auth(setup_db['provider'], 'provider'))
        assert patch_res.status_code == 200

        # Now update to published
        pub_res = client.patch(f'/api/internships/{internship_id}/status?status=published', headers=auth(setup_db['provider'], 'provider'))
        assert pub_res.status_code == 200

        ws_msg = websocket.receive_json()
        assert ws_msg['type'] == 'internship_published'
        assert ws_msg['internship']['id'] == internship_id
        assert ws_msg['internship']['status'] == 'published'


def test_multiple_connected_clients_receive_broadcast(setup_db):
    token1 = create_token(setup_db['intern_one'], 'intern')
    token2 = create_token(setup_db['intern_two'], 'intern')

    with client.websocket_connect(f'/api/internships/ws?token={token1}') as ws1:
        with client.websocket_connect(f'/api/internships/ws?token={token2}') as ws2:
            payload = {
                'title': 'Data Analyst Intern',
                'department': 'Analytics',
                'description': 'Analyze application metrics and telemetry.',
                'location': 'Mumbai, India',
                'work_mode': 'On-site',
                'duration': '4 Months',
                'stipend': 'INR 18,000 / month',
                'openings': 1,
            }
            res = client.post('/api/internships', headers=auth(setup_db['provider'], 'provider'), json=payload)
            assert res.status_code == 201

            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()

            assert msg1['type'] == 'internship_published'
            assert msg2['type'] == 'internship_published'
            assert msg1['internship']['title'] == payload['title']
            assert msg2['internship']['title'] == payload['title']


def test_unauthorized_user_cannot_create_internship(setup_db):
    payload = {
        'title': 'Hacker Intern',
        'department': 'Security',
        'description': 'Unauthorized attempt.',
        'location': 'Unknown',
        'work_mode': 'Remote',
        'duration': '1 Month',
        'stipend': '0',
    }
    response = client.post('/api/internships', headers=auth(setup_db['intern_one'], 'intern'), json=payload)
    assert response.status_code == 403
