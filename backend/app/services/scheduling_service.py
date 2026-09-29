import logging
import math
from datetime import datetime, timedelta, date
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

PRIORITY_RANK = {
    'high': 1,
    'normal': 2,
    'low': 3,
}


def _parse_date(val: str, field_name: str) -> date:
    if not val or not str(val).strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Project {field_name} is required for scheduling.",
        )
    val = str(val).strip()
    # Support ISO timestamp strings (YYYY-MM-DD or YYYY-MM-DDT...)
    if "T" in val:
        val = val.split("T")[0]
    try:
        return datetime.strptime(val, "%Y-%m-%d").date()
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid date format for {field_name}: '{val}'. Use YYYY-MM-DD format.",
        ) from err


def calculate_schedule(db, mentor_id: int, project_id: int, daily_capacity: float = 8.0):
    project = db.execute(
        """SELECT p.* FROM projects p
           WHERE p.id = ? AND p.mentor_id = ?
             AND EXISTS (
               SELECT 1 FROM mentor_assignments ma
               WHERE ma.mentor_id = p.mentor_id
                 AND ma.internship_id = p.internship_id
                 AND ma.status = 'active'
             )""",
        (project_id, mentor_id),
    ).fetchone()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or you are not authorized to manage it.",
        )
    project = dict(project)

    start_date = _parse_date(project.get("start_date"), "start_date")
    end_date = _parse_date(project.get("end_date"), "end_date")

    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Project end date cannot precede start date.",
        )

    available_days = (end_date - start_date).days + 1
    if available_days <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Project duration is invalid.",
        )

    # Fetch execution tasks
    rows = db.execute(
        """SELECT mt.*, u.full_name AS intern_name,
                  mtk.sequence AS master_task_sequence, pc.sequence AS chunk_sequence
           FROM mentor_tasks mt
           JOIN users u ON u.id = mt.intern_id
           LEFT JOIN master_tasks mtk ON mtk.id = mt.master_task_id
           LEFT JOIN project_chunks pc ON pc.id = mt.chunk_id
           WHERE mt.project_id = ? AND mt.mentor_id = ?
           ORDER BY mt.intern_id, COALESCE(mtk.sequence, 0), COALESCE(pc.sequence, 0), mt.id""",
        (project_id, mentor_id),
    ).fetchall()

    tasks = [dict(r) for r in rows]
    if not tasks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No distributed execution tasks found for this project. Please distribute tasks first.",
        )

    # Group by intern
    by_intern = {}
    for t in tasks:
        by_intern.setdefault(t["intern_id"], []).append(t)

    # Validate workload capacity per intern
    max_capacity = float(available_days * daily_capacity)
    for intern_id, intern_tasks in by_intern.items():
        intern_name = intern_tasks[0]["intern_name"]
        total_hours = sum(float(t.get("estimated_hours") or 4.0) for t in intern_tasks)
        if total_hours > max_capacity:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Estimated workload for intern '{intern_name}' ({total_hours:.1f}h) exceeds available project capacity ({max_capacity:.1f}h across {available_days} days).",
            )

    # Generate schedule dates per intern
    scheduled_tasks = []
    for intern_id, intern_tasks in by_intern.items():
        # Sort intern's tasks by priority, sequence, id
        sorted_tasks = sorted(
            intern_tasks,
            key=lambda t: (
                PRIORITY_RANK.get(t.get("priority", "normal"), 2),
                t.get("master_task_sequence", 0),
                t.get("chunk_sequence", 0),
                t["id"],
            ),
        )

        current_pointer = start_date
        for t in sorted_tasks:
            est_hours = float(t.get("estimated_hours") or 4.0)
            days_needed = max(1, math.ceil(est_hours / daily_capacity))

            task_start = current_pointer
            task_due = task_start + timedelta(days=days_needed - 1)

            if task_due > end_date:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Task '{t['title']}' for {t['intern_name']} cannot fit before project end date ({end_date.isoformat()}).",
                )

            scheduled_tasks.append(
                {
                    "task_id": t["id"],
                    "chunk_id": t.get("chunk_id"),
                    "title": t["title"],
                    "intern_id": t["intern_id"],
                    "intern_name": t["intern_name"],
                    "priority": t["priority"],
                    "estimated_hours": t.get("estimated_hours"),
                    "start_date": task_start.isoformat(),
                    "due_date": task_due.isoformat(),
                    "status": t["status"],
                }
            )

            # Advance current pointer to next day after task_due
            current_pointer = task_due + timedelta(days=1)

    return {
        "project_id": project_id,
        "project_title": project["title"],
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "available_days": available_days,
        "schedule": scheduled_tasks,
    }


def preview_schedule(db, mentor_id: int, project_id: int, daily_capacity: float = 8.0):
    logger.info("Schedule preview requested for project=%s", project_id)
    return calculate_schedule(db, mentor_id, project_id, daily_capacity)


def execute_schedule(db, mentor_id: int, project_id: int, daily_capacity: float = 8.0):
    logger.info("Schedule execution started for project=%s", project_id)
    plan = calculate_schedule(db, mentor_id, project_id, daily_capacity)

    for item in plan["schedule"]:
        db.execute(
            """UPDATE mentor_tasks
               SET start_date = ?, due_date = ?
               WHERE id = ? AND mentor_id = ?""",
            (item["start_date"], item["due_date"], item["task_id"], mentor_id),
        )

    # Activate project if currently draft
    db.execute(
        "UPDATE projects SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'",
        (project_id,),
    )

    db.commit()
    logger.info("Schedule execution completed for project=%s with %d tasks", project_id, len(plan["schedule"]))

    return plan
