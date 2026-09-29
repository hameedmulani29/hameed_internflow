import os
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.core.security import hash_password


def get_db_path() -> Path:
    return Path(os.getenv('INTERNFLOW_DB_PATH', Path(__file__).resolve().parents[1] / 'internflow.db'))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS internships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internship_id INTEGER NOT NULL,
  applicant_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected', 'rejected')),
  resume_text TEXT,
  resume_file_name TEXT,
  resume_mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, applicant_id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS application_communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  applicant_id INTEGER NOT NULL,
  internship_id INTEGER NOT NULL,
  communication_type TEXT NOT NULL DEFAULT 'shortlist' CHECK (communication_type IN ('shortlist', 'rejection', 'selection', 'assessment', 'interview')),
  recipient_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE INDEX IF NOT EXISTS idx_application_communications_application ON application_communications(application_id, communication_type, status);
CREATE TABLE IF NOT EXISTS application_screening_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL UNIQUE,
  internship_id INTEGER NOT NULL,
  applicant_id INTEGER NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  screened_at TEXT,
  raw_response TEXT,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (applicant_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  internship_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mentor_id, intern_id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intern_id INTEGER NOT NULL,
  checked_in_at TEXT NOT NULL,
  checked_out_at TEXT,
  work_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  internship_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'completed', 'changes_requested')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS task_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE,
  intern_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mentor_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  task_id INTEGER,
  feedback TEXT NOT NULL,
  strengths TEXT,
  improvements TEXT,
  next_steps TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id)
);
CREATE TABLE IF NOT EXISTS intern_mentor_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  internship_id INTEGER,
  feedback_type TEXT NOT NULL DEFAULT 'general' CHECK (feedback_type IN ('general', 'session', 'guidance', 'communication', 'technical_guidance', 'other')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);
CREATE INDEX IF NOT EXISTS idx_intern_mentor_feedback_mentor ON intern_mentor_feedback(mentor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_intern_mentor_feedback_intern ON intern_mentor_feedback(intern_id, created_at);
CREATE TABLE IF NOT EXISTS mentor_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS internship_skills (
  internship_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  PRIMARY KEY (internship_id, skill_id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE TABLE IF NOT EXISTS candidate_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intern_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'candidate_profile' CHECK (source IN ('candidate_profile', 'resume', 'assessment', 'project', 'mentor_observation', 'interview', 'final_evaluation')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intern_id, skill_id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE TABLE IF NOT EXISTS mentor_skill_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  task_id INTEGER,
  skill_id INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('emerging', 'developing', 'proficient', 'strong')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE INDEX IF NOT EXISTS idx_internship_skills_internship ON internship_skills(internship_id);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_intern ON candidate_skills(intern_id);
CREATE INDEX IF NOT EXISTS idx_mentor_skill_obs_intern ON mentor_skill_observations(intern_id, created_at);

CREATE TABLE IF NOT EXISTS application_provider_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL UNIQUE,
  provider_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('advance', 'reject', 'keep_in_review', 'move_to_assessment', 'invite_to_interview')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (provider_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'short_answer', 'coding', 'scenario')),
  skill_id INTEGER,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  options TEXT,
  correct_answer TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  provider_id INTEGER NOT NULL,
  internship_id INTEGER,
  pass_score INTEGER NOT NULL DEFAULT 70 CHECK (pass_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  assessment_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (assessment_id, question_id),
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  application_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'expired')),
  overall_score INTEGER DEFAULT 0,
  passed BOOLEAN DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE IF NOT EXISTS assessment_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  response_text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT 0,
  score INTEGER DEFAULT 0,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL,
  internship_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  interviewer_id INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  meeting_link TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (interviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS interview_scorecards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interview_id INTEGER NOT NULL UNIQUE,
  candidate_id INTEGER NOT NULL,
  interviewer_id INTEGER NOT NULL,
  technical_skills INTEGER CHECK (technical_skills BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  problem_solving INTEGER CHECK (problem_solving BETWEEN 1 AND 5),
  role_understanding INTEGER CHECK (role_understanding BETWEEN 1 AND 5),
  relevant_skills INTEGER CHECK (relevant_skills BETWEEN 1 AND 5),
  overall_recommendation TEXT NOT NULL CHECK (overall_recommendation IN ('advance', 'reject', 'further_review')),
  evidence_notes TEXT,
  skill_evaluations TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (interview_id) REFERENCES interviews(id),
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (interviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS internship_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  intern_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  skill_id INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES internship_goals(id)
);

CREATE TABLE IF NOT EXISTS skill_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('resume', 'assessment', 'interview', 'task', 'mentor_observation', 'final_evaluation')),
  source_id INTEGER,
  title TEXT NOT NULL,
  details TEXT,
  score INTEGER,
  level TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS final_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE,
  intern_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS verified_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intern_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL,
  verification_rule TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intern_id, skill_id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS internship_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL UNIQUE,
  intern_id INTEGER NOT NULL,
  internship_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partially_completed', 'incomplete')),
  duration_weeks INTEGER DEFAULT 8,
  goals_completed INTEGER DEFAULT 0,
  total_goals INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  final_evaluation_id INTEGER,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES mentor_assignments(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (final_evaluation_id) REFERENCES final_evaluations(id)
);

CREATE TABLE IF NOT EXISTS skill_passports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL UNIQUE,
  passport_code TEXT NOT NULL UNIQUE,
  is_public BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES users(id)
);

-- ============ Mentorship Execution Engine: Phase 1 foundation ============
-- Internship → Project → Master Tasks → Project Chunks.
-- Phase 2 (distribution engine) will map chunks onto intern-specific
-- mentor_tasks; do not add that link until the distribution phase.

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internship_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  deliverable TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (internship_id, mentor_id, title),
  FOREIGN KEY (internship_id) REFERENCES internships(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS master_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  estimated_hours REAL CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS project_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_task_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_hours REAL CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  sequence INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (master_task_id) REFERENCES master_tasks(id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id TEXT NOT NULL UNIQUE,
  outcome_id INTEGER NOT NULL UNIQUE,
  intern_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  internship_id INTEGER NOT NULL,
  candidate_name TEXT NOT NULL,
  internship_title TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  issue_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_skills TEXT NOT NULL,
  verification_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outcome_id) REFERENCES internship_outcomes(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (provider_id) REFERENCES users(id),
  FOREIGN KEY (internship_id) REFERENCES internships(id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mentor_id INTEGER NOT NULL,
  intern_id INTEGER,
  project_id INTEGER,
  task_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id),
  FOREIGN KEY (mentor_id) REFERENCES users(id),
  FOREIGN KEY (intern_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES mentor_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_activity_events_mentor ON activity_events(mentor_id, created_at DESC);
"""


def _ensure_column(table_name, column_name, ddl):
    with sqlite3.connect(get_db_path()) as connection:
        columns = connection.execute(f'PRAGMA table_info({table_name})').fetchall()
        if not any(column[1] == column_name for column in columns):
            connection.execute(f'ALTER TABLE {table_name} ADD COLUMN {ddl}')
            connection.commit()


def _migrate_candidate_skills_schema():
    with sqlite3.connect(get_db_path()) as connection:
        table_sql = connection.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'candidate_skills'").fetchone()
        if not table_sql:
            return
        schema_sql = table_sql[0] or ''
        if "interview" in schema_sql and "final_evaluation" in schema_sql:
            return

        connection.execute('ALTER TABLE candidate_skills RENAME TO candidate_skills_legacy')
        connection.execute('''
            CREATE TABLE candidate_skills (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              intern_id INTEGER NOT NULL,
              skill_id INTEGER NOT NULL,
              source TEXT NOT NULL DEFAULT 'candidate_profile' CHECK (source IN ('candidate_profile', 'resume', 'assessment', 'project', 'mentor_observation', 'interview', 'final_evaluation')),
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE (intern_id, skill_id),
              FOREIGN KEY (intern_id) REFERENCES users(id),
              FOREIGN KEY (skill_id) REFERENCES skills(id)
            )
        ''')
        connection.execute('''
            INSERT INTO candidate_skills (id, intern_id, skill_id, source, created_at)
            SELECT id, intern_id, skill_id, source, created_at
            FROM candidate_skills_legacy
        ''')
        connection.execute('DROP TABLE candidate_skills_legacy')
        connection.execute('CREATE INDEX IF NOT EXISTS idx_candidate_skills_intern ON candidate_skills(intern_id)')
        connection.commit()


def seed_phase20_demo_data(connection):
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return

    # Seed core skills
    skill_names = ['python', 'fastapi', 'sql', 'react', 'docker']
    skill_ids = {}
    for name in skill_names:
        connection.execute('INSERT OR IGNORE INTO skills (name, category) VALUES (?, ?)', (name, 'Software Development'))
        row = connection.execute('SELECT id FROM skills WHERE name = ?', (name,)).fetchone()
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
        existing = connection.execute('SELECT id FROM questions WHERE question_text = ?', (q_text,)).fetchone()
        if existing:
            q_ids.append(existing[0])
        else:
            cur = connection.execute(
                'INSERT INTO questions (question_text, type, skill_id, difficulty, options, correct_answer) VALUES (?, ?, ?, ?, ?, ?)',
                (q_text, q_type, q_skill, q_diff, q_opts, q_ans),
            )
            q_ids.append(cur.lastrowid)

    # Seed Assessment
    provider = connection.execute("SELECT id FROM users WHERE role = 'provider' LIMIT 1").fetchone()
    if provider:
        p_id = provider[0]
        ass_existing = connection.execute('SELECT id FROM assessments WHERE provider_id = ? AND title = ?', (p_id, 'Backend Developer Competency Assessment')).fetchone()
        if not ass_existing:
            cur = connection.execute(
                'INSERT INTO assessments (title, description, provider_id, pass_score) VALUES (?, ?, ?, ?)',
                ('Backend Developer Competency Assessment', 'Evaluates Python, FastAPI, SQL, and Docker core skills.', p_id, 70),
            )
            ass_id = cur.lastrowid
            for qid in q_ids:
                connection.execute('INSERT OR IGNORE INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)', (ass_id, qid))


def init_db():
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.executescript(SCHEMA)
        _ensure_column('users', 'is_active', 'is_active INTEGER NOT NULL DEFAULT 1')
        _ensure_column('users', 'is_verified', 'is_verified INTEGER NOT NULL DEFAULT 1')
        _ensure_column('users', 'is_approved', 'is_approved INTEGER NOT NULL DEFAULT 1')
        _ensure_column('users', 'requires_2fa', 'requires_2fa INTEGER NOT NULL DEFAULT 0')
        _ensure_column('users', 'trust_level', "trust_level TEXT NOT NULL DEFAULT 'approved' CHECK (trust_level IN ('pending', 'approved', 'rejected', 'suspended'))")
        if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() not in {'0', 'false', 'no'}:
            seed_phase20_demo_data(connection)
        connection.commit()
    _migrate_candidate_skills_schema()
    _ensure_column('applications', 'resume_text', 'resume_text TEXT')
    _ensure_column('applications', 'resume_file_name', 'resume_file_name TEXT')
    _ensure_column('applications', 'resume_mime_type', 'resume_mime_type TEXT')
    # Phase 1 mentorship foundation: link tasks to their internship. Existing
    # rows keep NULL (they predate the link) and remain fully functional.
    _ensure_column('mentor_tasks', 'internship_id', 'internship_id INTEGER REFERENCES internships(id)')
    # Phase 2 core engine: traceability and scheduling fields on execution tasks
    _ensure_column('mentor_tasks', 'project_id', 'project_id INTEGER REFERENCES projects(id)')
    _ensure_column('mentor_tasks', 'master_task_id', 'master_task_id INTEGER REFERENCES master_tasks(id)')
    _ensure_column('mentor_tasks', 'chunk_id', 'chunk_id INTEGER REFERENCES project_chunks(id)')
    _ensure_column('mentor_tasks', 'start_date', 'start_date TEXT')
    _ensure_column('mentor_tasks', 'estimated_hours', 'estimated_hours REAL')
    _ensure_column('mentor_feedback', 'is_read', 'is_read INTEGER NOT NULL DEFAULT 1')
    _ensure_column('mentor_feedback', 'read_at', 'read_at TEXT')
    # Master UI integration: optional per-assessment time limit (minutes).
    # NULL means untimed; existing rows stay untimed and fully functional.
    _ensure_column('assessments', 'duration_minutes', 'duration_minutes INTEGER')



def seed_mentor_demo_data(connection, mentor_id):
    """Give local mentor accounts a visible workflow until provider assignment UI exists."""
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return
    existing = connection.execute(
        'SELECT 1 FROM mentor_assignments WHERE mentor_id = ? LIMIT 1', (mentor_id,)
    ).fetchone()
    if existing:
        return

    intern_ids = []
    intern_specs = [('Rahul Sharma', 'rahul'), ('Ananya Iyer', 'ananya'), ('Kabir Singh', 'kabir')]
    for full_name, handle in intern_specs:
        email = f'mentor-{mentor_id}-{handle}@dev.in'
        connection.execute(
            'INSERT OR IGNORE INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
            (full_name, email, hash_password(secrets.token_urlsafe(24)), 'intern', 'InternFlow Demo'),
        )
        intern_ids.append(connection.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()[0])

    for intern_id in intern_ids:
        connection.execute('INSERT OR IGNORE INTO mentor_assignments (mentor_id, intern_id, status) VALUES (?, ?, ?)', (mentor_id, intern_id, 'active'))

    task_specs = [
        (intern_ids[0], 'Build authentication flow', 'Implement login, token refresh, and protected routes.', 'high', '2026-10-02', 'submitted'),
        (intern_ids[0], 'Write API documentation', 'Document the internship and application endpoints.', 'normal', '2026-10-05', 'completed'),
        (intern_ids[1], 'Create progress summary', 'Summarize the first sprint and identify blockers.', 'normal', '2026-10-04', 'in_progress'),
        (intern_ids[2], 'Add test coverage', 'Add focused tests for the dashboard data layer.', 'high', '2026-10-01', 'assigned'),
    ]
    task_ids = []
    for intern_id, title, description, priority, due_date, task_status in task_specs:
        cursor = connection.execute('INSERT INTO mentor_tasks (mentor_id, intern_id, title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)', (mentor_id, intern_id, title, description, priority, due_date, task_status))
        task_ids.append(cursor.lastrowid)

    connection.execute("INSERT INTO task_submissions (task_id, intern_id, content, status, submitted_at) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)", (task_ids[0], intern_ids[0], 'Authentication flow is ready for review in the feature branch.'))
    connection.execute('INSERT INTO mentor_feedback (mentor_id, intern_id, task_id, feedback, strengths, improvements, next_steps) VALUES (?, ?, ?, ?, ?, ?, ?)', (mentor_id, intern_ids[0], task_ids[1], 'Strong structure and clear examples. Keep error responses consistent across endpoints.', 'Clear technical writing', 'Consistency in edge-case examples', 'Add one authenticated request example per endpoint'))
    connection.execute("INSERT INTO mentor_evaluations (mentor_id, intern_id, summary, status, due_date) VALUES (?, ?, ?, 'draft', ?)", (mentor_id, intern_ids[1], 'Midpoint evaluation is ready to complete.', '2026-10-07'))


def seed_intern_demo_data(connection, intern_id):
    """Give local intern accounts an active mentorship until provider assignment UI exists."""
    if os.getenv('INTERNFLOW_DEMO_DATA', 'true').lower() in {'0', 'false', 'no'}:
        return
    existing = connection.execute(
        "SELECT 1 FROM mentor_assignments WHERE intern_id = ? AND status = 'active' LIMIT 1",
        (intern_id,),
    ).fetchone()
    if existing:
        return

    email = f'mentor-{intern_id}-priya@dev.in'
    connection.execute(
        'INSERT OR IGNORE INTO users (full_name, email, password_hash, role, organization) VALUES (?, ?, ?, ?, ?)',
        ('Priya Menon', email, hash_password(secrets.token_urlsafe(24)), 'mentor', 'InternFlow Demo'),
    )
    mentor_id = connection.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()[0]
    connection.execute(
        'INSERT OR IGNORE INTO mentor_assignments (mentor_id, intern_id, status) VALUES (?, ?, ?)',
        (mentor_id, intern_id, 'active'),
    )


@contextmanager
def get_db():
    init_db()
    connection = sqlite3.connect(get_db_path())
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()
