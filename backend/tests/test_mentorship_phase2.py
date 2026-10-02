import pytest
from datetime import datetime, timedelta
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


def setup_internship_and_assignment():
    import uuid
    suffix = uuid.uuid4().hex[:8]
    provider_id, provider_headers = create_user_and_token(f"provider_p2_{suffix}@co.in", "provider", "P2 Provider")
    mentor_id, mentor_headers = create_user_and_token(f"mentor_p2_{suffix}@co.in", "mentor", "P2 Mentor")
    intern1_id, intern1_headers = create_user_and_token(f"intern1_p2_{suffix}@co.in", "intern", "Intern Alpha")
    intern2_id, intern2_headers = create_user_and_token(f"intern2_p2_{suffix}@co.in", "intern", "Intern Beta")

    # Create internship
    resp = client.post(
        "/api/internships",
        json={
            "title": "Backend Engineering Internship",
            "department": "Engineering",
            "description": "Fullstack Python & React internship",
            "location": "Remote",
            "work_mode": "Remote",
            "duration": "8 weeks",
            "stipend": "$2000/mo",
            "status": "published",
        },
        headers=provider_headers,
    )
    assert resp.status_code == 201, resp.json()
    internship_id = resp.json()["id"]

    # Assign mentor to intern1 and intern2 for this internship
    resp1 = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_id, "intern_id": intern1_id, "internship_id": internship_id},
        headers=provider_headers,
    )
    assert resp1.status_code == 201, resp1.json()

    resp2 = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_id, "intern_id": intern2_id, "internship_id": internship_id},
        headers=provider_headers,
    )
    assert resp2.status_code == 201, resp2.json()

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


# ================= 1. PROJECT CREATION TESTS =================

def test_mentor_create_project_success():
    ctx = setup_internship_and_assignment()
    today = datetime.now().date()
    start = today.isoformat()
    end = (today + timedelta(days=30)).isoformat()

    resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "InternFlow Platform Core",
            "description": "Core mentorship execution engine project",
            "objective": "Deliver distribution and scheduling engine",
            "deliverable": "Working API and UI",
            "status": "draft",
            "start_date": start,
            "end_date": end,
        },
        headers=ctx["mentor_headers"],
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "InternFlow Platform Core"
    assert data["start_date"] == start
    assert data["end_date"] == end


def test_mentor_create_project_invalid_dates_rejected():
    ctx = setup_internship_and_assignment()
    today = datetime.now().date()
    start = today.isoformat()
    end = (today - timedelta(days=5)).isoformat() # end precedes start

    resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Invalid Date Project",
            "start_date": start,
            "end_date": end,
        },
        headers=ctx["mentor_headers"],
    )
    assert resp.status_code == 422
    assert "End date cannot precede start date" in resp.json()["detail"]


def test_unauthorized_mentor_cannot_create_project():
    ctx = setup_internship_and_assignment()
    _, unauth_mentor_headers = create_user_and_token("unauth_mentor@co.in", "mentor")

    resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Rogue Project",
        },
        headers=unauth_mentor_headers,
    )
    assert resp.status_code == 403


# ================= 2. MASTER TASKS & CHUNKS TESTS =================

def test_master_task_and_chunk_hierarchy():
    ctx = setup_internship_and_assignment()
    # Create project
    proj_resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Project Auth Engine",
        },
        headers=ctx["mentor_headers"],
    )
    proj_id = proj_resp.json()["id"]

    # Create master task
    mt_resp = client.post(
        f"/api/mentor/projects/{proj_id}/tasks",
        json={
            "title": "Authentication Subsystem",
            "description": "JWT & Password Hashing",
            "priority": "high",
            "estimated_hours": 16.0,
        },
        headers=ctx["mentor_headers"],
    )
    assert mt_resp.status_code == 201
    mt_id = mt_resp.json()["id"]

    # Create chunks under master task
    c1 = client.post(
        f"/api/mentor/tasks/{mt_id}/chunks",
        json={
            "title": "DB Schema Models",
            "description": "User table schema",
            "priority": "high",
            "estimated_hours": 4.0,
        },
        headers=ctx["mentor_headers"],
    )
    assert c1.status_code == 201

    c2 = client.post(
        f"/api/mentor/tasks/{mt_id}/chunks",
        json={
            "title": "JWT Auth Router",
            "description": "Login endpoint",
            "priority": "normal",
            "estimated_hours": 8.0,
        },
        headers=ctx["mentor_headers"],
    )
    assert c2.status_code == 201

    # Verify project hierarchy endpoint
    get_proj = client.get(f"/api/mentor/projects/{proj_id}", headers=ctx["mentor_headers"])
    assert get_proj.status_code == 200
    p_data = get_proj.json()
    assert len(p_data["master_tasks"]) == 1
    assert len(p_data["chunks"]) == 2


# ================= 3. DISTRIBUTION ENGINE TESTS =================

def test_distribution_equal_priority_workload_balanced():
    ctx = setup_internship_and_assignment()
    # Create project
    proj_resp = client.post(
        "/api/mentor/projects",
        json={"internship_id": ctx["internship_id"], "title": "Web App Build"},
        headers=ctx["mentor_headers"],
    )
    proj_id = proj_resp.json()["id"]

    # Master Task 1
    mt1 = client.post(
        f"/api/mentor/projects/{proj_id}/tasks",
        json={"title": "Backend Setup", "priority": "high"},
        headers=ctx["mentor_headers"],
    ).json()["id"]

    # 4 chunks
    client.post(f"/api/mentor/tasks/{mt1}/chunks", json={"title": "DB setup", "estimated_hours": 4.0, "priority": "high"}, headers=ctx["mentor_headers"])
    client.post(f"/api/mentor/tasks/{mt1}/chunks", json={"title": "Router setup", "estimated_hours": 6.0, "priority": "normal"}, headers=ctx["mentor_headers"])
    client.post(f"/api/mentor/tasks/{mt1}/chunks", json={"title": "Middleware", "estimated_hours": 2.0, "priority": "low"}, headers=ctx["mentor_headers"])
    client.post(f"/api/mentor/tasks/{mt1}/chunks", json={"title": "Unit tests", "estimated_hours": 4.0, "priority": "high"}, headers=ctx["mentor_headers"])

    # 1. Preview distribution equal mode
    prev = client.post(
        f"/api/mentor/projects/{proj_id}/distribute/preview",
        json={"mode": "equal"},
        headers=ctx["mentor_headers"],
    )
    assert prev.status_code == 200
    prev_data = prev.json()
    assert len(prev_data["assignments"]) == 4
    # Equal distribution should split 4 chunks across 2 interns (2 each)
    summary_map = {s["intern_id"]: s for s in prev_data["summary"]}
    assert summary_map[ctx["intern1_id"]]["chunk_count"] == 2
    assert summary_map[ctx["intern2_id"]]["chunk_count"] == 2

    # 2. Execute distribution priority mode
    exec_resp = client.post(
        f"/api/mentor/projects/{proj_id}/distribute",
        json={"mode": "priority"},
        headers=ctx["mentor_headers"],
    )
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["created_tasks_count"] == 4

    # 3. Idempotent re-run should NOT create duplicates
    rerun_resp = client.post(
        f"/api/mentor/projects/{proj_id}/distribute",
        json={"mode": "workload_balanced"},
        headers=ctx["mentor_headers"],
    )
    assert rerun_resp.status_code == 200
    rerun_data = rerun_resp.json()
    assert rerun_data["created_tasks_count"] == 0
    assert rerun_data["updated_tasks_count"] == 4


def test_distribution_zero_chunks_returns_422():
    ctx = setup_internship_and_assignment()
    proj_resp = client.post(
        "/api/mentor/projects",
        json={"internship_id": ctx["internship_id"], "title": "Empty Project"},
        headers=ctx["mentor_headers"],
    )
    proj_id = proj_resp.json()["id"]

    resp = client.post(
        f"/api/mentor/projects/{proj_id}/distribute",
        json={"mode": "equal"},
        headers=ctx["mentor_headers"],
    )
    assert resp.status_code == 422
    assert "no chunks to distribute" in resp.json()["detail"]


# ================= 4. SCHEDULING ENGINE TESTS =================

def test_scheduling_engine_success_and_validation():
    ctx = setup_internship_and_assignment()
    today = datetime.now().date()
    start = today.isoformat()
    end = (today + timedelta(days=14)).isoformat()

    # Create project with dates
    proj_resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Scheduled Project",
            "start_date": start,
            "end_date": end,
        },
        headers=ctx["mentor_headers"],
    )
    proj_id = proj_resp.json()["id"]

    # Master Task & Chunk
    mt = client.post(
        f"/api/mentor/projects/{proj_id}/tasks",
        json={"title": "Frontend Setup"},
        headers=ctx["mentor_headers"],
    ).json()["id"]

    client.post(
        f"/api/mentor/tasks/{mt}/chunks",
        json={"title": "Vite React Setup", "estimated_hours": 8.0, "priority": "high"},
        headers=ctx["mentor_headers"],
    )

    # Distribute first
    client.post(
        f"/api/mentor/projects/{proj_id}/distribute",
        json={"mode": "equal"},
        headers=ctx["mentor_headers"],
    )

    # Preview schedule
    prev_sch = client.post(
        f"/api/mentor/projects/{proj_id}/schedule/preview",
        headers=ctx["mentor_headers"],
    )
    assert prev_sch.status_code == 200
    sch_data = prev_sch.json()
    assert len(sch_data["schedule"]) == 1
    assert sch_data["schedule"][0]["start_date"] == start

    # Execute schedule
    exec_sch = client.post(
        f"/api/mentor/projects/{proj_id}/schedule",
        headers=ctx["mentor_headers"],
    )
    assert exec_sch.status_code == 200

    # Intern checks task list and verifies project_title, start_date, due_date
    intern_tasks = client.get("/api/interns/tasks", headers=ctx["intern1_headers"])
    assert intern_tasks.status_code == 200
    t_list = intern_tasks.json()["items"]
    assert len(t_list) >= 1
    t = t_list[0]
    assert t["project_title"] == "Scheduled Project"
    assert t["start_date"] == start
    assert t["due_date"] is not None


def test_scheduling_exceeding_capacity_returns_422():
    ctx = setup_internship_and_assignment()
    today = datetime.now().date()
    start = today.isoformat()
    end = (today + timedelta(days=1)).isoformat() # Only 2 days duration = 16 hours capacity max

    proj_resp = client.post(
        "/api/mentor/projects",
        json={
            "internship_id": ctx["internship_id"],
            "title": "Short Timeline Project",
            "start_date": start,
            "end_date": end,
        },
        headers=ctx["mentor_headers"],
    )
    proj_id = proj_resp.json()["id"]

    mt = client.post(
        f"/api/mentor/projects/{proj_id}/tasks",
        json={"title": "Heavy Workload"},
        headers=ctx["mentor_headers"],
    ).json()["id"]

    # Add 100 hours chunk to exceed 16 hour capacity
    client.post(
        f"/api/mentor/tasks/{mt}/chunks",
        json={"title": "Massive Feature", "estimated_hours": 100.0},
        headers=ctx["mentor_headers"],
    )

    # Distribute
    client.post(
        f"/api/mentor/projects/{proj_id}/distribute",
        headers=ctx["mentor_headers"],
    )

    # Attempt schedule -> must fail with 422
    resp = client.post(
        f"/api/mentor/projects/{proj_id}/schedule",
        headers=ctx["mentor_headers"],
    )
    assert resp.status_code == 422
    assert "exceeds available project capacity" in resp.json()["detail"]
