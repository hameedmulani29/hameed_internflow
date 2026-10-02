import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app.core.security import create_token
from app.db import get_db, init_db
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def create_user_and_token(email: str, role: str, full_name: str = "Test User"):
    with get_db() as db:
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, 'hash', ?) ON CONFLICT (email) DO NOTHING",
            (full_name, email, role),
        )
        row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        db.commit()
        user_id = row[0]
    token = create_token(user_id, role)
    return user_id, {"Authorization": f"Bearer {token}"}


def setup_intern_environment():
    import uuid
    suffix = uuid.uuid4().hex[:8]
    provider_id, provider_headers = create_user_and_token(f"provider_p3_{suffix}@co.in", "provider", "P3 Provider")
    mentor_id, mentor_headers = create_user_and_token(f"mentor_p3_{suffix}@co.in", "mentor", "P3 Mentor")
    intern1_id, intern1_headers = create_user_and_token(f"intern1_p3_{suffix}@co.in", "intern", "Intern One")
    intern2_id, intern2_headers = create_user_and_token(f"intern2_p3_{suffix}@co.in", "intern", "Intern Two")

    # Internship
    resp = client.post(
        "/api/internships",
        json={
            "title": "Fullstack Engineering Internship",
            "department": "Engineering",
            "description": "Python + React Internship",
            "location": "Remote",
            "work_mode": "Remote",
            "duration": "12 weeks",
            "stipend": "$2500/mo",
            "status": "published",
        },
        headers=provider_headers,
    )
    assert resp.status_code == 201
    internship_id = resp.json()["id"]

    # Assign mentor to intern1
    client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_id, "intern_id": intern1_id, "internship_id": internship_id},
        headers=provider_headers,
    )

    return {
        "provider_id": provider_id,
        "mentor_id": mentor_id,
        "intern1_id": intern1_id,
        "intern2_id": intern2_id,
        "internship_id": internship_id,
        "provider_headers": provider_headers,
        "mentor_headers": mentor_headers,
        "intern1_headers": intern1_headers,
        "intern2_headers": intern2_headers,
    }


# ================= 1. TASK CATEGORIZATION TESTS =================

def test_task_categorization_today_upcoming_overdue():
    ctx = setup_intern_environment()
    today_dt = datetime.now(timezone.utc).date()
    today_str = today_dt.isoformat()
    yesterday_str = (today_dt - timedelta(days=2)).isoformat()
    tomorrow_str = (today_dt + timedelta(days=3)).isoformat()

    # Create project & tasks for intern1
    proj = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Categorization Project",
            "start_date": yesterday_str,
            "end_date": (today_dt + timedelta(days=30)).isoformat(),
        },
        headers=ctx["mentor_headers"],
    ).json()

    mt = client.post(
        f"/api/mentor/projects/{proj['id']}/tasks",
        json={"title": "Master Task 1"},
        headers=ctx["mentor_headers"],
    ).json()

    # Chunk 1: Today's task
    c1 = client.post(
        f"/api/mentor/tasks/{mt['id']}/chunks",
        json={"title": "Today Task Chunk", "priority": "high"},
        headers=ctx["mentor_headers"],
    ).json()

    # Chunk 2: Upcoming task
    c2 = client.post(
        f"/api/mentor/tasks/{mt['id']}/chunks",
        json={"title": "Upcoming Task Chunk", "priority": "normal"},
        headers=ctx["mentor_headers"],
    ).json()

    # Chunk 3: Overdue task
    c3 = client.post(
        f"/api/mentor/tasks/{mt['id']}/chunks",
        json={"title": "Overdue Task Chunk", "priority": "high"},
        headers=ctx["mentor_headers"],
    ).json()

    # Distribute
    client.post(
        f"/api/mentor/projects/{proj['id']}/distribute",
        headers=ctx["mentor_headers"],
    )

    # Set custom dates directly on mentor_tasks for testing date categorization
    with get_db() as db:
        db.execute(
            "UPDATE mentor_tasks SET start_date = ?, due_date = ? WHERE chunk_id = ?",
            (yesterday_str, today_str, c1["id"]),
        )
        db.execute(
            "UPDATE mentor_tasks SET start_date = ?, due_date = ? WHERE chunk_id = ?",
            (tomorrow_str, (today_dt + timedelta(days=5)).isoformat(), c2["id"]),
        )
        db.execute(
            "UPDATE mentor_tasks SET start_date = ?, due_date = ? WHERE chunk_id = ?",
            ((today_dt - timedelta(days=10)).isoformat(), yesterday_str, c3["id"]),
        )
        db.commit()

    # Query category=today
    today_res = client.get("/api/interns/tasks?category=today", headers=ctx["intern1_headers"])
    assert today_res.status_code == 200
    t_titles = [t["title"] for t in today_res.json()["items"]]
    assert "Today Task Chunk" in t_titles

    # Query category=upcoming
    upcoming_res = client.get("/api/interns/tasks?category=upcoming", headers=ctx["intern1_headers"])
    assert upcoming_res.status_code == 200
    u_titles = [t["title"] for t in upcoming_res.json()["items"]]
    assert "Upcoming Task Chunk" in u_titles

    # Query category=overdue
    overdue_res = client.get("/api/interns/tasks?category=overdue", headers=ctx["intern1_headers"])
    assert overdue_res.status_code == 200
    o_titles = [t["title"] for t in overdue_res.json()["items"]]
    assert "Overdue Task Chunk" in o_titles


# ================= 2. STATUS LIFECYCLE TESTS =================

def test_intern_status_transition_rules():
    ctx = setup_intern_environment()

    # Create task manually for intern1
    task_resp = client.post(
        "/api/mentor/tasks",
        json={"intern_id": ctx["intern1_id"], "title": "Build Auth API", "description": "Implement endpoints"},
        headers=ctx["mentor_headers"],
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    # 1. Transition assigned -> in_progress (ALLOWED)
    patch1 = client.patch(
        f"/api/interns/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=ctx["intern1_headers"],
    )
    assert patch1.status_code == 200
    assert patch1.json()["status"] == "in_progress"

    # 2. Transition directly in_progress -> completed (DISALLOWED for intern, returns 422)
    patch2 = client.patch(
        f"/api/interns/tasks/{task_id}/status",
        json={"status": "completed"},
        headers=ctx["intern1_headers"],
    )
    assert patch2.status_code == 422

    # 3. Intern2 trying to modify Intern1's task (REJECTED 404/403)
    patch_unauth = client.patch(
        f"/api/interns/tasks/{task_id}/status",
        json={"status": "in_progress"},
        headers=ctx["intern2_headers"],
    )
    assert patch_unauth.status_code in (404, 403)


# ================= 3. SUBMISSION & RESUBMISSION FLOW =================

def test_full_submission_review_resubmission_lifecycle():
    ctx = setup_intern_environment()

    # Create task for intern1
    task = client.post(
        "/api/mentor/tasks",
        json={"intern_id": ctx["intern1_id"], "title": "Database Schema", "description": "Create SQLite schema"},
        headers=ctx["mentor_headers"],
    ).json()

    # Intern starts task
    client.patch(
        f"/api/interns/tasks/{task['id']}/status",
        json={"status": "in_progress"},
        headers=ctx["intern1_headers"],
    )

    # 1. Initial Submission
    sub1 = client.post(
        f"/api/interns/tasks/{task['id']}/submit",
        json={
            "content": "Implemented schema with 35 tables and indexing.",
            "repo_url": "https://github.com/intern/db-repo",
            "notes": "Ready for initial review.",
        },
        headers=ctx["intern1_headers"],
    )
    assert sub1.status_code == 201
    sub1_data = sub1.json()
    assert sub1_data["status"] == "pending"

    # Mentor requests changes
    rev1 = client.patch(
        f"/api/mentor/submissions/{sub1_data['id']}?decision=changes_requested",
        headers=ctx["mentor_headers"],
    )
    assert rev1.status_code == 200
    assert rev1.json()["status"] == "changes_requested"

    # Verify task status is now changes_requested
    task_after_rev = client.get("/api/interns/tasks", headers=ctx["intern1_headers"]).json()["items"][0]
    assert task_after_rev["status"] == "changes_requested"

    # Intern resubmits work after changes_requested
    sub2 = client.post(
        f"/api/interns/tasks/{task['id']}/submit",
        json={
            "content": "Added requested missing foreign keys and index constraints.",
            "repo_url": "https://github.com/intern/db-repo/commit/2",
            "notes": "Addressed all feedback points.",
        },
        headers=ctx["intern1_headers"],
    )
    assert sub2.status_code in (200, 201)

    # Mentor approves submission
    rev2 = client.patch(
        f"/api/mentor/submissions/{sub1_data['id']}?decision=approved",
        headers=ctx["mentor_headers"],
    )
    assert rev2.status_code == 200

    # Task status is now completed
    task_final = client.get("/api/interns/tasks", headers=ctx["intern1_headers"]).json()["items"][0]
    assert task_final["status"] == "completed"
