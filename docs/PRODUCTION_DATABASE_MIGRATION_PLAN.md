# InternFlow — Production Database Migration Plan (PostgreSQL)

> **Document Type:** Step-by-Step Production Migration Plan  
> **Target Production Engine:** PostgreSQL 15+  
> **Source Engine:** SQLite 3 (`internflow.db`)

---

## 1. Migration Overview & Strategy

This plan details the exact, reproducible execution path to migrate InternFlow from local SQLite 3 to a high-availability production PostgreSQL database without data loss or schema mismatches.

---

## 2. Step-by-Step Execution Plan

### Phase 1: Dependency & Configuration Updates
1. Add production PostgreSQL drivers to `backend/requirements.txt`:
   ```text
   psycopg[binary]>=3.1.0
   sqlalchemy>=2.0.0
   alembic>=1.13.0
   ```
2. Update `backend/app/core/config.py` to read `DATABASE_URL` with a production default:
   ```python
   DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost:5432/internflow_prod")
   ```

### Phase 2: Refactor Database Access Layer (`app/db.py`)
1. Create SQLAlchemy Engine and Session factory in `app/db.py`:
   ```python
   from sqlalchemy import create_engine
   from sqlalchemy.orm import sessionmaker
   
   engine = create_engine(
       DATABASE_URL,
       pool_size=10,
       max_overflow=20,
       pool_pre_ping=True,
       pool_recycle=1800,
   )
   SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
   ```
2. Update `get_db()` context manager to handle connection checkout/checkin safely:
   ```python
   @contextmanager
   def get_db():
       connection = engine.raw_connection()
       try:
           yield connection
       finally:
           connection.close()
   ```

### Phase 3: SQL Syntax & Router Compatibility Refactoring
1. Update raw SQL `INSERT` statements returning newly created IDs to append `RETURNING id`.
2. Update router code extracting auto-increment IDs:
   - Change `user_id = cursor.lastrowid` to `user_id = cursor.fetchone()[0]`.
3. Replace all instances of `INSERT OR IGNORE INTO <table> ...` with ANSI SQL / Postgres syntax:
   - `INSERT INTO <table> ... ON CONFLICT (...) DO NOTHING`.
4. Update exception string checks:
   - Replace `if 'UNIQUE constraint' in str(error):` with driver-agnostic handling or `sqlalchemy.exc.IntegrityError`.

### Phase 4: Schema Synchronization & Alembic Migrations
1. Synchronize Alembic metadata with all 31 application tables.
2. Generate comprehensive PostgreSQL migration script:
   ```bash
   cd backend
   alembic revision --autogenerate -m "PostgreSQL full production schema sync"
   alembic upgrade head
   ```

### Phase 5: Data Migration (SQLite -> PostgreSQL)
1. Write a standalone Python data migration script (`scripts/migrate_sqlite_to_postgres.py`):
   - Reads existing rows from SQLite `internflow.db` table by table in dependency order:
     `users -> internships -> applications -> mentor_assignments -> attendance -> mentor_tasks -> task_submissions -> mentor_feedback -> skills -> ... -> certificates`.
   - Inserts records into PostgreSQL, explicitly setting sequence generator values (`SELECT setval(pg_get_serial_sequence('users', 'id'), coalesce(max(id), 1)) FROM users;`).

### Phase 6: Validation & Rollback Criteria
1. **Verification Command:**
   Run full test suite against PostgreSQL container:
   ```bash
   DATABASE_URL=postgresql://test:test@localhost:5432/internflow_test python -m pytest
   ```
2. **Success Gate:** All 155 tests MUST pass against PostgreSQL.
3. **Rollback Plan:**
   If migration encounters unrecoverable errors, revert `DATABASE_URL` to point back to SQLite `internflow.db` snapshot. Backup snapshot MUST be taken prior to migration execution (`cp backend/internflow.db backend/internflow.db.bak`).
