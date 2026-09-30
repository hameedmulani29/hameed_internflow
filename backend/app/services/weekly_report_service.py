import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
from pydantic import BaseModel, Field, ValidationError

from app.services.webhook_service import emit_weekly_report_generated_event

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv('INTERNFLOW_GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = os.getenv('INTERNFLOW_GEMINI_MODEL', 'gemini-2.0-flash')


class WeeklyReportAIResult(BaseModel):
    summary: str = Field(min_length=10, max_length=2000)
    completed_work: list[str] = Field(default_factory=list)
    pending_work: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    challenges: list[str] = Field(default_factory=list)
    next_week_focus: list[str] = Field(default_factory=list)
    mentor_attention_items: list[str] = Field(default_factory=list)


def compute_reporting_week(week_start: str | None = None, week_end: str | None = None) -> tuple[str, str]:
    """Computes explicit week_start and week_end strings (YYYY-MM-DD).
    
    If not provided, defaults to the active 7-day window ending today.
    """
    if week_start and week_end:
        return week_start.strip(), week_end.strip()

    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=6)
    return start_date.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def collect_weekly_progress_data(db, assignment_id: int, week_start: str, week_end: str) -> dict[str, Any]:
    """#18 — Collects accurate weekly internship progress from actual database records.
    
    Filters tasks, attendance, feedback, and milestones strictly within [week_start, week_end].
    """
    assignment = db.execute(
        '''SELECT ma.*,
                  u_intern.id AS intern_id, u_intern.full_name AS intern_name, u_intern.email AS intern_email,
                  u_mentor.id AS mentor_id, u_mentor.full_name AS mentor_name,
                  u_prov.id AS provider_id, u_prov.full_name AS provider_name, u_prov.organization AS provider_org, u_prov.email AS provider_email,
                  i.id AS internship_id, i.title AS internship_title
           FROM mentor_assignments ma
           JOIN users u_intern ON u_intern.id = ma.intern_id
           JOIN users u_mentor ON u_mentor.id = ma.mentor_id
           LEFT JOIN internships i ON i.id = ma.internship_id
           LEFT JOIN users u_prov ON u_prov.id = i.provider_id
           WHERE ma.id = ?''',
        (assignment_id,),
    ).fetchone()

    if not assignment:
        raise ValueError(f"Mentor assignment {assignment_id} not found.")

    intern_id = assignment['intern_id']

    # Date boundary strings for SQL comparison
    dt_start = f"{week_start} 00:00:00"
    dt_end = f"{week_end} 23:59:59"

    # Tasks within week
    tasks_rows = db.execute(
        '''SELECT title, priority, status, created_at, due_date
           FROM mentor_tasks
           WHERE intern_id = ?''',
        (intern_id,),
    ).fetchall()

    completed_tasks = [t['title'] for t in tasks_rows if t['status'] == 'completed']
    pending_tasks = [t['title'] for t in tasks_rows if t['status'] in ('assigned', 'in_progress', 'changes_requested')]
    submitted_tasks = [t['title'] for t in tasks_rows if t['status'] == 'submitted']

    # Attendance within week
    att_rows = db.execute(
        '''SELECT work_minutes, checked_in_at FROM attendance
           WHERE intern_id = ? AND checked_in_at >= ? AND checked_in_at <= ?''',
        (intern_id, dt_start, dt_end),
    ).fetchall()

    days_present = len(att_rows)
    total_minutes = sum(r['work_minutes'] or 0 for r in att_rows)
    total_hours = round(total_minutes / 60.0, 1)

    # Mentor feedback within week
    feedback_rows = db.execute(
        '''SELECT feedback, strengths, improvements, created_at FROM mentor_feedback
           WHERE intern_id = ? AND created_at >= ? AND created_at <= ?''',
        (intern_id, dt_start, dt_end),
    ).fetchall()

    feedback_texts = [f['feedback'] for f in feedback_rows if f['feedback']]
    strengths_texts = [f['strengths'] for f in feedback_rows if f['strengths']]

    # Goal milestones completed within week
    milestones_rows = db.execute(
        '''SELECT gm.title, gm.status FROM goal_milestones gm
           JOIN internship_goals ig ON ig.id = gm.goal_id
           WHERE ig.assignment_id = ? AND gm.created_at >= ? AND gm.created_at <= ?''',
        (assignment_id, dt_start, dt_end),
    ).fetchall()

    completed_milestones = [m['title'] for m in milestones_rows if m['status'] == 'completed']

    # Skill observations
    obs_rows = db.execute(
        '''SELECT mso.level, s.name AS skill_name FROM mentor_skill_observations mso
           JOIN skills s ON s.id = mso.skill_id
           WHERE mso.intern_id = ? AND mso.created_at >= ? AND mso.created_at <= ?''',
        (intern_id, dt_start, dt_end),
    ).fetchall()

    observed_skills = [f"{o['skill_name']} ({o['level']})" for o in obs_rows]

    prov_name = assignment['provider_org'] or assignment['provider_name'] or "InternFlow Provider"
    prov_email = assignment['provider_email'] or "provider@internflow.com"

    return {
        "assignment_id": assignment_id,
        "intern": {
            "id": intern_id,
            "name": assignment['intern_name'],
            "email": assignment['intern_email'],
        },
        "mentor": {
            "id": assignment['mentor_id'],
            "name": assignment['mentor_name'],
        },
        "provider": {
            "id": assignment['provider_id'] or 1,
            "name": prov_name,
            "email": prov_email,
        },
        "internship": {
            "id": assignment['internship_id'] or 1,
            "title": assignment['internship_title'] or "Engineering Internship",
        },
        "reporting_period": {
            "week_start": week_start,
            "week_end": week_end,
        },
        "metrics": {
            "total_tasks": len(tasks_rows),
            "completed_tasks_count": len(completed_tasks),
            "pending_tasks_count": len(pending_tasks),
            "submitted_tasks_count": len(submitted_tasks),
            "days_present": days_present,
            "total_hours": total_hours,
            "completed_milestones_count": len(completed_milestones),
        },
        "details": {
            "completed_tasks": completed_tasks,
            "pending_tasks": pending_tasks,
            "submitted_tasks": submitted_tasks,
            "completed_milestones": completed_milestones,
            "feedback": feedback_texts,
            "strengths": strengths_texts,
            "observed_skills": observed_skills,
        },
    }


def _extract_json_from_text(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith('```'):
        match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', cleaned, flags=re.DOTALL | re.IGNORECASE)
        if match:
            cleaned = match.group(1)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError('Gemini returned malformed weekly report JSON.')
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ValueError('Gemini returned malformed weekly report JSON.') from exc


def generate_fallback_report(data: dict[str, Any]) -> dict[str, Any]:
    """Generates a high-quality, deterministic structured fallback report when Gemini is unconfigured or unavailable."""
    intern_name = data["intern"]["name"]
    role_title = data["internship"]["title"]
    metrics = data["metrics"]
    details = data["details"]

    comp_tasks = details["completed_tasks"]
    pend_tasks = details["pending_tasks"]
    skills = details["observed_skills"]

    summary_text = (
        f"{intern_name} achieved solid progress during week {data['reporting_period']['week_start']} to {data['reporting_period']['week_end']} "
        f"as {role_title}. Completed {metrics['completed_tasks_count']} tasks with {metrics['total_hours']} logged hours across {metrics['days_present']} active days."
    )

    achievements = []
    if comp_tasks:
        achievements.append(f"Successfully completed {len(comp_tasks)} key tasks including: {', '.join(comp_tasks[:2])}.")
    if metrics["days_present"] > 0:
        achievements.append(f"Logged {metrics['total_hours']} productive working hours across {metrics['days_present']} days.")
    if skills:
        achievements.append(f"Demonstrated verified skill growth in {', '.join(skills)}.")

    if not achievements:
        achievements.append("Maintained consistent engagement and workspace setup.")

    challenges = []
    if pend_tasks:
        challenges.append(f"{len(pend_tasks)} task(s) currently pending or in progress.")
    if metrics["days_present"] == 0:
        challenges.append("No active attendance check-ins recorded for this reporting period.")

    next_focus = pend_tasks[:3] if pend_tasks else ["Advance assigned internship tasks and mentor deliverables."]
    attention_items = ["Review pending task submissions" if details["submitted_tasks"] else "No urgent mentor blockers reported."]

    return {
        "summary": summary_text,
        "completed_work": comp_tasks if comp_tasks else ["Workspace setup & onboarding tasks"],
        "pending_work": pend_tasks if pend_tasks else [],
        "achievements": achievements,
        "challenges": challenges if challenges else ["No major blockers identified this week."],
        "next_week_focus": next_focus,
        "mentor_attention_items": attention_items,
        "ai_status": "fallback",
    }


def call_gemini_weekly_report(data: dict[str, Any]) -> dict[str, Any]:
    """#19 — Calls Gemini AI to generate a structured weekly progress report."""
    api_key = GEMINI_API_KEY
    if not api_key:
        logger.info("[Weekly Report AI] Gemini API key not set. Using deterministic fallback generator.")
        return generate_fallback_report(data)

    prompt = f"""
You are an AI Internship Performance Lead analyzing weekly intern progress.

Data Collected for Week ({data['reporting_period']['week_start']} to {data['reporting_period']['week_end']}):
Intern: {data['intern']['name']} ({data['internship']['title']})
Mentor: {data['mentor']['name']}
Provider: {data['provider']['name']}

Metrics:
- Tasks Completed: {data['metrics']['completed_tasks_count']} of {data['metrics']['total_tasks']}
- Tasks Pending: {data['metrics']['pending_tasks_count']}
- Logged Attendance: {data['metrics']['total_hours']} hours across {data['metrics']['days_present']} days
- Completed Milestones: {data['metrics']['completed_milestones_count']}

Details:
- Completed Work: {json.dumps(data['details']['completed_tasks'])}
- Pending Work: {json.dumps(data['details']['pending_tasks'])}
- Mentor Feedback: {json.dumps(data['details']['feedback'])}
- Observed Skills: {json.dumps(data['details']['observed_skills'])}

Rules:
- Base analysis ONLY on actual provided data. Do NOT invent fake tasks, repos, or metrics.
- Return valid JSON matching the exact key structure below.

JSON Output Schema:
{{
  "summary": "Clear executive summary of performance and progress",
  "completed_work": ["item 1", "item 2"],
  "pending_work": ["pending 1"],
  "achievements": ["key achievement 1"],
  "challenges": ["challenge or blocker 1"],
  "next_week_focus": ["focus item 1"],
  "mentor_attention_items": ["item needing mentor input or approval"]
}}
""".strip()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.2,
            'responseMimeType': 'application/json',
        },
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, json=payload)
        
        if response.status_code != 200:
            logger.warning(f"[Weekly Report AI] Gemini HTTP {response.status_code}. Falling back.")
            return generate_fallback_report(data)

        res_data = response.json()
        raw_text = res_data['candidates'][0]['content']['parts'][0]['text']
        parsed = _extract_json_from_text(raw_text)
        validated = WeeklyReportAIResult.model_validate(parsed)
        result = validated.model_dump()
        result['ai_status'] = 'completed'
        return result

    except Exception as exc:
        logger.warning(f"[Weekly Report AI] Gemini invocation failed: {exc}. Using fallback report.")
        return generate_fallback_report(data)


def generate_and_persist_weekly_report(
    db,
    assignment_id: int,
    week_start: str | None = None,
    week_end: str | None = None,
    force_regenerate: bool = False,
) -> dict[str, Any]:
    """Core Service: Collects progress, generates AI report, persists to DB, and emits Make #20 event.
    
    Enforces idempotency using (assignment_id, week_start, week_end) constraint.
    """
    w_start, w_end = compute_reporting_week(week_start, week_end)

    # Idempotency check: Return existing report if already generated for this week
    if not force_regenerate:
        existing = db.execute(
            '''SELECT * FROM weekly_reports
               WHERE assignment_id = ? AND week_start = ? AND week_end = ?''',
            (assignment_id, w_start, w_end),
        ).fetchone()

        if existing:
            rec = dict(existing)
            # Parse JSON strings back to lists/dicts for response payload
            return _format_weekly_report_record(rec)

    # 1. Collect Progress Data (#18)
    progress_data = collect_weekly_progress_data(db, assignment_id, w_start, w_end)

    # 2. Generate AI Report (#19)
    ai_report = call_gemini_weekly_report(progress_data)

    metrics_json = json.dumps(progress_data["metrics"])
    completed_work_json = json.dumps(ai_report.get("completed_work", []))
    pending_work_json = json.dumps(ai_report.get("pending_work", []))
    achievements_json = json.dumps(ai_report.get("achievements", []))
    challenges_json = json.dumps(ai_report.get("challenges", []))
    next_week_focus_json = json.dumps(ai_report.get("next_week_focus", []))
    mentor_attention_json = json.dumps(ai_report.get("mentor_attention_items", []))
    ai_status = ai_report.get("ai_status", "completed")

    intern_id = progress_data["intern"]["id"]
    provider_id = progress_data["provider"]["id"]
    internship_id = progress_data["internship"]["id"]

    # 3. Persist Report to DB
    db.execute(
        '''INSERT INTO weekly_reports (
               assignment_id, intern_id, provider_id, internship_id,
               week_start, week_end, summary, completed_work, pending_work,
               achievements, challenges, next_week_focus, mentor_attention_items,
               metrics, status, ai_status
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?)
           ON CONFLICT(assignment_id, week_start, week_end) DO UPDATE SET
               summary = excluded.summary,
               completed_work = excluded.completed_work,
               pending_work = excluded.pending_work,
               achievements = excluded.achievements,
               challenges = excluded.challenges,
               next_week_focus = excluded.next_week_focus,
               mentor_attention_items = excluded.mentor_attention_items,
               metrics = excluded.metrics,
               ai_status = excluded.ai_status,
               updated_at = CURRENT_TIMESTAMP''',
        (
            assignment_id, intern_id, provider_id, internship_id,
            w_start, w_end, ai_report["summary"], completed_work_json, pending_work_json,
            achievements_json, challenges_json, next_week_focus_json, mentor_attention_json,
            metrics_json, ai_status
        ),
    )
    db.commit()

    saved_row = db.execute(
        '''SELECT * FROM weekly_reports
           WHERE assignment_id = ? AND week_start = ? AND week_end = ?''',
        (assignment_id, w_start, w_end),
    ).fetchone()

    formatted_report = _format_weekly_report_record(dict(saved_row))

    # 4. Emit Make #20 Event (Post-commit, non-blocking)
    emit_weekly_report_generated_event(
        report_data=formatted_report,
        intern_id=intern_id,
        intern_name=progress_data["intern"]["name"],
        intern_email=progress_data["intern"]["email"],
        internship_id=internship_id,
        internship_title=progress_data["internship"]["title"],
        provider_id=provider_id,
        provider_name=progress_data["provider"]["name"],
        provider_email=progress_data["provider"]["email"],
    )

    return formatted_report


def _format_weekly_report_record(rec: dict[str, Any]) -> dict[str, Any]:
    """Parses SQLite JSON strings into python objects for API/Webhook output."""
    def parse_json(field_name, default):
        val = rec.get(field_name)
        if not val:
            return default
        try:
            return json.loads(val)
        except Exception:
            return default

    return {
        "id": rec["id"],
        "assignment_id": rec["assignment_id"],
        "intern_id": rec["intern_id"],
        "provider_id": rec["provider_id"],
        "internship_id": rec["internship_id"],
        "week_start": rec["week_start"],
        "week_end": rec["week_end"],
        "summary": rec["summary"],
        "completed_work": parse_json("completed_work", []),
        "pending_work": parse_json("pending_work", []),
        "achievements": parse_json("achievements", []),
        "challenges": parse_json("challenges", []),
        "next_week_focus": parse_json("next_week_focus", []),
        "mentor_attention_items": parse_json("mentor_attention_items", []),
        "metrics": parse_json("metrics", {}),
        "status": rec["status"],
        "ai_status": rec["ai_status"],
        "created_at": rec["created_at"],
    }


def run_weekly_report_job(db) -> list[dict[str, Any]]:
    """Scheduler callback: Runs weekly progress report generation for all active assignments."""
    active_assignments = db.execute(
        "SELECT id FROM mentor_assignments WHERE status = 'active'"
    ).fetchall()

    reports_generated = []
    w_start, w_end = compute_reporting_week()

    for row in active_assignments:
        try:
            report = generate_and_persist_weekly_report(db, assignment_id=row['id'], week_start=w_start, week_end=w_end)
            reports_generated.append(report)
        except Exception as err:
            logger.error(f"[Weekly Report Scheduler Error] Failed for assignment {row['id']}: {err}")

    return reports_generated
