import json
from datetime import datetime, timezone

from app.websocket.manager import mentor_manager, intern_manager


async def record_and_broadcast_activity(
    db,
    actor_id: int,
    actor_role: str,
    event_type: str,
    mentor_id: int,
    title: str,
    description: str,
    intern_id: int | None = None,
    project_id: int | None = None,
    task_id: int | None = None,
    metadata: dict | None = None,
):
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata) if metadata else None

    cursor = db.execute(
        """INSERT INTO activity_events
           (actor_id, actor_role, event_type, mentor_id, intern_id, project_id, task_id, title, description, metadata, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (actor_id, actor_role, event_type, mentor_id, intern_id, project_id, task_id, title, description, meta_json, now_iso),
    )
    activity_id = cursor.fetchone()["id"]

    # Fetch names if not provided in metadata
    intern_name = None
    if intern_id:
        row = db.execute("SELECT full_name FROM users WHERE id = ?", (intern_id,)).fetchone()
        if row:
            intern_name = row["full_name"]

    project_title = None
    if project_id:
        row = db.execute("SELECT title FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row:
            project_title = row["title"]

    task_title = None
    if task_id:
        row = db.execute("SELECT title FROM mentor_tasks WHERE id = ?", (task_id,)).fetchone()
        if row:
            task_title = row["title"]

    payload = {
        "type": event_type,
        "activity_id": activity_id,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "mentor_id": mentor_id,
        "intern_id": intern_id,
        "intern_name": intern_name,
        "project_id": project_id,
        "project_title": project_title,
        "task_id": task_id,
        "task_title": task_title,
        "title": title,
        "description": description,
        "status": metadata.get("status") if metadata else None,
        "created_at": now_iso,
        "timestamp": now_iso,
        "metadata": metadata or {},
    }

    await mentor_manager.broadcast_to_mentor(mentor_id, payload)

    # Fan out to the affected intern so their workspace updates in real time
    # too (task assigned/started/submitted/completed, reviews, feedback).
    if intern_id:
        await intern_manager.broadcast_to_intern(intern_id, payload)

    return payload


def fetch_mentor_activity(db, mentor_id: int, limit: int = 20):
    rows = db.execute(
        """SELECT ae.id, ae.actor_id, ae.actor_role, ae.event_type, ae.mentor_id,
                  ae.intern_id, ae.project_id, ae.task_id, ae.title, ae.description,
                  ae.metadata, ae.created_at,
                  u_actor.full_name AS actor_name,
                  u_intern.full_name AS intern_name,
                  p.title AS project_title,
                  mt.title AS task_title
           FROM activity_events ae
           JOIN users u_actor ON u_actor.id = ae.actor_id
           LEFT JOIN users u_intern ON u_intern.id = ae.intern_id
           LEFT JOIN projects p ON p.id = ae.project_id
           LEFT JOIN mentor_tasks mt ON mt.id = ae.task_id
           WHERE ae.mentor_id = ?
           ORDER BY ae.created_at DESC, ae.id DESC
           LIMIT ?""",
        (mentor_id, limit),
    ).fetchall()

    results = []
    for r in rows:
        meta = json.loads(r["metadata"]) if r["metadata"] else {}
        results.append({
            "id": r["id"],
            "activity_id": r["id"],
            "actor_id": r["actor_id"],
            "actor_name": r["actor_name"],
            "actor_role": r["actor_role"],
            "event_type": r["event_type"],
            "mentor_id": r["mentor_id"],
            "intern_id": r["intern_id"],
            "intern_name": r["intern_name"],
            "project_id": r["project_id"],
            "project_title": r["project_title"],
            "task_id": r["task_id"],
            "task_title": r["task_title"],
            "title": r["title"],
            "description": r["description"],
            "status": meta.get("status"),
            "metadata": meta,
            "created_at": r["created_at"],
            "timestamp": r["created_at"],
        })
    return results
