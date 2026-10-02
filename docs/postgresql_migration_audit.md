# InternFlow — Phase 3 SQLite Dependency & PostgreSQL Migration Audit

> **Document Type:** Phase 3 SQLite Dependency Audit  
> **Target Production Engine:** PostgreSQL 15+  
> **Source Engine:** SQLite 3 (`internflow.db` via standard library `sqlite3`)

---

## 1. Current Database Architecture

```text
Database:               SQLite 3 (File: internflow.db)
Connection mechanism:   Python standard library `sqlite3.connect(get_db_path())` with sqlite3.Row
Database location:      `INTERNFLOW_DB_PATH` or `backend/internflow.db`
Configuration source:   `app/db.py` (`get_db_path()`, `get_db()`)
Schema location:        `app/db.py` (Inline DDL string `SCHEMA` containing 31 tables)
Migration system:       Manual `_ensure_column()` & `_migrate_candidate_skills_schema()` helper functions; Alembic configured but unused at runtime
Transaction model:      Per-request `get_db()` context manager with manual `db.commit()`
Test database:          Temporary SQLite database files / per-test `internflow.db` file overrides
```

---

## 2. SQLite Usage Inventory

| File | Line | SQLite Usage | Production/Test | PostgreSQL Impact |
| :--- | ---: | :----------- | :-------------- | :---------------- |
| `backend/app/db.py` | 3 | `import sqlite3` | Production | Must replace with SQLAlchemy / Psycopg2 driver |
| `backend/app/db.py` | 583 | `sqlite3.connect(get_db_path())` | Production | Schema check needs DB-agnostic or Alembic approach |
| `backend/app/db.py` | 591 | `sqlite3.connect(get_db_path())` | Production | Schema migration check needs DB-agnostic approach |
| `backend/app/db.py` | 674 | `sqlite3.connect(db_path)` | Production | DB initialization connection must use Postgres connection pool |
| `backend/app/db.py` | 773 | `sqlite3.connect(get_db_path())` | Production | `get_db()` context manager must yield Postgres pool connection/session |
| `backend/app/db.py` | 774 | `connection.row_factory = sqlite3.Row` | Production | Postgres query results must map to dicts / rows |
| `backend/tests/test_phase20_interviews.py` | 4 | `import sqlite3` | Test | Test fixture cleanup connects directly via `sqlite3` |
| `backend/tests/test_phase20_interviews.py` | 15 | `sqlite3.connect(db_path)` | Test | Test cleanup requires DB-agnostic table truncate |

---

## 3. SQL Incompatibilities

| File | Line | SQLite Syntax | PostgreSQL Change Required | Risk |
| :--- | ---: | :------------ | :------------------------- | :--- |
| `backend/app/internships/router.py` | 141 | `INSERT OR IGNORE INTO internship_skills` | `INSERT INTO internship_skills ... ON CONFLICT (internship_id, skill_id) DO NOTHING` | Medium |
| `backend/app/assessments/router.py` | 110 | `INSERT OR IGNORE INTO assessment_questions` | `INSERT INTO assessment_questions ... ON CONFLICT (assessment_id, question_id) DO NOTHING` | Medium |
| `backend/app/assessments/router.py` | 306 | `INSERT OR IGNORE INTO assessment_questions` | `INSERT INTO assessment_questions ... ON CONFLICT (assessment_id, question_id) DO NOTHING` | Medium |
| `backend/app/db.py` | 630 | `INSERT OR IGNORE INTO skills` | `INSERT INTO skills ... ON CONFLICT (name) DO NOTHING` | Low |
| `backend/app/db.py` | 668 | `INSERT OR IGNORE INTO assessment_questions` | `INSERT INTO assessment_questions ... ON CONFLICT (assessment_id, question_id) DO NOTHING` | Low |
| `backend/app/db.py` | 723 | `INSERT OR IGNORE INTO users` | `INSERT INTO users ... ON CONFLICT (email) DO NOTHING` | Low |
| `backend/app/db.py` | 729 | `INSERT OR IGNORE INTO mentor_assignments` | `INSERT INTO mentor_assignments ... ON CONFLICT (mentor_id, intern_id) DO NOTHING` | Low |
| `backend/app/db.py` | 760 | `INSERT OR IGNORE INTO users` | `INSERT INTO users ... ON CONFLICT (email) DO NOTHING` | Low |
| `backend/app/db.py` | 765 | `INSERT OR IGNORE INTO mentor_assignments` | `INSERT INTO mentor_assignments ... ON CONFLICT (mentor_id, intern_id) DO NOTHING` | Low |
| All 15 API Routers | Multiple | `?` positional parameters | Change to `%s` (or `$1, $2` depending on driver) | High |
| All 15 API Routers | 31 occurrences | `cursor.lastrowid` | Append `RETURNING id` to `INSERT` statements and fetch result | High |

---

## 4. Schema Incompatibilities

| Table | Current Definition | PostgreSQL Consideration |
| :---- | :----------------- | :----------------------- |
| All 31 Tables | `id INTEGER PRIMARY KEY AUTOINCREMENT` | Replace `AUTOINCREMENT` with `BIGSERIAL PRIMARY KEY` or `INTEGER GENERATED ALWAYS AS IDENTITY` |
| `users`, `applications`, `mentor_feedback`, etc. | `is_active INTEGER NOT NULL DEFAULT 1` | Change SQLite `INTEGER` booleans to native PostgreSQL `BOOLEAN NOT NULL DEFAULT TRUE` |
| `users`, `internships`, `applications`, etc. | `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP` | Change `TEXT` timestamps to native PostgreSQL `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `application_screening_results`, `certificates` | `matched_skills TEXT`, `verified_skills TEXT` | Can convert `TEXT` storing JSON to PostgreSQL native `JSONB` for indexing/querying |
| Dynamic migration helpers | `PRAGMA table_info(...)`, `sqlite_master` | Replace with standard Alembic versioned migrations |

---

## 5. Transaction & Error-Handling Issues

| File | Current Behavior | PostgreSQL Consideration |
| :--- | :--------------- | :----------------------- |
| `backend/app/auth/router.py:44` | `if 'UNIQUE constraint' in str(error):` | Catch `psycopg2.errors.UniqueViolation` or `sqlalchemy.exc.IntegrityError` |
| `backend/app/mentors/router.py:105` | `if 'UNIQUE constraint' in str(error):` | Catch `psycopg2.errors.UniqueViolation` or `sqlalchemy.exc.IntegrityError` |
| `backend/app/mentors/router.py:818` | `if "UNIQUE constraint" in str(error):` | Catch `psycopg2.errors.UniqueViolation` or `sqlalchemy.exc.IntegrityError` |
| `backend/app/applications/router.py:165` | `if 'UNIQUE constraint' in str(error):` | Catch `psycopg2.errors.UniqueViolation` or `sqlalchemy.exc.IntegrityError` |
| `backend/app/db.py:770` | Direct `sqlite3.connect` per request | Replace with connection pool (`sqlalchemy.pool.QueuePool`) to handle concurrent workers |

---

## 6. Configuration Issues

**DATABASE_URL Status:**
- `DATABASE_URL=postgresql://user:password@localhost:5432/internflow_prod` is defined in `.env` and `.env.example`.
- **CRITICAL FINDING:** `DATABASE_URL` is **NOT USED BY THE APPLICATION RUNTIME**. `app/db.py` hardcodes `get_db_path()` which returns a path to `internflow.db` (SQLite). `DATABASE_URL` is only read by `alembic/env.py`.

---

## 7. Test / Database Dependencies

- **Production DB Dependencies:** `app/db.py` (6 direct `sqlite3` calls), 15 routers (31 `cursor.lastrowid` calls, 3 SQLite `UNIQUE constraint` checks, 3 `INSERT OR IGNORE` calls).
- **Test-Only DB Dependencies:** `tests/test_phase20_interviews.py` (2 direct `sqlite3` calls, `sqlite_master` and `sqlite_sequence` references). All other test files call `get_db()` or test client endpoints.

---

## 8. Migration Risks

1. **`cursor.lastrowid` Failures:** 31 router locations rely on `cursor.lastrowid`. In PostgreSQL, `cursor.lastrowid` returns `None` unless `RETURNING id` is appended.
2. **PostgreSQL Exception Matching:** 4 router locations catch string `'UNIQUE constraint'`. Under PostgreSQL, exceptions emit `UniqueViolation`, causing unhandled HTTP 500 errors if not updated.
3. **Multi-Worker Concurrency:** SQLite locks the entire database file during writes, creating bottlenecks. PostgreSQL MVCC will allow concurrent Uvicorn workers once connection pooling is introduced in `app/db.py`.
