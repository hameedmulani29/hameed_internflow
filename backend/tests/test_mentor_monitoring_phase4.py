import pytest
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.main import app


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def _create_user(db, name, email, role):
    db.execute("DELETE FROM users WHERE email = ?", (email,))
    cursor = db.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, 'hash', ?)",
        (name, email, role),
    )
    db.commit()
    return cursor.lastrowid


def _create_internship(db, provider_id, title="Backend Engineering"):
    cursor = db.execute(
        "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, ?, 'Engineering', 'Desc', 'Remote', 'Remote', '3 months', '$1000', 'published')",
        (provider_id, title),
    )
    db.commit()
    return cursor.lastrowid


def _assign_mentor(db, mentor_id, intern_id, internship_id):
    db.execute("DELETE FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ?", (mentor_id, intern_id))
    cursor = db.execute(
        "INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active')",
        (mentor_id, intern_id, internship_id),
    )
    db.commit()
    return cursor.lastrowid


def test_mentor_websocket_auth():
    client = TestClient(app)
    with get_db() as db:
        mentor_id = _create_user(db, "Mentor Alex", "alex.ws@test.com", "mentor")
        intern_id = _create_user(db, "Intern Sam", "sam.ws@test.com", "intern")

    token_mentor = create_token(mentor_id, "mentor")
    token_intern = create_token(intern_id, "intern")

    # Unauthorized token (intern trying to connect to mentor ws)
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/mentor?token={token_intern}") as websocket:
            pass

    # Authorized mentor connection
    with client.websocket_connect(f"/api/ws/mentor?token={token_mentor}") as websocket:
        assert websocket is not None


def test_project_progress_calculation():
    client = TestClient(app)
    with get_db() as db:
        provider_id = _create_user(db, "Provider Inc", "provider.prog@test.com", "provider")
        mentor_id = _create_user(db, "Mentor Bob", "bob.prog@test.com", "mentor")
        intern_id = _create_user(db, "Intern Charlie", "charlie.prog@test.com", "intern")
        internship_id = _create_internship(db, provider_id)
        _assign_mentor(db, mentor_id, intern_id, internship_id)

        # Create project
        cur = db.execute(
            "INSERT INTO projects (internship_id, mentor_id, title, status) VALUES (?, ?, 'Project Progress Test', 'active')",
            (internship_id, mentor_id),
        )
        project_id = cur.lastrowid
        db.commit()

        # 0 tasks initially
        token_mentor = create_token(mentor_id, "mentor")

    response = client.get(f"/api/mentor/projects/{project_id}/progress", headers={"Authorization": f"Bearer {token_mentor}"})
    assert response.status_code == 200
    data = response.json()
    assert data["project_id"] == project_id
    assert data["total_tasks"] == 0
    assert data["completed_tasks"] == 0
    assert data["progress_percent"] == 0.0

    # Create 4 tasks: 2 completed, 1 in_progress, 1 assigned
    with get_db() as db:
        db.execute("INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, project_id, title, description, status) VALUES (?, ?, ?, ?, 'Task 1', 'Desc', 'completed')", (mentor_id, intern_id, internship_id, project_id))
        db.execute("INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, project_id, title, description, status) VALUES (?, ?, ?, ?, 'Task 2', 'Desc', 'completed')", (mentor_id, intern_id, internship_id, project_id))
        db.execute("INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, project_id, title, description, status) VALUES (?, ?, ?, ?, 'Task 3', 'Desc', 'in_progress')", (mentor_id, intern_id, internship_id, project_id))
        db.execute("INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, project_id, title, description, status) VALUES (?, ?, ?, ?, 'Task 4', 'Desc', 'assigned')", (mentor_id, intern_id, internship_id, project_id))
        db.commit()

    response = client.get(f"/api/mentor/projects/{project_id}/progress", headers={"Authorization": f"Bearer {token_mentor}"})
    assert response.status_code == 200
    data = response.json()
    assert data["total_tasks"] == 4
    assert data["completed_tasks"] == 2
    assert data["progress_percent"] == 50.0


def test_intern_action_emits_event_and_updates_activity_feed():
    client = TestClient(app)
    with get_db() as db:
        provider_id = _create_user(db, "Provider Act", "p.act@test.com", "provider")
        mentor_id = _create_user(db, "Mentor Lead", "lead.act@test.com", "mentor")
        intern_id = _create_user(db, "Intern Dave", "dave.act@test.com", "intern")
        internship_id = _create_internship(db, provider_id)
        _assign_mentor(db, mentor_id, intern_id, internship_id)

        cur = db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, status) VALUES (?, ?, ?, 'Build REST API Act', 'Implement endpoints', 'assigned')",
            (mentor_id, intern_id, internship_id),
        )
        task_id = cur.lastrowid
        db.commit()

    token_mentor = create_token(mentor_id, "mentor")
    token_intern = create_token(intern_id, "intern")

    # Connect mentor WebSocket
    with client.websocket_connect(f"/api/ws/mentor?token={token_mentor}") as ws:
        # Intern starts task
        res_status = client.patch(
            f"/api/interns/tasks/{task_id}/status",
            json={"status": "in_progress"},
            headers={"Authorization": f"Bearer {token_intern}"},
        )
        assert res_status.status_code == 200

        # Receive real-time WS event
        event = ws.receive_json()
        assert event["type"] in ("task.started", "task.status_changed")
        assert event["task_id"] == task_id
        assert event["mentor_id"] == mentor_id
        assert event["intern_id"] == intern_id

        # Intern submits task
        res_submit = client.post(
            f"/api/interns/tasks/{task_id}/submit",
            json={"content": "Completed full REST API code with unit tests."},
            headers={"Authorization": f"Bearer {token_intern}"},
        )
        assert res_submit.status_code == 201

        event2 = ws.receive_json()
        assert event2["type"] == "task.submitted"
        assert event2["task_id"] == task_id

    # Check mentor activity feed REST API
    res_activity = client.get("/api/mentor/activity", headers={"Authorization": f"Bearer {token_mentor}"})
    assert res_activity.status_code == 200
    feed = res_activity.json()["items"]
    assert len(feed) >= 2
    types = [item["event_type"] for item in feed]
    assert "task.submitted" in types


def test_mentor_scoped_event_isolation():
    client = TestClient(app)
    with get_db() as db:
        provider_id = _create_user(db, "Org Provider Iso", "org.iso@test.com", "provider")
        mentor1_id = _create_user(db, "Mentor 1 Iso", "m1.iso@test.com", "mentor")
        mentor2_id = _create_user(db, "Mentor 2 Iso", "m2.iso@test.com", "mentor")
        intern1_id = _create_user(db, "Intern 1 Iso", "i1.iso@test.com", "intern")
        intern2_id = _create_user(db, "Intern 2 Iso", "i2.iso@test.com", "intern")
        internship_id = _create_internship(db, provider_id)

        _assign_mentor(db, mentor1_id, intern1_id, internship_id)
        _assign_mentor(db, mentor2_id, intern2_id, internship_id)

        cur = db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, status) VALUES (?, ?, ?, 'M1 Task Iso', 'Desc', 'assigned')",
            (mentor1_id, intern1_id, internship_id),
        )
        task1_id = cur.lastrowid
        db.commit()

    t_m1 = create_token(mentor1_id, "mentor")
    t_m2 = create_token(mentor2_id, "mentor")
    t_i1 = create_token(intern1_id, "intern")

    # Mentor 1 connects, Mentor 2 connects
    with client.websocket_connect(f"/api/ws/mentor?token={t_m1}") as ws1:
        with client.websocket_connect(f"/api/ws/mentor?token={t_m2}") as ws2:
            # Intern 1 updates task 1
            client.patch(
                f"/api/interns/tasks/{task1_id}/status",
                json={"status": "in_progress"},
                headers={"Authorization": f"Bearer {t_i1}"},
            )

            # ws1 should receive event
            ev1 = ws1.receive_json()
            assert ev1["mentor_id"] == mentor1_id

            # ws2 activity feed should NOT contain M1's task event
            res_m2 = client.get("/api/mentor/activity", headers={"Authorization": f"Bearer {t_m2}"})
            m2_items = res_m2.json()["items"]
            assert all(item["mentor_id"] == mentor2_id for item in m2_items)


def test_mentor_review_and_dashboard_summary():
    client = TestClient(app)
    with get_db() as db:
        provider_id = _create_user(db, "Tech Corp Dash", "tech.dash@corp.com", "provider")
        mentor_id = _create_user(db, "Mentor Emma", "emma.dash@corp.com", "mentor")
        intern_id = _create_user(db, "Intern Frank", "frank.dash@corp.com", "intern")
        internship_id = _create_internship(db, provider_id)
        _assign_mentor(db, mentor_id, intern_id, internship_id)

        cur_t = db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, status) VALUES (?, ?, ?, 'Dashboard Task Unique', 'Desc', 'submitted')",
            (mentor_id, intern_id, internship_id),
        )
        task_id = cur_t.lastrowid
        cur_s = db.execute(
            "INSERT INTO task_submissions (task_id, intern_id, content, status) VALUES (?, ?, 'Done work', 'pending')",
            (task_id, intern_id),
        )
        submission_id = cur_s.lastrowid
        db.commit()

    token_mentor = create_token(mentor_id, "mentor")

    # Check dashboard before review
    dash_before = client.get("/api/mentor/dashboard", headers={"Authorization": f"Bearer {token_mentor}"}).json()
    assert dash_before["metrics"]["pending_reviews"] >= 1
    assert len(dash_before["pending_reviews"]) >= 1

    # Mentor approves submission
    res_review = client.patch(
        f"/api/mentor/submissions/{submission_id}?decision=approved",
        headers={"Authorization": f"Bearer {token_mentor}"},
    )
    assert res_review.status_code == 200

    # Check dashboard after review: pending review count should decrease
    dash_after = client.get("/api/mentor/dashboard", headers={"Authorization": f"Bearer {token_mentor}"}).json()
    assert dash_after["metrics"]["pending_reviews"] == dash_before["metrics"]["pending_reviews"] - 1
