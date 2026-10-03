import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import get_db
from app.core.security import hash_password, create_token

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    with get_db() as db:
        db.execute("DELETE FROM mentor_assignments")
        db.execute("DELETE FROM applications")
        db.execute("DELETE FROM internships")
        db.execute("DELETE FROM users WHERE email LIKE '%@testdir.com'")
        db.commit()


def create_test_user(db, name, email, role, organization=None):
    cursor = db.execute(
        "INSERT INTO users (full_name, email, password_hash, role, organization, is_active, is_verified, is_approved, trust_level) "
        "VALUES (%s, %s, %s, %s, %s, 1, 1, 1, 'approved') RETURNING id",
        (name, email.lower(), hash_password("Password123!"), role, organization)
    )
    ret = cursor.fetchone()
    user_id = ret["id"] if isinstance(ret, dict) or (hasattr(ret, "__getitem__") and "id" in ret) else ret[0]
    token = create_token(user_id, role)
    return user_id, token


def test_provider_mentor_directory_scoping_and_visibility():
    with get_db() as db:
        prov_a_id, prov_a_token = create_test_user(db, "Provider A", "prov_a@testdir.com", "provider", "TechCorp")
        prov_b_id, prov_b_token = create_test_user(db, "Provider B", "prov_b@testdir.com", "provider", "OtherCorp")

        mentor_a_id, _ = create_test_user(db, "Mentor A", "mentor_a@testdir.com", "mentor", "TechCorp")
        mentor_b_id, _ = create_test_user(db, "Mentor B", "mentor_b@testdir.com", "mentor", "OtherCorp")
        mentor_unassigned_id, _ = create_test_user(db, "Mentor Free", "mentor_free@testdir.com", "mentor", None)
        db.commit()

    # Provider A requests mentors
    resp_a = client.get("/api/mentor/assignments/mentors", headers={"Authorization": f"Bearer {prov_a_token}"})
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    mentor_ids_a = [m["id"] for m in data_a["items"]]
    assert mentor_a_id in mentor_ids_a
    assert mentor_b_id not in mentor_ids_a
    assert mentor_unassigned_id in mentor_ids_a

    # Provider B requests mentors
    resp_b = client.get("/api/mentor/assignments/mentors", headers={"Authorization": f"Bearer {prov_b_token}"})
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    mentor_ids_b = [m["id"] for m in data_b["items"]]
    assert mentor_b_id in mentor_ids_b
    assert mentor_a_id not in mentor_ids_b


def test_mentor_assignment_flow_and_persistence():
    with get_db() as db:
        prov_id, prov_token = create_test_user(db, "Tech Provider", "prov_assign@testdir.com", "provider", "TechCorp")
        mentor_id, _ = create_test_user(db, "Mentor One", "mentor1@testdir.com", "mentor", "TechCorp")
        intern_id, _ = create_test_user(db, "Intern One", "intern1@testdir.com", "intern", "TechCorp")

        # Create Internship
        cursor = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) "
            "VALUES (%s, 'Backend Engineering', 'Engineering', 'Build APIs', 'Remote', 'Remote', '3 months', '1000', 'published') RETURNING id",
            (prov_id,)
        )
        ship_id = cursor.fetchone()["id"]
        db.commit()

    # Assign Mentor
    assign_resp = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_id, "intern_id": intern_id, "internship_id": ship_id},
        headers={"Authorization": f"Bearer {prov_token}"}
    )
    assert assign_resp.status_code == 201
    assign_data = assign_resp.json()
    assert assign_data["mentor_id"] == mentor_id
    assert assign_data["intern_id"] == intern_id
    assert assign_data["status"] == "active"

    # Verify Mentors directory updated
    dir_resp = client.get("/api/mentor/assignments/mentors", headers={"Authorization": f"Bearer {prov_token}"})
    assert dir_resp.status_code == 200
    items = dir_resp.json()["items"]
    target_mentor = next(m for m in items if m["id"] == mentor_id)
    assert target_mentor["assigned_interns_count"] == 1
    assert target_mentor["assigned_interns"][0]["intern_id"] == intern_id


def test_mentor_assignment_authorization_prevention():
    with get_db() as db:
        prov_a_id, prov_a_token = create_test_user(db, "Provider Alpha", "pa@testdir.com", "provider", "AlphaOrg")
        prov_b_id, prov_b_token = create_test_user(db, "Provider Beta", "pb@testdir.com", "provider", "BetaOrg")

        mentor_b_id, _ = create_test_user(db, "Mentor Beta", "mb@testdir.com", "mentor", "BetaOrg")
        intern_a_id, _ = create_test_user(db, "Intern Alpha", "ia@testdir.com", "intern", "AlphaOrg")

        cursor_a = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend) "
            "VALUES (%s, 'Alpha Internship', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '1000') RETURNING id",
            (prov_a_id,)
        )
        ship_a_id = cursor_a.fetchone()["id"]

        cursor_b = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend) "
            "VALUES (%s, 'Beta Internship', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '1000') RETURNING id",
            (prov_b_id,)
        )
        ship_b_id = cursor_b.fetchone()["id"]
        db.commit()

    # Provider A tries to assign Provider B's mentor
    bad_assign = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_b_id, "intern_id": intern_a_id, "internship_id": ship_a_id},
        headers={"Authorization": f"Bearer {prov_a_token}"}
    )
    assert bad_assign.status_code == 403

    # Provider A tries to assign mentor under Provider B's internship
    bad_ship_assign = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor_b_id, "intern_id": intern_a_id, "internship_id": ship_b_id},
        headers={"Authorization": f"Bearer {prov_a_token}"}
    )
    assert bad_ship_assign.status_code in (403, 404)


def test_reassignment_flow():
    with get_db() as db:
        prov_id, prov_token = create_test_user(db, "Reassign Provider", "reprov@testdir.com", "provider", "ReOrg")
        mentor1_id, _ = create_test_user(db, "Mentor One", "m1@testdir.com", "mentor", "ReOrg")
        mentor2_id, _ = create_test_user(db, "Mentor Two", "m2@testdir.com", "mentor", "ReOrg")
        intern_id, _ = create_test_user(db, "Intern Reassign", "ire@testdir.com", "intern", "ReOrg")

        cursor = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend) "
            "VALUES (%s, 'Reassign Internship', 'Eng', 'Desc', 'Remote', 'Remote', '3m', '1000') RETURNING id",
            (prov_id,)
        )
        ship_id = cursor.fetchone()["id"]
        db.commit()

    # Initial Assignment: Mentor 1 -> Intern
    asg1 = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor1_id, "intern_id": intern_id, "internship_id": ship_id},
        headers={"Authorization": f"Bearer {prov_token}"}
    )
    assert asg1.status_code == 201

    # Reassignment: Mentor 2 -> Intern
    asg2 = client.post(
        "/api/mentor/assignments",
        json={"mentor_id": mentor2_id, "intern_id": intern_id, "internship_id": ship_id},
        headers={"Authorization": f"Bearer {prov_token}"}
    )
    assert asg2.status_code == 201

    # Verify Mentor 1 has 0 active interns, Mentor 2 has 1 active intern
    dir_resp = client.get("/api/mentor/assignments/mentors", headers={"Authorization": f"Bearer {prov_token}"})
    items = dir_resp.json()["items"]
    m1_data = next(m for m in items if m["id"] == mentor1_id)
    m2_data = next(m for m in items if m["id"] == mentor2_id)

    assert m1_data["assigned_interns_count"] == 0
    assert m2_data["assigned_interns_count"] == 1


def test_new_mentor_registration_discovery():
    with get_db() as db:
        prov_id, prov_token = create_test_user(db, "Reg Provider", "regprov@co.in", "provider", "RegCorp")
        db.commit()

    # Register new mentor via auth registration endpoint
    reg_resp = client.post(
        "/api/auth/register",
        json={
            "role": "mentor",
            "full_name": "Newly Registered Mentor",
            "email": "new_mentor@dev.in",
            "password": "Password123!",
            "organization": "RegCorp"
        }
    )
    assert reg_resp.status_code == 200

    # Request mentors directory as Provider
    dir_resp = client.get("/api/mentor/assignments/mentors", headers={"Authorization": f"Bearer {prov_token}"})
    assert dir_resp.status_code == 200
    items = dir_resp.json()["items"]
    registered_mentor = next((m for m in items if m["email"] == "new_mentor@dev.in"), None)
    assert registered_mentor is not None
    assert registered_mentor["full_name"] == "Newly Registered Mentor"
    assert registered_mentor["organization"] == "RegCorp"
