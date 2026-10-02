import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app.core.config import JWT_ALGORITHM, JWT_SECRET
import jwt
from app.core.security import create_token
from app.db import get_db, init_db
from app.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def _create_user(db, name, email, role):
    db.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, 'hash', ?) ON CONFLICT (email) DO NOTHING",
        (name, email, role),
    )
    row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    db.commit()
    return row[0]


def _create_internship(db, provider_id, title="Backend Engineering"):
    cursor = db.execute(
        "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, ?, 'Engineering', 'Desc', 'Remote', 'Remote', '3 months', '$1000', 'published')",
        (provider_id, title),
    )
    db.commit()
    return cursor.lastrowid


def test_unauthenticated_and_invalid_token_requests():
    client = TestClient(app)
    
    # Missing token
    res = client.get("/api/interns/me/workspace")
    assert res.status_code == 401
    assert "Authentication is required" in res.json()["detail"]

    # Invalid token string
    res = client.get("/api/interns/me/workspace", headers={"Authorization": "Bearer invalid.token.str"})
    assert res.status_code == 401
    assert "invalid or expired" in res.json()["detail"]


def test_expired_token_denied():
    client = TestClient(app)
    # Create an expired token manually
    expired = datetime.now(timezone.utc) - timedelta(minutes=10)
    token_str = jwt.encode({'sub': '123', 'role': 'intern', 'exp': expired}, JWT_SECRET, algorithm=JWT_ALGORITHM)

    res = client.get("/api/interns/me/workspace", headers={"Authorization": f"Bearer {token_str}"})
    assert res.status_code == 401
    assert "invalid or expired" in res.json()["detail"]


def test_role_mismatch_denied():
    client = TestClient(app)
    with get_db() as db:
        intern_id = _create_user(db, "Intern User", "intern.role@test.com", "intern")

    token_intern = create_token(intern_id, "intern")

    # Intern attempting mentor endpoint
    res = client.get("/api/mentor/projects", headers={"Authorization": f"Bearer {token_intern}"})
    assert res.status_code == 403
    assert "permission" in res.json()["detail"]

    # Intern attempting provider endpoint
    res = client.get("/api/applications", headers={"Authorization": f"Bearer {token_intern}"})
    assert res.status_code == 403


def test_idor_intern_cannot_access_or_modify_other_intern_task():
    client = TestClient(app)
    with get_db() as db:
        mentor_id = _create_user(db, "Mentor Role", "mentor.idor@test.com", "mentor")
        intern1_id = _create_user(db, "Intern 1", "intern1.idor@test.com", "intern")
        intern2_id = _create_user(db, "Intern 2", "intern2.idor@test.com", "intern")

        # Create task for Intern 2
        cur = db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, status) VALUES (?, ?, 'Task for Intern 2', 'Desc', 'assigned')",
            (mentor_id, intern2_id),
        )
        task2_id = cur.lastrowid
        db.commit()

    token_intern1 = create_token(intern1_id, "intern")

    # Intern 1 attempts to update Intern 2's task status
    res = client.patch(
        f"/api/interns/tasks/{task2_id}/status",
        json={"status": "in_progress"},
        headers={"Authorization": f"Bearer {token_intern1}"},
    )
    assert res.status_code == 404

    # Intern 1 attempts to submit Intern 2's task
    res_sub = client.post(
        f"/api/interns/tasks/{task2_id}/submit",
        json={"content": "Malicious submission attempt by Intern 1."},
        headers={"Authorization": f"Bearer {token_intern1}"},
    )
    assert res_sub.status_code == 404


def test_idor_intern_cannot_access_other_intern_feedback():
    client = TestClient(app)
    with get_db() as db:
        mentor_id = _create_user(db, "Mentor Feed", "m.feed@test.com", "mentor")
        intern1_id = _create_user(db, "Intern 1 Feed", "i1.feed@test.com", "intern")
        intern2_id = _create_user(db, "Intern 2 Feed", "i2.feed@test.com", "intern")

        # Create feedback for Intern 2
        cur = db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, 'Feedback for Intern 2', 0)",
            (mentor_id, intern2_id),
        )
        feedback2_id = cur.lastrowid
        db.commit()

    token_intern1 = create_token(intern1_id, "intern")

    # Intern 1 attempts to mark Intern 2's feedback as read
    res = client.patch(
        f"/api/interns/feedback/{feedback2_id}/read",
        headers={"Authorization": f"Bearer {token_intern1}"},
    )
    assert res.status_code == 404


def test_idor_mentor_cannot_access_other_mentor_project():
    client = TestClient(app)
    with get_db() as db:
        provider_id = _create_user(db, "Provider Main", "prov.main@test.com", "provider")
        mentor1_id = _create_user(db, "Mentor 1 Proj", "m1.proj@test.com", "mentor")
        mentor2_id = _create_user(db, "Mentor 2 Proj", "m2.proj@test.com", "mentor")
        intern_id = _create_user(db, "Intern Proj", "intern.proj@test.com", "intern")
        internship_id = _create_internship(db, provider_id)

        # Mentor 1 assignment & project
        db.execute("INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active') ON CONFLICT (mentor_id, intern_id) DO NOTHING", (mentor1_id, intern_id, internship_id))
        cur = db.execute(
            "INSERT INTO projects (internship_id, mentor_id, title, status) VALUES (?, ?, 'Mentor 1 Project', 'active')",
            (internship_id, mentor1_id),
        )
        project1_id = cur.lastrowid
        db.commit()

    token_mentor2 = create_token(mentor2_id, "mentor")

    # Mentor 2 attempts to get Mentor 1's project detail
    res = client.get(f"/api/mentor/projects/{project1_id}", headers={"Authorization": f"Bearer {token_mentor2}"})
    assert res.status_code == 404

    # Mentor 2 attempts to update Mentor 1's project
    res_patch = client.patch(
        f"/api/mentor/projects/{project1_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token_mentor2}"},
    )
    assert res_patch.status_code == 404


def test_idor_provider_cannot_access_other_provider_applications():
    client = TestClient(app)
    with get_db() as db:
        p1_id = _create_user(db, "Provider 1 App", "p1.app@test.com", "provider")
        p2_id = _create_user(db, "Provider 2 App", "p2.app@test.com", "provider")
        applicant_id = _create_user(db, "Applicant User", "applicant@test.com", "intern")
        ship1_id = _create_internship(db, p1_id, "P1 Internship")

        cur = db.execute(
            "INSERT INTO applications (internship_id, applicant_id, status) VALUES (?, ?, 'applied')",
            (ship1_id, applicant_id),
        )
        app1_id = cur.lastrowid
        db.commit()

    token_p2 = create_token(p2_id, "provider")

    # Provider 2 attempts to get Provider 1's application detail
    res = client.get(f"/api/applications/{app1_id}/detail", headers={"Authorization": f"Bearer {token_p2}"})
    assert res.status_code == 404

    # Provider 2 attempts to update status of Provider 1's application
    res_status = client.patch(
        f"/api/applications/{app1_id}/status",
        json={"status": "shortlisted"},
        headers={"Authorization": f"Bearer {token_p2}"},
    )
    assert res_status.status_code == 404


def test_websocket_unauthorized_role_rejected():
    client = TestClient(app)
    with get_db() as db:
        intern_id = _create_user(db, "Intern WS", "intern.ws@test.com", "intern")
        provider_id = _create_user(db, "Provider WS", "provider.ws@test.com", "provider")

    t_intern = create_token(intern_id, "intern")
    t_provider = create_token(provider_id, "provider")

    # Intern rejected
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/mentor?token={t_intern}"):
            pass

    # Provider rejected
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/mentor?token={t_provider}"):
            pass


def test_database_init_db_idempotency_and_preservation():
    with get_db() as db:
        mentor_id = _create_user(db, "Idempotent Mentor", "idem.mentor@test.com", "mentor")
        user_id = _create_user(db, "Idempotent User", "idem@test.com", "intern")
        db.execute(
            "INSERT INTO mentor_feedback (mentor_id, intern_id, feedback, is_read) VALUES (?, ?, 'Test Feedback', 0)",
            (mentor_id, user_id),
        )
        db.commit()

    # Re-run init_db() multiple times
    init_db()
    init_db()

    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email = 'idem@test.com'").fetchone()
        assert user is not None
        assert user["full_name"] == "Idempotent User"

        fb = db.execute("SELECT * FROM mentor_feedback WHERE intern_id = ?", (user_id,)).fetchone()
        assert fb is not None
        assert fb["feedback"] == "Test Feedback"
        assert fb["is_read"] == 0
