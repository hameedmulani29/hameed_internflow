from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles, current_user
from app.db import get_db
from app.services.weekly_report_service import (
    generate_and_persist_weekly_report,
    _format_weekly_report_record,
    compute_reporting_week,
)

router = APIRouter(prefix='/api/progress', tags=['progress'])


class GenerateWeeklyReportRequest(BaseModel):
    assignment_id: int
    week_start: Optional[str] = None
    week_end: Optional[str] = None
    force_regenerate: bool = False


# ================= Weekly Progress Reports API =================

@router.post('/weekly-report/generate', status_code=status.HTTP_200_OK)
def trigger_weekly_report_generation(
    payload: GenerateWeeklyReportRequest,
    user=Depends(require_roles('mentor', 'provider', 'intern')),
):
    """Triggers weekly progress collection, AI report generation, persistence, and Make #20 event."""
    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (payload.assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        try:
            report = generate_and_persist_weekly_report(
                db=db,
                assignment_id=payload.assignment_id,
                week_start=payload.week_start,
                week_end=payload.week_end,
                force_regenerate=payload.force_regenerate,
            )
            return report
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=str(val_err))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to generate weekly report: {exc}")


@router.get('/weekly-reports/me')
def get_my_weekly_reports(user=Depends(require_roles('intern'))):
    """Returns all generated weekly reports for the currently authenticated intern."""
    intern_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            '''SELECT * FROM weekly_reports
               WHERE intern_id = ?
               ORDER BY week_start DESC, id DESC''',
            (intern_id,),
        ).fetchall()

    return {'items': [_format_weekly_report_record(dict(r)) for r in rows]}


@router.get('/weekly-reports/assignment/{assignment_id}')
def get_assignment_weekly_reports(
    assignment_id: int,
    user=Depends(require_roles('mentor', 'provider', 'intern')),
):
    """Returns all weekly reports for a specific mentor assignment."""
    user_id = int(user['sub'])
    user_role = user.get('role')

    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        # IDOR Authorization check
        if user_role == 'intern' and assignment['intern_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to these weekly reports.')

        rows = db.execute(
            '''SELECT * FROM weekly_reports
               WHERE assignment_id = ?
               ORDER BY week_start DESC, id DESC''',
            (assignment_id,),
        ).fetchall()

    return {'items': [_format_weekly_report_record(dict(r)) for r in rows]}


@router.get('/weekly-reports/{report_id}')
def get_weekly_report_by_id(report_id: int, user=Depends(current_user)):
    """Retrieves a single weekly report by ID with IDOR authorization protection."""
    user_id = int(user['sub'])
    user_role = user.get('role')

    with get_db() as db:
        row = db.execute('SELECT * FROM weekly_reports WHERE id = ?', (report_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Weekly report not found.')

        report_dict = dict(row)

        if user_role == 'intern' and report_dict['intern_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this weekly report.')
        if user_role == 'provider' and report_dict['provider_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this weekly report.')

        return _format_weekly_report_record(report_dict)


@router.get('/weekly-report/{assignment_id}')
def generate_weekly_progress_report(
    assignment_id: int,
    user=Depends(require_roles('mentor', 'provider', 'intern')),
):
    """Backwards-compatible endpoint: Generates and returns a persisted weekly progress report."""
    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        w_start, w_end = compute_reporting_week()
        report = generate_and_persist_weekly_report(
            db=db,
            assignment_id=assignment_id,
            week_start=w_start,
            week_end=w_end,
            force_regenerate=False,
        )

        user_row = db.execute('SELECT full_name FROM users WHERE id = ?', (assignment['intern_id'],)).fetchone()
        mentor_row = db.execute('SELECT full_name FROM users WHERE id = ?', (assignment['mentor_id'],)).fetchone()
        internship_row = db.execute('SELECT title FROM internships WHERE id = ?', (assignment['internship_id'] or 1,)).fetchone()

        intern_name = user_row['full_name'] if user_row else 'Intern'
        mentor_name = mentor_row['full_name'] if mentor_row else 'Mentor'
        internship_title = internship_row['title'] if internship_row else 'Engineering Internship'

        metrics = report.get('metrics', {})

        # Markdown representation for frontends that render raw markdown
        report_markdown = f"""
# Weekly Internship Progress Report

**Intern:** {intern_name}  
**Role:** {internship_title}  
**Mentor:** {mentor_name}  
**Week Period:** {report['week_start']} to {report['week_end']}  

---

### Executive Summary
{report['summary']}

### Completed Work
{chr(10).join(f"- {w}" for w in report.get('completed_work', [])) if report.get('completed_work') else "- Maintained baseline workspace activity."}

### Achievements & Highlights
{chr(10).join(f"- {a}" for a in report.get('achievements', [])) if report.get('achievements') else "- Progressing on core deliverables."}

### Next Week Focus
{chr(10).join(f"- {f}" for f in report.get('next_week_focus', [])) if report.get('next_week_focus') else "- Advance sprint milestones."}

---
*Generated by InternFlow AI Engine ({report['ai_status']})*
""".strip()

        return {
            'id': report['id'],
            'assignment_id': assignment_id,
            'intern_name': intern_name,
            'internship_title': internship_title,
            'week_start': report['week_start'],
            'week_end': report['week_end'],
            'summary': metrics,
            'report_markdown': report_markdown,
            'report_data': report,
        }
