import os
import re
import secrets
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.core.security import hash_password

logger = logging.getLogger(__name__)

# Global connection pool instance for PostgreSQL
_pg_pool = None


_db_initialized_path = None


def get_db_path() -> Path:
    return Path(os.getenv('INTERNFLOW_DB_PATH', Path(__file__).resolve().parents[1] / 'internflow.db'))


DEFAULT_POSTGRES_URL = "postgresql://internflow_user:InternFlow%402026@localhost:5432/internflow?options=-csearch_path%3Dapp_schema,public"


def get_db_url() -> str:
    # If a test explicitly set INTERNFLOW_DB_PATH in env, use SQLite test isolation unless FORCE_POSTGRES is set
    if 'INTERNFLOW_DB_PATH' in os.environ and os.getenv('FORCE_POSTGRES', '').lower() not in {'1', 'true', 'yes'}:
        if os.getenv('APP_ENV', 'development').lower() == 'production':
            raise ValueError('DATABASE_URL is required in production.')
        db_path = get_db_path()
        return f"sqlite:///{db_path}"

    url = os.getenv('DATABASE_URL', '').strip()
    if not url:
        if os.getenv('APP_ENV', 'development').lower() == 'production':
            raise ValueError('DATABASE_URL is required in production.')
        return DEFAULT_POSTGRES_URL
    if url.startswith("postgres://"):
        url = "postgresql://" + url[11:]
    return url


def is_unique_violation(error: Exception) -> bool:
    """Check if an exception represents a unique constraint violation across PostgreSQL and SQLite."""
    err_str = str(error)
    if "UNIQUE constraint" in err_str or "unique constraint" in err_str.lower() or "duplicate key" in err_str.lower():
        return True
    try:
        # pyrefly: ignore [missing-import]
        import psycopg
        if isinstance(error, psycopg.errors.UniqueViolation):
            return True
    except ImportError:
        pass
    try:
        if isinstance(error, sqlite3.IntegrityError) and "UNIQUE constraint" in err_str:
            return True
    except ImportError:
        pass
    return False


class PostgresRow(dict):
    """Row object compatible with sqlite3.Row & dict: access via key or integer index."""
    def __init__(self, mapping=None, keys=None, values=None):
        if mapping is not None:
            super().__init__(mapping)
            self._keys = list(mapping.keys())
        elif keys is not None and values is not None:
            super().__init__(zip(keys, values))
            self._keys = list(keys)
        else:
            super().__init__()
            self._keys = []

    def __getitem__(self, item):
        if isinstance(item, int):
            key = self._keys[item]
            return super().__getitem__(key)
        return super().__getitem__(item)

    def get(self, key, default=None):
        return super().get(key, default)


class CursorWrapper:
    def __init__(self, cursor, lastrowid=None):
        self._cursor = cursor
        self.lastrowid = lastrowid

    def fetchone(self):
        if not hasattr(self._cursor, "fetchone"):
            return None
        row = self._cursor.fetchone()
        if row is None:
            return None
        if isinstance(row, PostgresRow):
            return row
        if isinstance(row, dict):
            return PostgresRow(mapping=row)
        if hasattr(row, 'keys'):
            return PostgresRow(mapping=dict(row))
        if isinstance(row, (tuple, list)):
            names = [c[0] if isinstance(c, tuple) else getattr(c, 'name', str(i)) for i, c in enumerate(self._cursor.description)] if getattr(self._cursor, 'description', None) else []
            return PostgresRow(keys=names, values=row)
        return row

    def fetchall(self):
        if not hasattr(self._cursor, "fetchall"):
            return []
        rows = self._cursor.fetchall()
        if not rows:
            return []
        res = []
        names = [c[0] if isinstance(c, tuple) else getattr(c, 'name', str(i)) for i, c in enumerate(self._cursor.description)] if getattr(self._cursor, 'description', None) else []
        for row in rows:
            if isinstance(row, PostgresRow):
                res.append(row)
            elif isinstance(row, dict):
                res.append(PostgresRow(mapping=row))
            elif hasattr(row, 'keys'):
                res.append(PostgresRow(mapping=dict(row)))
            elif isinstance(row, (tuple, list)):
                res.append(PostgresRow(keys=names, values=row))
            else:
                res.append(row)
        return res

    def __iter__(self):
        rows = self.fetchall()
        return iter(rows)

    @property
    def description(self):
        return getattr(self._cursor, 'description', None)

    @property
    def rowcount(self):
        return getattr(self._cursor, 'rowcount', -1)


class DBConnectionWrapper:
    def __init__(self, conn, is_sqlite=False):
        self._conn = conn
        self.is_sqlite = is_sqlite

    def execute(self, sql: str, params=None):
        params = params or ()
        formatted_sql = sql
        if self.is_sqlite:
            formatted_sql = sql.replace("%s", "?")
        else:
            if params:
                out = []
                in_single = False
                in_double = False
                replaced = 0
                num_params = len(params)
                for ch in sql:
                    if ch == "'" and not in_double:
                        in_single = not in_single
                        out.append(ch)
                    elif ch == '"' and not in_single:
                        in_double = not in_double
                        out.append(ch)
                    elif ch == '?' and not in_single and not in_double and replaced < num_params:
                        out.append("%s")
                        replaced += 1
                    else:
                        out.append(ch)
                formatted_sql = "".join(out)
            if not self.is_sqlite:
                if not params and "%" in formatted_sql:
                    formatted_sql = formatted_sql.replace("%", "%%")
                formatted_sql = re.sub(r"datetime\('now',\s*'-(\d+)\s+hours'\)", r"(CURRENT_TIMESTAMP - INTERVAL '\1 hours')", formatted_sql, flags=re.IGNORECASE)
                formatted_sql = re.sub(r"datetime\('now'\)", r"CURRENT_TIMESTAMP", formatted_sql, flags=re.IGNORECASE)

        last_id = None
        sql_upper = formatted_sql.strip().upper()

        if not self.is_sqlite and sql_upper.startswith("DELETE FROM ") and " WHERE " not in sql_upper:
            tokens = formatted_sql.strip().split()
            if len(tokens) >= 3:
                table_name = tokens[2].rstrip(';').strip('"`\'')
                try:
                    cursor = self._conn.execute(f"TRUNCATE {table_name} RESTART IDENTITY CASCADE;")
                    return CursorWrapper(cursor)
                except Exception as exc:
                    logger.warning(f"TRUNCATE failed for {table_name}: {exc}")

        has_generated_id = not re.match(r"INSERT\s+INTO\s+(assessment_questions|internship_skills)\b", formatted_sql, re.IGNORECASE)
        if not self.is_sqlite and sql_upper.startswith("INSERT") and "RETURNING" not in sql_upper and "ON CONFLICT" not in sql_upper and has_generated_id:
            formatted_sql_returning = formatted_sql + " RETURNING id"
            try:
                cursor = self._conn.execute(formatted_sql_returning, params)
                row = cursor.fetchone()
                if row:
                    last_id = row[0] if isinstance(row, (tuple, list)) else (row.get('id') if hasattr(row, 'get') else getattr(row, 'id', None))
                self._sync_pg_sequence(formatted_sql)
                return CursorWrapper(cursor, lastrowid=last_id)
            except Exception as err:
                err_msg = str(err).lower()
                if "column \"id\" does not exist" in err_msg or "has no column named id" in err_msg:
                    pass
                else:
                    raise

        cursor = self._conn.execute(formatted_sql, params)
        if not self.is_sqlite and sql_upper.startswith("INSERT"):
            self._sync_pg_sequence(formatted_sql)
        return CursorWrapper(cursor, lastrowid=last_id)

    def _sync_pg_sequence(self, formatted_sql: str):
        if self.is_sqlite:
            return
        match = re.search(r"INSERT\s+INTO\s+([a-zA-Z0-9_]+)\b", formatted_sql, re.IGNORECASE)
        if match:
            tbl = match.group(1)
            if tbl not in ('assessment_questions', 'internship_skills', 'alembic_version'):
                try:
                    self._conn.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), COALESCE((SELECT MAX(id) FROM {tbl}), 1));")
                except Exception:
                    pass

    def executescript(self, sql: str):
        if self.is_sqlite:
            return self._conn.executescript(sql)
        else:
            with self._conn.cursor() as cur:
                return cur.execute(sql)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()


SCHEMA_PG = """
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('provider', 'mentor', 'intern')),
  organization TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_verified INTEGER NOT NULL DEFAULT 1,
  is_approved INTEGER NOT NULL DEFAULT 1,
  requires_2fa INTEGER NOT NULL DEFAULT 0,
  trust_level TEXT NOT NULL DEFAULT 'approved' CHECK (trust_level IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS internships (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  provider_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  work_mode TEXT NOT NULL,
  duration TEXT NOT NULL,
  stipend TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'archived')),
  openings INTEGER NOT NULL DEFAULT 1,
  deadline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS applications (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  internship_id BIGINT NOT NULL,
  applicant_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected', 'rejected')),
  resume_text TEXT,
  resume_file_name TEXT,
  resume_mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, applicant_id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS application_communications (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  applicant_id BIGINT NOT NULL,
  internship_id BIGINT NOT NULL,
  communication_type TEXT NOT NULL DEFAULT 'shortlist' CHECK (communication_type IN ('shortlist', 'rejection', 'selection', 'assessment', 'interview')),
  recipient_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE INDEX IF NOT EXISTS idx_application_communications_application ON application_communications(application_id, communication_type, status);
CREATE TABLE IF NOT EXISTS application_screening_results (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE,
  internship_id BIGINT NOT NULL,
  applicant_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'pending', 'processing', 'completed', 'failed')),
  overall_score INTEGER NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  skills_match INTEGER NOT NULL DEFAULT 0 CHECK (skills_match BETWEEN 0 AND 100),
  experience_match INTEGER NOT NULL DEFAULT 0 CHECK (experience_match BETWEEN 0 AND 100),
  education_match INTEGER NOT NULL DEFAULT 0 CHECK (education_match BETWEEN 0 AND 100),
  matched_skills TEXT,
  missing_skills TEXT,
  strengths TEXT,
  gaps TEXT,
  summary TEXT,
  recommendation TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  screened_at TEXT,
  raw_response TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_assignments (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  internship_id BIGINT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mentor_id, intern_id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  intern_id BIGINT NOT NULL,
  checked_in_at TEXT NOT NULL,
  checked_out_at TEXT,
  work_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_tasks (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  internship_id BIGINT,
  project_id BIGINT,
  master_task_id BIGINT,
  chunk_id BIGINT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date TEXT,
  start_date TEXT,
  estimated_hours REAL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'completed', 'changes_requested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS task_submissions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE,
  intern_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_feedback (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  task_id BIGINT,
  feedback TEXT NOT NULL,
  strengths TEXT,
  improvements TEXT,
  next_steps TEXT,
  is_read INTEGER NOT NULL DEFAULT 1,
  read_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id)
);
CREATE TABLE IF NOT EXISTS intern_mentor_feedback (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  internship_id BIGINT,
  feedback_type TEXT NOT NULL DEFAULT 'general' CHECK (feedback_type IN ('general', 'session', 'guidance', 'communication', 'technical_guidance', 'other')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE INDEX IF NOT EXISTS idx_intern_mentor_feedback_mentor ON intern_mentor_feedback(mentor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intern_mentor_feedback_intern ON intern_mentor_feedback(intern_id, created_at);
CREATE TABLE IF NOT EXISTS mentor_evaluations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  due_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS skills (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS internship_skills (
  internship_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  PRIMARY KEY (internship_id, skill_id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE TABLE IF NOT EXISTS candidate_skills (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  intern_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  source TEXT NOT NULL DEFAULT 'candidate_profile' CHECK (source IN ('candidate_profile', 'resume', 'assessment', 'project', 'mentor_observation', 'interview', 'final_evaluation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intern_id, skill_id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE TABLE IF NOT EXISTS mentor_skill_observations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  task_id BIGINT,
  skill_id BIGINT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('emerging', 'developing', 'proficient', 'strong')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE INDEX IF NOT EXISTS idx_internship_skills_internship ON internship_skills(internship_id);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_intern ON candidate_skills(intern_id);
CREATE INDEX IF NOT EXISTS idx_mentor_skill_obs_intern ON mentor_skill_observations(intern_id, created_at);

CREATE TABLE IF NOT EXISTS application_provider_decisions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE,
  provider_id BIGINT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('advance', 'reject', 'keep_in_review', 'move_to_assessment', 'invite_to_interview')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (provider_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  question_text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'short_answer', 'coding', 'scenario')),
  skill_id BIGINT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  options TEXT,
  correct_answer TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  provider_id BIGINT NOT NULL,
  internship_id BIGINT,
  pass_score INTEGER NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  assessment_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (assessment_id, question_id),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assessment_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  application_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'expired')),
  overall_score INTEGER DEFAULT 0,
  passed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE IF NOT EXISTS assessment_responses (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  response_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS interviews (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL,
  internship_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  interviewer_id BIGINT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  meeting_link TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (interviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS interview_scorecards (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  interview_id BIGINT NOT NULL UNIQUE,
  candidate_id BIGINT NOT NULL,
  interviewer_id BIGINT NOT NULL,
  technical_skills INTEGER CHECK (technical_skills BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  problem_solving INTEGER CHECK (problem_solving BETWEEN 1 AND 5),
  role_understanding INTEGER CHECK (role_understanding BETWEEN 1 AND 5),
  relevant_skills INTEGER CHECK (relevant_skills BETWEEN 1 AND 5),
  overall_recommendation TEXT NOT NULL CHECK (overall_recommendation IN ('advance', 'reject', 'further_review')),
  evidence_notes TEXT,
  skill_evaluations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (interview_id) REFERENCES interviews(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (interviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS internship_goals (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  skill_id BIGINT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  goal_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES internship_goals(id)
);

CREATE TABLE IF NOT EXISTS skill_evidence (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  candidate_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('resume', 'assessment', 'interview', 'task', 'mentor_observation', 'final_evaluation')),
  source_id BIGINT,
  title TEXT NOT NULL,
  details TEXT,
  score INTEGER,
  level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS final_evaluations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL UNIQUE,
  intern_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  technical_skills INTEGER CHECK (technical_skills BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  problem_solving INTEGER CHECK (problem_solving BETWEEN 1 AND 5),
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 5),
  task_execution INTEGER CHECK (task_execution BETWEEN 1 AND 5),
  learning_adaptability INTEGER CHECK (learning_adaptability BETWEEN 1 AND 5),
  professionalism INTEGER CHECK (professionalism BETWEEN 1 AND 5),
  strengths TEXT,
  areas_for_improvement TEXT,
  overall_evaluation TEXT NOT NULL CHECK (overall_evaluation IN ('exceeds_expectations', 'meets_expectations', 'needs_improvement')),
  skill_observations TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS verified_skills (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  intern_id BIGINT NOT NULL,
  skill_id BIGINT NOT NULL,
  verification_rule TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intern_id, skill_id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS internship_outcomes (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL UNIQUE,
  intern_id BIGINT NOT NULL,
  internship_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partially_completed', 'incomplete')),
  duration_weeks INTEGER DEFAULT 8,
  goals_completed INTEGER DEFAULT 0,
  total_goals INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  final_evaluation_id BIGINT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (final_evaluation_id) REFERENCES final_evaluations(id)
);

CREATE TABLE IF NOT EXISTS skill_passports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  candidate_id BIGINT NOT NULL UNIQUE,
  passport_code TEXT NOT NULL UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  internship_id BIGINT NOT NULL,
  mentor_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  deliverable TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date TEXT,
  end_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, mentor_id, title),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS master_tasks (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  estimated_hours REAL CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_chunks (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  master_task_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_hours REAL CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (master_task_id) REFERENCES master_tasks(id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  certificate_id TEXT NOT NULL UNIQUE,
  outcome_id BIGINT NOT NULL UNIQUE,
  intern_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  internship_id BIGINT NOT NULL,
  candidate_name TEXT NOT NULL,
  internship_title TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  issue_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_skills TEXT NOT NULL,
  verification_url TEXT NOT NULL,
  file_path TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outcome_id) REFERENCES internship_outcomes(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id BIGINT NOT NULL,
  actor_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mentor_id BIGINT NOT NULL,
  intern_id BIGINT,
  project_id BIGINT,
  task_id BIGINT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_activity_events_mentor ON activity_events(mentor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  intern_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  internship_id BIGINT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  summary TEXT NOT NULL,
  completed_work TEXT NOT NULL,
  pending_work TEXT NOT NULL,
  achievements TEXT NOT NULL,
  challenges TEXT NOT NULL,
  next_week_focus TEXT NOT NULL,
  mentor_attention_items TEXT NOT NULL,
  metrics TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'failed')),
  ai_status TEXT NOT NULL DEFAULT 'completed' CHECK (ai_status IN ('completed', 'fallback', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, week_start, week_end),
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_intern ON weekly_reports(intern_id, week_start DESC);
"""


def seed_phase20_demo_data(connection):
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return

    # Seed core skills
    skill_names = ['python', 'fastapi', 'sql', 'react', 'docker']
    skill_ids = {}
    for name in skill_names:
        connection.execute('INSERT INTO skills (name, category) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING', (name, 'Software Development'))
        row = connection.execute('SELECT id FROM skills WHERE name = %s', (name,)).fetchone()
        if row:
            skill_ids[name] = row[0]

    # Seed Questions Bank
    questions_data = [
        ("What is 2+2 in Python?", "mcq", skill_ids.get('python'), "easy", '["3", "4"]', "4"),
        ("What is the data type returned by type([]) in Python?", "mcq", skill_ids.get('python'), "easy", '["<class \'list\'>", "<class \'dict\'>", "<class \'tuple\'>", "<class \'set\'>"]', "<class 'list'>"),
        ("Which decorator is used in FastAPI to define an HTTP GET endpoint?", "mcq", skill_ids.get('fastapi'), "easy", '["@app.get()", "@app.route()", "@app.post()", "@app.endpoint()"]', "@app.get()"),
        ("Which SQL clause is used to filter aggregated group results?", "mcq", skill_ids.get('sql'), "medium", '["WHERE", "HAVING", "GROUP BY", "ORDER BY"]', "HAVING"),
        ("What is the main purpose of Docker containers?", "mcq", skill_ids.get('docker'), "easy", '["Isolated runtime environment", "Database storage", "Frontend rendering", "Code compilation"]', "Isolated runtime environment"),
    ]

    q_ids = []
    for q_text, q_type, q_skill, q_diff, q_opts, q_ans in questions_data:
        existing = connection.execute('SELECT id FROM questions WHERE question_text = %s', (q_text,)).fetchone()
        if existing:
            q_ids.append(existing[0])
        else:
            cur = connection.execute(
                'INSERT INTO questions (question_text, type, skill_id, difficulty, options, correct_answer) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id',
                (q_text, q_type, q_skill, q_diff, q_opts, q_ans),
            )
            ret_id = cur.fetchone()[0]
            q_ids.append(ret_id)

    # Seed Assessment
    provider = connection.execute("SELECT id FROM users WHERE role = 'provider' LIMIT 1").fetchone()
    if provider:
        p_id = provider[0]
        ass_existing = connection.execute('SELECT id FROM assessments WHERE provider_id = %s AND title = %s', (p_id, 'Backend Developer Competency Assessment')).fetchone()
        if not ass_existing:
            cur = connection.execute(
                'INSERT INTO assessments (title, description, provider_id, pass_score) VALUES (%s, %s, %s, %s) RETURNING id',
                ('Backend Developer Competency Assessment', 'Evaluates Python, FastAPI, SQL, and Docker core skills.', p_id, 70),
            )
            ass_id = cur.fetchone()[0]
            for qid in q_ids:
                connection.execute('INSERT INTO assessment_questions (assessment_id, question_id) VALUES (%s, %s) ON CONFLICT (assessment_id, question_id) DO NOTHING', (ass_id, qid))


def init_db():
    global _db_initialized_path
    db_url = get_db_url()
    if _db_initialized_path == db_url:
        return
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        try:
            # pyrefly: ignore [missing-import]
            import psycopg
            # pyrefly: ignore [missing-import]
            from psycopg.rows import dict_row
            with psycopg.connect(db_url, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute("CREATE SCHEMA IF NOT EXISTS app_schema;")
                    cur.execute(SCHEMA_PG)
                conn.commit()
                wrapped = DBConnectionWrapper(conn, is_sqlite=False)
                if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() not in {'0', 'false', 'no'}:
                    seed_phase20_demo_data(wrapped)
                conn.commit()
            _db_initialized_path = db_url
            logger.info(f"[PostgreSQL DB] Intialized database schema at {db_url}")
            return
        except Exception as err:
            logger.warning(f"[PostgreSQL DB Warning] PostgreSQL connection failed: {err}. Falling back to SQLite.")

    # SQLite fallback mode
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        # Convert schema for sqlite
        sqlite_schema = SCHEMA_PG.replace("BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        sqlite_schema = sqlite_schema.replace("TIMESTAMPTZ", "TEXT").replace("BOOLEAN", "INTEGER")
        sqlite_schema = sqlite_schema.replace("DEFAULT FALSE", "DEFAULT 0").replace("DEFAULT TRUE", "DEFAULT 1")
        connection.executescript(sqlite_schema)
        wrapped = DBConnectionWrapper(connection, is_sqlite=True)
        if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() not in {'0', 'false', 'no'}:
            seed_phase20_demo_data(wrapped)
        connection.commit()
    _db_initialized_path = db_url


def seed_mentor_demo_data(connection, mentor_id):
    """Give local mentor accounts a visible workflow until provider assignment UI exists."""
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return
    existing = connection.execute(
        'SELECT 1 FROM mentor_assignments WHERE mentor_id = %s LIMIT 1', (mentor_id,)
    ).fetchone()
    if existing:
        return

    intern_ids = []
    intern_specs = [('Rahul Sharma', 'rahul'), ('Ananya Iyer', 'ananya'), ('Kabir Singh', 'kabir')]
    for full_name, handle in intern_specs:
        email = f'mentor-{mentor_id}-{handle}@dev.in'
        connection.execute(
            'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING',
            (full_name, email, hash_password(secrets.token_urlsafe(24)), 'intern', 'InternFlow Demo'),
        )
        row = connection.execute('SELECT id FROM users WHERE email = %s', (email,)).fetchone()
        if row:
            intern_ids.append(row[0])

    for intern_id in intern_ids:
        connection.execute('INSERT INTO mentor_assignments (mentor_id, intern_id, status) VALUES (%s, %s, %s) ON CONFLICT (mentor_id, intern_id) DO NOTHING', (mentor_id, intern_id, 'active'))

    if not intern_ids:
        return

    task_specs = [
        (intern_ids[0], 'Build authentication flow', 'Implement login, token refresh, and protected routes.', 'high', '2026-10-02', 'submitted'),
        (intern_ids[0], 'Write API documentation', 'Document the internship and application endpoints.', 'normal', '2026-10-05', 'completed'),
        (intern_ids[1], 'Create progress summary', 'Summarize the first sprint and identify blockers.', 'normal', '2026-10-04', 'in_progress'),
        (intern_ids[2], 'Add test coverage', 'Add focused tests for the dashboard data layer.', 'high', '2026-10-01', 'assigned'),
    ]
    task_ids = []
    for intern_id, title, description, priority, due_date, task_status in task_specs:
        cursor = connection.execute('INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, priority, due_date, status) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id', (mentor_id, intern_id, title, description, priority, due_date, task_status))
        ret = cursor.fetchone()
        tid = ret[0] if ret else ret["id"]
        task_ids.append(tid)

    if task_ids:
        connection.execute("INSERT INTO task_submissions (task_id, intern_id, content, status, submitted_at) VALUES (%s, %s, %s, 'pending', CURRENT_TIMESTAMP) ON CONFLICT (task_id) DO NOTHING", (task_ids[0], intern_ids[0], 'Authentication flow is ready for review in the feature branch.'))
        connection.execute('INSERT INTO mentor_feedback (mentor_id, intern_id, task_id, feedback, strengths, improvements, next_steps) VALUES (%s, %s, %s, %s, %s, %s, %s)', (mentor_id, intern_ids[0], task_ids[1], 'Strong structure and clear examples. Keep error responses consistent across endpoints.', 'Clear technical writing', 'Consistency in edge-case examples', 'Add one authenticated request example per endpoint'))
        connection.execute("INSERT INTO mentor_evaluations (mentor_id, intern_id, summary, status, due_date) VALUES (%s, %s, %s, 'draft', %s)", (mentor_id, intern_ids[1], 'Midpoint evaluation is ready to complete.', '2026-10-07'))


def seed_intern_demo_data(connection, intern_id):
    """Give local intern accounts an active mentorship until provider assignment UI exists."""
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return
    existing = connection.execute(
        "SELECT 1 FROM mentor_assignments WHERE intern_id = %s AND status = 'active' LIMIT 1",
        (intern_id,),
    ).fetchone()
    if existing:
        return

    email = f'mentor-{intern_id}-priya@dev.in'
    connection.execute(
        'INSERT INTO users (full_name, email, password_hash, role, organization) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING',
        ('Priya Menon', email, hash_password(secrets.token_urlsafe(24)), 'mentor', 'InternFlow Demo'),
    )
    row = connection.execute('SELECT id FROM users WHERE email = %s', (email,)).fetchone()
    if row:
        mentor_id = row[0]
        connection.execute(
            'INSERT INTO mentor_assignments (mentor_id, intern_id, status) VALUES (%s, %s, %s) ON CONFLICT (mentor_id, intern_id) DO NOTHING',
            (mentor_id, intern_id, 'active'),
        )


@contextmanager
def get_db():
    init_db()
    db_url = get_db_url()
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        connection = None
        try:
            # pyrefly: ignore [missing-import]
            import psycopg
            # pyrefly: ignore [missing-import]
            from psycopg.rows import dict_row
            connection = psycopg.connect(db_url, row_factory=dict_row)
        except Exception as err:
            logger.warning(f"[PostgreSQL DB Warning] Failed to connect to PostgreSQL ({err}); falling back to SQLite.")

        if connection is not None:
            wrapper = DBConnectionWrapper(connection, is_sqlite=False)
            try:
                yield wrapper
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()
            return

    # SQLite fallback
    db_path = get_db_path()
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    wrapper = DBConnectionWrapper(connection, is_sqlite=True)
    try:
        yield wrapper
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
