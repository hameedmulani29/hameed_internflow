import os
# pyrefly: ignore [missing-import]
import psycopg
from dotenv import load_dotenv
from app.db import get_db, is_unique_violation

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

print("Executing Phase 10 Manual CRUD Validation against PostgreSQL...")
print("=" * 60)

results = {}

# 1. Test CREATE
try:
    with get_db() as db:
        cursor = db.execute(
            "INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            ("CRUD Test User", "crud_test@example.com", "hash123", "intern", "Test Org")
        )
        created_id = cursor.fetchone()["id"]
        db.commit()
    assert created_id > 0
    results["CREATE"] = f"PASS (Generated ID: {created_id})"
except Exception as e:
    results["CREATE"] = f"FAIL: {e}"
    created_id = None

# 2. Test READ
try:
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE id = %s", (created_id,)).fetchone()
        assert user["email"] == "crud_test@example.com"
        assert user["full_name"] == "CRUD Test User"
        # Test index access
        assert user[0] == created_id
    results["READ"] = "PASS (dict key and integer index access verified)"
except Exception as e:
    results["READ"] = f"FAIL: {e}"

# 3. Test UPDATE
try:
    with get_db() as db:
        db.execute("UPDATE users SET full_name = %s WHERE id = %s", ("Updated CRUD User", created_id))
        db.commit()
        user = db.execute("SELECT full_name FROM users WHERE id = %s", (created_id,)).fetchone()
        assert user["full_name"] == "Updated CRUD User"
    results["UPDATE"] = "PASS (Updated value persisted)"
except Exception as e:
    results["UPDATE"] = f"FAIL: {e}"

# 4. Test ROLLBACK
try:
    with get_db() as db:
        db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, %s)", ("Rollback User", "rollback@example.com", "hash", "intern"))
        # Intentional rollback by raising exception inside context or calling rollback()
        db.rollback()
    
    with get_db() as db:
        check = db.execute("SELECT * FROM users WHERE email = %s", ("rollback@example.com",)).fetchone()
        assert check is None
    results["ROLLBACK"] = "PASS (Rolled back row was not persisted)"
except Exception as e:
    results["ROLLBACK"] = f"FAIL: {e}"

# 5. Test UNIQUE Constraint
try:
    with get_db() as db:
        try:
            db.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, %s)", ("Dup User", "crud_test@example.com", "hash", "intern"))
            db.commit()
            results["UNIQUE"] = "FAIL (Duplicate email was accepted)"
        except Exception as err:
            assert is_unique_violation(err) is True
            results["UNIQUE"] = f"PASS (Unique violation caught cleanly: {err.__class__.__name__})"
except Exception as e:
    results["UNIQUE"] = f"FAIL: {e}"

# 6. Test DELETE
try:
    with get_db() as db:
        db.execute("DELETE FROM users WHERE id = %s", (created_id,))
        db.commit()
        check = db.execute("SELECT * FROM users WHERE id = %s", (created_id,)).fetchone()
        assert check is None
    results["DELETE"] = "PASS (Temporary test record deleted cleanly)"
except Exception as e:
    results["DELETE"] = f"FAIL: {e}"

print("\nPhase 10 Manual CRUD Results:")
print("-" * 60)
for k, v in results.items():
    print(f"{k:<18}: {v}")
