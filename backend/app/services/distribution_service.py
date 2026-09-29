import logging
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

PRIORITY_RANK = {
    'high': 1,
    'normal': 2,
    'low': 3,
}


def _get_owned_project(db, mentor_id: int, project_id: int):
    project = db.execute(
        """SELECT p.*, i.title AS internship_title
           FROM projects p
           JOIN internships i ON i.id = p.internship_id
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
    return dict(project)


def _get_project_interns(db, mentor_id: int, internship_id: int):
    rows = db.execute(
        """SELECT u.id, u.full_name, u.email
           FROM mentor_assignments ma
           JOIN users u ON u.id = ma.intern_id
           WHERE ma.mentor_id = ? AND ma.internship_id = ? AND ma.status = 'active'
           ORDER BY u.full_name""",
        (mentor_id, internship_id),
    ).fetchall()
    return [dict(r) for r in rows]


def _get_project_chunks(db, project_id: int):
    rows = db.execute(
        """SELECT pc.*, mtk.title AS master_task_title, mtk.sequence AS master_task_sequence
           FROM project_chunks pc
           JOIN master_tasks mtk ON mtk.id = pc.master_task_id
           WHERE mtk.project_id = ?
           ORDER BY mtk.sequence, mtk.id, pc.sequence, pc.id""",
        (project_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _get_existing_intern_workloads(db, mentor_id: int, internship_id: int, intern_ids: list[int]):
    workloads = {iid: 0.0 for iid in intern_ids}
    if not intern_ids:
        return workloads
    placeholders = ",".join("?" for _ in intern_ids)
    rows = db.execute(
        f"""SELECT intern_id, SUM(COALESCE(estimated_hours, 1.0)) AS total_hours
            FROM mentor_tasks
            WHERE mentor_id = ? AND internship_id = ? AND intern_id IN ({placeholders})
              AND status IN ('assigned', 'in_progress', 'submitted')
            GROUP BY intern_id""",
        [mentor_id, internship_id, *intern_ids],
    ).fetchall()
    for r in rows:
        workloads[r["intern_id"]] = float(r["total_hours"] or 0.0)
    return workloads


def calculate_distribution(db, mentor_id: int, project_id: int, mode: str):
    if mode not in {"equal", "priority", "workload_balanced"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid distribution mode. Choose equal, priority, or workload_balanced.",
        )

    project = _get_owned_project(db, mentor_id, project_id)
    interns = _get_project_interns(db, mentor_id, project["internship_id"])
    if not interns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Project has no assigned interns in active status.",
        )

    chunks = _get_project_chunks(db, project_id)
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Project has no chunks to distribute.",
        )

    # Calculate starting workloads
    existing_workloads = _get_existing_intern_workloads(
        db, mentor_id, project["internship_id"], [i["id"] for i in interns]
    )

    intern_map = {i["id"]: i for i in interns}
    intern_ids = [i["id"] for i in interns]

    # Mode-dependent chunk sorting
    if mode == "priority":
        # Sort chunks by priority rank first, then master task seq, chunk seq
        sorted_chunks = sorted(
            chunks,
            key=lambda c: (
                PRIORITY_RANK.get(c.get("priority", "normal"), 2),
                c.get("master_task_sequence", 0),
                c.get("sequence", 0),
                c["id"],
            ),
        )
    else: # equal or workload_balanced
        sorted_chunks = sorted(
            chunks,
            key=lambda c: (
                c.get("master_task_sequence", 0),
                c.get("sequence", 0),
                c["id"],
            ),
        )

    # Tracking workload during simulation
    current_workload = {
        iid: existing_workloads[iid] if mode == "workload_balanced" else 0.0
        for iid in intern_ids
    }
    chunk_counts = {iid: 0 for iid in intern_ids}

    assigned_items = []

    for chunk in sorted_chunks:
        # Choose intern with lowest current workload
        best_intern_id = min(intern_ids, key=lambda iid: (current_workload[iid], chunk_counts[iid], iid))
        effort = float(chunk.get("estimated_hours") or 1.0)

        current_workload[best_intern_id] += effort
        chunk_counts[best_intern_id] += 1

        assigned_items.append(
            {
                "chunk_id": chunk["id"],
                "master_task_id": chunk["master_task_id"],
                "chunk_title": chunk["title"],
                "chunk_description": chunk.get("description"),
                "master_task_title": chunk["master_task_title"],
                "priority": chunk.get("priority", "normal"),
                "estimated_hours": chunk.get("estimated_hours"),
                "intern_id": best_intern_id,
                "intern_name": intern_map[best_intern_id]["full_name"],
            }
        )

    summary = []
    for iid in intern_ids:
        summary.append(
            {
                "intern_id": iid,
                "intern_name": intern_map[iid]["full_name"],
                "intern_email": intern_map[iid]["email"],
                "chunk_count": chunk_counts[iid],
                "assigned_hours": round(current_workload[iid] - (existing_workloads[iid] if mode == "workload_balanced" else 0.0), 2),
                "total_hours": round(current_workload[iid], 2),
            }
        )

    return {
        "mode": mode,
        "project_id": project_id,
        "project_title": project["title"],
        "summary": summary,
        "assignments": assigned_items,
    }


def preview_distribution(db, mentor_id: int, project_id: int, mode: str):
    logger.info("Distribution preview requested for project=%s mode=%s", project_id, mode)
    return calculate_distribution(db, mentor_id, project_id, mode)


def execute_distribution(db, mentor_id: int, project_id: int, mode: str):
    logger.info("Distribution execution started for project=%s mode=%s", project_id, mode)
    plan = calculate_distribution(db, mentor_id, project_id, mode)
    project = _get_owned_project(db, mentor_id, project_id)

    created_tasks = 0
    updated_tasks = 0

    for item in plan["assignments"]:
        chunk_id = item["chunk_id"]
        master_task_id = item["master_task_id"]
        intern_id = item["intern_id"]
        title = item["chunk_title"]
        desc = (
            f"Master Task: {item['master_task_title']}\n\n{item['chunk_description']}"
            if item.get("chunk_description")
            else f"Master Task: {item['master_task_title']}"
        )
        priority = item["priority"]
        est_hours = item["estimated_hours"]

        # Check for existing execution task for this chunk
        existing = db.execute(
            "SELECT * FROM mentor_tasks WHERE chunk_id = ?", (chunk_id,)
        ).fetchone()

        if existing:
            # Idempotent re-run: update task if still assigned
            if existing["status"] == "assigned":
                db.execute(
                    """UPDATE mentor_tasks
                       SET intern_id = ?, title = ?, description = ?, priority = ?, estimated_hours = ?
                       WHERE id = ?""",
                    (intern_id, title, desc, priority, est_hours, existing["id"]),
                )
                updated_tasks += 1
        else:
            db.execute(
                """INSERT INTO mentor_tasks
                   (mentor_id, intern_id, internship_id, project_id, master_task_id, chunk_id, title, description, priority, estimated_hours, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned')""",
                (
                    mentor_id,
                    intern_id,
                    project["internship_id"],
                    project_id,
                    master_task_id,
                    chunk_id,
                    title,
                    desc,
                    priority,
                    est_hours,
                ),
            )
            created_tasks += 1

        # Mark chunk in progress if pending
        db.execute(
            "UPDATE project_chunks SET status = 'in_progress' WHERE id = ? AND status = 'pending'",
            (chunk_id,),
        )

    db.commit()
    logger.info(
        "Distribution completed for project=%s: %d created, %d updated",
        project_id,
        created_tasks,
        updated_tasks,
    )

    return {
        "status": "ok",
        "mode": mode,
        "project_id": project_id,
        "created_tasks_count": created_tasks,
        "updated_tasks_count": updated_tasks,
        "summary": plan["summary"],
        "assignments": plan["assignments"],
    }
