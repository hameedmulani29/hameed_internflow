import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_provider_record_decision():
    with get_db() as db:
        p_row = db.execute("SELECT id FROM users WHERE role = 'provider' LIMIT 1").fetchone()
        i_row = db.execute("SELECT id FROM users WHERE role = 'intern' LIMIT 1").fetchone()

        if not p_row or not i_row:
            db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Prov', 'p@c.in', 'hash', 'provider')")
            p_id = db.execute("SELECT id FROM users WHERE email='p@c.in'").fetchone()[0]
            db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Int', 'i@c.in', 'hash', 'intern')")
            i_id = db.execute("SELECT id FROM users WHERE email='i@c.in'").fetchone()[0]
        else:
            p_id, i_id = p_row[0], i_row[0]

        cursor = db.execute("INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'SE', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '10k', 'published')", (p_id,))
        internship_id = cursor.lastrowid

        app_cursor = db.execute("INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'screening')", (internship_id, i_id))
        app_id = app_cursor.lastrowid
        db.commit()

    token = create_token(p_id, 'provider')
    headers = {'Authorization': f'Bearer {token}'}

    resp = client.post(f'/api/applications/{app_id}/decision', json={'decision': 'advance', 'notes': 'Strong candidate evidence.'}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data['decision'] == 'advance'
    assert data['notes'] == 'Strong candidate evidence.'

    # Verify application status updated to 'shortlisted'
    with get_db() as db:
        app_status = db.execute("SELECT status FROM applications WHERE id = ?", (app_id,)).fetchone()[0]
        assert app_status == 'shortlisted'
