def calculate_project_progress(db, project_id: int) -> dict:
    """Calculate progress for a project based on its execution tasks (mentor_tasks)."""
    row = db.execute(
        """SELECT
             COUNT(*) AS total_tasks,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
             SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
             SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted_tasks,
             SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_tasks,
             SUM(CASE WHEN status = 'changes_requested' THEN 1 ELSE 0 END) AS changes_requested_tasks
           FROM mentor_tasks
           WHERE project_id = ?""",
        (project_id,),
    ).fetchone()

    total = row["total_tasks"] if row and row["total_tasks"] else 0
    completed = row["completed_tasks"] if row and row["completed_tasks"] else 0
    in_progress = row["in_progress_tasks"] if row and row["in_progress_tasks"] else 0
    submitted = row["submitted_tasks"] if row and row["submitted_tasks"] else 0
    assigned = row["assigned_tasks"] if row and row["assigned_tasks"] else 0
    changes_requested = row["changes_requested_tasks"] if row and row["changes_requested_tasks"] else 0

    progress_percent = round((completed / total) * 100, 1) if total > 0 else 0.0

    return {
        "project_id": project_id,
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "submitted_tasks": submitted,
        "assigned_tasks": assigned,
        "changes_requested_tasks": changes_requested,
        "progress_percent": progress_percent,
    }


def calculate_intern_progress(db, mentor_id: int, intern_id: int) -> dict:
    """Calculate progress for a specific intern assigned to a mentor."""
    row = db.execute(
        """SELECT
             COUNT(*) AS total_tasks,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
             SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
             SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted_tasks,
             SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) AS assigned_tasks,
             SUM(CASE WHEN status = 'changes_requested' THEN 1 ELSE 0 END) AS changes_requested_tasks
           FROM mentor_tasks
           WHERE mentor_id = ? AND intern_id = ?""",
        (mentor_id, intern_id),
    ).fetchone()

    total = row["total_tasks"] if row and row["total_tasks"] else 0
    completed = row["completed_tasks"] if row and row["completed_tasks"] else 0
    in_progress = row["in_progress_tasks"] if row and row["in_progress_tasks"] else 0
    submitted = row["submitted_tasks"] if row and row["submitted_tasks"] else 0

    progress_percent = round((completed / total) * 100, 1) if total > 0 else 0.0

    return {
        "intern_id": intern_id,
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "submitted_tasks": submitted,
        "progress_percent": progress_percent,
    }
