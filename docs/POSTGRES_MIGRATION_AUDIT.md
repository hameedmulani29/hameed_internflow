# InternFlow — PostgreSQL Migration & Database Audit

> **Deployment Audit Document**  
> **Target Production Engine:** PostgreSQL 15+  
> **Current Engine:** SQLite 3 (`internflow.db` via standard library `sqlite3`)

---

## 1. Executive Summary & Assessment

**Deployment Status:** 🔴 **NOT READY FOR POSTGRESQL DEPLOYMENT**

The InternFlow backend currently relies on Python's built-in `sqlite3` library with raw SQLite SQL statements, SQLite-specific pragmas (`PRAGMA table_info`), SQLite-specific system tables (`sqlite_master`), SQLite-specific SQL constructs (`INSERT OR IGNORE`, `AUTOINCREMENT`), SQLite-specific exception string checking (`if 'UNIQUE constraint' in str(error)`), and reliance on Python DB-API `cursor.lastrowid` for autoincrement ID retrieval.

Although `.env` includes `DATABASE_URL=postgresql://user:password@localhost:5432/internflow_prod`, the application runtime code in `app/db.py` and across all 15 FastAPI routers ignores `DATABASE_URL` and directly calls `sqlite3.connect(get_db_path())`.

---

## 2. Answers to Specific Deployment Audit Questions

### A. Can the application run against PostgreSQL without code changes?
**NO.** Running against PostgreSQL will immediately fail with `ModuleNotFoundError` or syntax errors because `app/db.py` directly executes `sqlite3.connect()`.

### B. What changes are required?
1. Refactor `app/db.py` to use SQLAlchemy Engine/Session pool or `psycopg` / `asyncpg` driver.
2. Replace all `cursor.lastrowid` usages across routers with explicit SQL `RETURNING id` clauses or ORM instance returning.
3. Replace all `INSERT OR IGNORE` queries with ANSI SQL / Postgres `ON CONFLICT (...) DO NOTHING`.
4. Replace string check `if 'UNIQUE constraint' in str(error)` with proper driver exception type checks (`psycopg2.errors.UniqueViolation` or SQLAlchemy `IntegrityError`).
5. Replace `PRAGMA table_info()` and `sqlite_master` checks in schema creation/migration logic with standard Alembic migrations.
6. Replace `INTEGER PRIMARY KEY AUTOINCREMENT` in DDL with `BIGSERIAL PRIMARY KEY` or `INTEGER GENERATED ALWAYS AS IDENTITY`.

### C. Are migrations available?
**PARTIALLY.** An `alembic` setup exists in `backend/alembic`, but it only contains an initial partial schema script (`001_initial_schema.py`) and is not synced with the 31 tables currently defined in `app/db.py`.

### D. Is the schema reproducible from an empty PostgreSQL database?
**NO.** The current `SCHEMA` string in `app/db.py` contains SQLite syntax (`AUTOINCREMENT`, `INSERT OR IGNORE`, `PRAGMA`) which will fail on PostgreSQL execution.

### E. Are all production tables represented?
**YES.** All 31 domain tables (`users`, `internships`, `applications`, `application_communications`, `application_screening_results`, `mentor_assignments`, `attendance`, `mentor_tasks`, `task_submissions`, `mentor_feedback`, `intern_mentor_feedback`, `mentor_evaluations`, `skills`, `internship_skills`, `candidate_skills`, `mentor_skill_observations`, `application_provider_decisions`, `questions`, `assessments`, `assessment_questions`, `assessment_attempts`, `assessment_responses`, `interviews`, `interview_scorecards`, `internship_goals`, `goal_milestones`, `skill_evidence`, `final_evaluations`, `verified_skills`, `internship_outcomes`, `skill_passports`, `projects`, `master_tasks`, `project_chunks`, `certificates`, `activity_events`, `weekly_reports`) are defined in DDL.

### F. Are indexes required for important queries?
**YES.** Basic indexes exist on `application_communications`, `intern_mentor_feedback`, `candidate_skills`, `mentor_skill_observations`, `activity_events`, and `weekly_reports`. Additional indexes are required for production performance on:
- `applications(applicant_id, internship_id, status)`
- `mentor_tasks(intern_id, status, due_date)`
- `attendance(intern_id, checked_in_at)`
- `interviews(candidate_id, provider_id, scheduled_at)`

### G. Are transactions correctly handled?
**PARTIALLY.** Code uses explicit `db.commit()` calls, but SQLite single-file write locking differs fundamentally from PostgreSQL Multi-Version Concurrency Control (MVCC).

### H. Can multiple workers safely use the database?
**NO (in SQLite mode) / YES (after Postgres refactoring).** In SQLite mode, multi-worker Uvicorn deployment produces `sqlite3.OperationalError: database is locked`. Once refactored to PostgreSQL connection pooling, multiple Uvicorn workers will execute concurrently and safely.

### I. Are connections properly closed/recycled?
**NO.** Currently, `get_db()` opens a new SQLite file handle per request and closes it immediately. There is no connection pooling, pool size management, or connection recycling.

### J. Does the application assume SQLite behavior anywhere?
**YES, EXTENSIVELY.**
1. `sqlite3` imported and used in `app/db.py`.
2. `PRAGMA table_info` and `sqlite_master` queried in `init_db()`.
3. `INSERT OR IGNORE` used in `internships`, `assessments`, `skills`, `db.py`.
4. `cursor.lastrowid` used in 35 locations across all routers.
5. `'UNIQUE constraint'` string check in `auth/router.py`, `mentors/router.py`, `applications/router.py`.

---

## 3. Required Database Refactoring Checklist

- [ ] Add `psycopg[binary]` or `asyncpg` to `requirements.txt`.
- [ ] Refactor `app/db.py` to create a SQLAlchemy `create_engine(os.getenv('DATABASE_URL'))` with connection pooling (`pool_size=10`, `max_overflow=20`).
- [ ] Convert `get_db()` context manager to yield SQLAlchemy sessions or standard DB-API pool connections.
- [ ] Synchronize Alembic migrations to generate version scripts for all 31 tables.
- [ ] Update all SQL `INSERT` statements returning IDs to append `RETURNING id` for PostgreSQL compatibility.
- [ ] Replace SQLite string exception checks with driver-agnostic error handling.
