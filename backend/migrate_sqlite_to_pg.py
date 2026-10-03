import os
import sqlite3
# pyrefly: ignore [missing-import]
import psycopg
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

db_url = os.getenv("DATABASE_URL")
sqlite_path = os.path.join(os.path.dirname(__file__), "internflow.db")

print("Starting SQLite -> PostgreSQL Data Migration...")
print(f"Source: {sqlite_path}")
print(f"Destination: {db_url.split('@')[-1] if '@' in db_url else db_url}")
print("=" * 70)

# Exact foreign-key dependency order
TABLE_ORDER = [
    "users",
    "skills",
    "internships",
    "internship_skills",
    "applications",
    "application_screening_results",
    "application_provider_decisions",
    "application_communications",
    "mentor_assignments",
    "projects",
    "master_tasks",
    "project_chunks",
    "mentor_tasks",
    "task_submissions",
    "mentor_feedback",
    "intern_mentor_feedback",
    "mentor_evaluations",
    "attendance",
    "candidate_skills",
    "mentor_skill_observations",
    "questions",
    "assessments",
    "assessment_questions",
    "assessment_attempts",
    "assessment_responses",
    "interviews",
    "interview_scorecards",
    "internship_goals",
    "goal_milestones",
    "skill_evidence",
    "final_evaluations",
    "verified_skills",
    "internship_outcomes",
    "skill_passports",
    "certificates",
    "activity_events",
    "weekly_reports",
]

sqlite_conn = sqlite3.connect(sqlite_path)
sqlite_conn.row_factory = sqlite3.Row
sq_cur = sqlite_conn.cursor()

pg_conn = psycopg.connect(db_url)
pg_cur = pg_conn.cursor()

# Get column data types in PG
pg_cur.execute("""
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'app_schema'
""")
pg_types = {}
for t, col, dt in pg_cur.fetchall():
    if t not in pg_types:
        pg_types[t] = {}
    pg_types[t][col] = dt

# Truncate all tables in reverse dependency order for clean migration rerun
pg_cur.execute(f"TRUNCATE TABLE {', '.join([f'\"{t}\"' for t in reversed(TABLE_ORDER)])} RESTART IDENTITY CASCADE;")
pg_conn.commit()

# Query existing valid task_ids, project_ids, user_ids to fix orphaned FK references in legacy SQLite data
sq_cur.execute("SELECT id FROM mentor_tasks")
valid_task_ids = {r[0] for r in sq_cur.fetchall()}
sq_cur.execute("SELECT id FROM projects")
valid_project_ids = {r[0] for r in sq_cur.fetchall()}
sq_cur.execute("SELECT id FROM users")
valid_user_ids = {r[0] for r in sq_cur.fetchall()}

migration_summary = []

for table in TABLE_ORDER:
    sq_cur.execute(f"SELECT * FROM `{table}`")
    rows = sq_cur.fetchall()
    sq_count = len(rows)

    if sq_count == 0:
        migration_summary.append((table, sq_count, 0, "YES (0 rows)"))
        continue

    col_names = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(col_names))
    cols_str = ", ".join([f'"{c}"' for c in col_names])

    insert_sql = f'INSERT INTO "{table}" ({cols_str}) VALUES ({placeholders})'

    pg_rows = []
    for row in rows:
        row_vals = []
        for col in col_names:
            val = row[col]
            # Handle orphaned FK references in activity_events
            if table == "activity_events":
                if col == "task_id" and val is not None and val not in valid_task_ids:
                    val = None
                elif col == "project_id" and val is not None and val not in valid_project_ids:
                    val = None
                elif col == "intern_id" and val is not None and val not in valid_user_ids:
                    val = None

            # Convert integer 0/1 to boolean if PG column is boolean
            target_type = pg_types.get(table, {}).get(col, "")
            if target_type == "boolean" and val is not None:
                val = bool(val)
            row_vals.append(val)
        pg_rows.append(tuple(row_vals))

    try:
        pg_cur.executemany(insert_sql, pg_rows)
        pg_conn.commit()
    except Exception as err:
        pg_conn.rollback()
        print(f"Warning on batch insert for {table}: {err}. Retrying row by row...")
        for row_tuple in pg_rows:
            try:
                pg_cur.execute(insert_sql, row_tuple)
                pg_conn.commit()
            except Exception as single_err:
                pg_conn.rollback()
                print(f"Failed row in {table}: {single_err}")

    # Synchronize identity sequence if 'id' exists
    if "id" in col_names:
        try:
            pg_cur.execute(f"""
                SELECT setval(
                    pg_get_serial_sequence('app_schema.{table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM "{table}"), 1)
                );
            """)
            pg_conn.commit()
        except Exception:
            pg_conn.rollback()

    # Verify PG row count
    pg_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    pg_count = pg_cur.fetchone()[0]

    match_str = "YES" if sq_count == pg_count else "NO"
    migration_summary.append((table, sq_count, pg_count, match_str))

sqlite_conn.close()
pg_conn.close()

print("\nDATA MIGRATION SUMMARY TABLE:")
print("=" * 70)
print(f"{'TABLE':<35} | {'SQLITE ROWS':<12} | {'POSTGRES ROWS':<13} | {'MATCH':<6}")
print("-" * 70)
all_matched = True
for t, s_cnt, p_cnt, match in migration_summary:
    print(f"{t:<35} | {s_cnt:<12} | {p_cnt:<13} | {match:<6}")
    if match != "YES" and not match.startswith("YES"):
        all_matched = False
print("=" * 70)
print(f"Final Migration Status: {'PASSED (100% Match)' if all_matched else 'WARNING: Mismatch detected'}")
