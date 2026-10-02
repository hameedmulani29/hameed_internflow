import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_token
from app.db import get_db, init_db
from app.services.weekly_report_service import (
    collect_weekly_progress_data,
    generate_and_persist_weekly_report,
    compute_reporting_week,
)
from app.services.webhook_service import emit_weekly_report_generated_event

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def test_weekly_report_full_pipeline():
    # 1. Seed Database Entities
    with get_db() as db:
        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role, organization) VALUES ('Acme Corp Provider', 'prov-wk@test.com', 'hash', 'provider', 'Acme Corp') ON CONFLICT (email) DO NOTHING"
        )
        provider_id = db.execute("SELECT id FROM users WHERE email='prov-wk@test.com'").fetchone()[0]

        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Mentor David', 'mentor-wk@test.com', 'hash', 'mentor') ON CONFLICT (email) DO NOTHING"
        )
        mentor_id = db.execute("SELECT id FROM users WHERE email='mentor-wk@test.com'").fetchone()[0]

        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Carlos', 'carlos-wk@test.com', 'hash', 'intern') ON CONFLICT (email) DO NOTHING"
        )
        intern_a_id = db.execute("SELECT id FROM users WHERE email='carlos-wk@test.com'").fetchone()[0]

        db.execute(
            "INSERT INTO users (full_name, email, password_hash, role) VALUES ('Intern Unauthorized', 'unauth-wk@test.com', 'hash', 'intern') ON CONFLICT (email) DO NOTHING"
        )
        intern_b_id = db.execute("SELECT id FROM users WHERE email='unauth-wk@test.com'").fetchone()[0]

        cursor = db.execute(
            "INSERT INTO internships (provider_id, title, department, description, location, work_mode, duration, stipend, status) VALUES (?, 'Data Science Intern', 'Data', 'Desc', 'Remote', 'Remote', '3m', '18k', 'published')",
            (provider_id,),
        )
        internship_id = cursor.lastrowid

        db.execute(
            "INSERT INTO mentor_assignments (mentor_id, intern_id, internship_id, status) VALUES (?, ?, ?, 'active') ON CONFLICT (mentor_id, intern_id) DO NOTHING",
            (mentor_id, intern_a_id, internship_id),
        )
        assignment_id = db.execute(
            "SELECT id FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ?",
            (mentor_id, intern_a_id),
        ).fetchone()[0]

        # Seed Tasks
        db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, priority, status) VALUES (?, ?, ?, 'Build ETL Pipeline', 'Extract data from API', 'high', 'completed')",
            (mentor_id, intern_a_id, internship_id),
        )
        db.execute(
            "INSERT INTO mentor_tasks (mentor_id, intern_id, internship_id, title, description, priority, status) VALUES (?, ?, ?, 'Train Classification Model', 'Train Random Forest model', 'normal', 'in_progress')",
            (mentor_id, intern_a_id, internship_id),
        )

        # Seed Attendance
        db.execute(
            "INSERT INTO attendance (intern_id, checked_in_at, checked_out_at, work_minutes, status) VALUES (?, '2026-09-22 09:00:00', '2026-09-22 17:00:00', 480, 'checked_out')",
            (intern_a_id,),
        )

        db.commit()

    # 2. Test #18 Data Collection Service
    w_start = "2026-09-21"
    w_end = "2026-09-27"
    with get_db() as db:
        progress_data = collect_weekly_progress_data(db, assignment_id, w_start, w_end)

    assert progress_data['intern']['name'] == 'Intern Carlos'
    assert progress_data['internship']['title'] == 'Data Science Intern'
    assert progress_data['metrics']['completed_tasks_count'] >= 1
    assert 'Build ETL Pipeline' in progress_data['details']['completed_tasks']

    # 3. Test #19 Report Generation & Persistence (via API)
    intern_a_token = create_token(intern_a_id, 'intern')
    a_headers = {'Authorization': f'Bearer {intern_a_token}'}

    intern_b_token = create_token(intern_b_id, 'intern')
    b_headers = {'Authorization': f'Bearer {intern_b_token}'}

    gen_payload = {
        "assignment_id": assignment_id,
        "week_start": w_start,
        "week_end": w_end,
        "force_regenerate": False,
    }

    gen_resp = client.post('/api/progress/weekly-report/generate', json=gen_payload, headers=a_headers)
    assert gen_resp.status_code == 200
    report = gen_resp.json()

    assert report['assignment_id'] == assignment_id
    assert report['week_start'] == w_start
    assert report['week_end'] == w_end
    assert len(report['summary']) > 10
    assert isinstance(report['completed_work'], list)
    assert isinstance(report['achievements'], list)
    assert report['status'] == 'generated'

    report_id = report['id']

    # 4. Test Idempotency: Generating again returns existing report without creating duplicates
    gen_again_resp = client.post('/api/progress/weekly-report/generate', json=gen_payload, headers=a_headers)
    assert gen_again_resp.status_code == 200
    assert gen_again_resp.json()['id'] == report_id

    # 5. Test Intern API Access (GET /api/progress/weekly-reports/me)
    my_reports_resp = client.get('/api/progress/weekly-reports/me', headers=a_headers)
    assert my_reports_resp.status_code == 200
    items = my_reports_resp.json()['items']
    assert len(items) >= 1
    assert items[0]['id'] == report_id

    # 6. Test IDOR Protection
    # Intern A accesses own report by ID -> 200
    get_own = client.get(f'/api/progress/weekly-reports/{report_id}', headers=a_headers)
    assert get_own.status_code == 200

    # Intern B attempts to access Intern A's report by ID -> 403 Forbidden
    get_unauth = client.get(f'/api/progress/weekly-reports/{report_id}', headers=b_headers)
    assert get_unauth.status_code == 403

    # 7. Test Make #20 Event Payload Construction
    event_payload = emit_weekly_report_generated_event(
        report_data=report,
        intern_id=intern_a_id,
        intern_name='Intern Carlos',
        intern_email='carlos-wk@test.com',
        internship_id=internship_id,
        internship_title='Data Science Intern',
        provider_id=provider_id,
        provider_name='Acme Corp',
        provider_email='prov-wk@test.com',
    )
    assert event_payload['event'] == 'weekly_report.generated'
    assert event_payload['data']['report']['id'] == report_id
    assert event_payload['data']['intern']['email'] == 'carlos-wk@test.com'
    assert event_payload['data']['provider']['name'] == 'Acme Corp'
