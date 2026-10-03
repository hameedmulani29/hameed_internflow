from fastapi import HTTPException, status


def serialize(row):
    return dict(row) if row else None


def get_intern_progress_detail(db, intern_id: int, mentor_id: int | None = None, provider_id: int | None = None) -> dict:
    """Unified service logic to retrieve progress and detail data for an intern.
    
    Supports mentor-scoped access (via mentor_id) and provider/organization-scoped
    access (via provider_id). Reused across mentor detail and Make provider automation.
    """
    intern = db.execute(
        'SELECT id, full_name, email FROM users WHERE id = ?',
        (intern_id,),
    ).fetchone()
    if not intern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Intern not found.')

    if mentor_id is not None:
        assignment_check = db.execute(
            "SELECT * FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ? AND status = 'active'",
            (mentor_id, intern_id),
        ).fetchone()
        if not assignment_check:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Forbidden: Intern is not assigned to this mentor.')

        assignment = db.execute(
            '''SELECT ma.id, ma.status, ma.created_at AS assigned_at, i.title AS internship_title,
                      i.department, i.work_mode, i.duration
               FROM mentor_assignments ma
               LEFT JOIN internships i ON i.id = ma.internship_id
               WHERE ma.mentor_id = ? AND ma.intern_id = ? AND ma.status = 'active'
               ORDER BY ma.created_at DESC LIMIT 1''',
            (mentor_id, intern_id),
        ).fetchone()

        tasks = db.execute(
            '''SELECT mt.*, ts.id AS submission_id, ts.status AS submission_status,
                      ts.submitted_at
               FROM mentor_tasks mt
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               WHERE mt.mentor_id = ? AND mt.intern_id = ?
               ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC''',
            (mentor_id, intern_id),
        ).fetchall()

        submissions = db.execute(
            '''SELECT ts.id, ts.task_id, ts.content, ts.status, ts.submitted_at, mt.title AS task_title
               FROM task_submissions ts
               JOIN mentor_tasks mt ON mt.id = ts.task_id
               WHERE mt.mentor_id = ? AND ts.intern_id = ?
               ORDER BY ts.submitted_at DESC''',
            (mentor_id, intern_id),
        ).fetchall()

        feedback = db.execute(
            '''SELECT mf.id, mf.feedback, mf.strengths, mf.improvements, mf.next_steps,
                      mf.created_at, mt.title AS task_title
               FROM mentor_feedback mf
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               WHERE mf.mentor_id = ? AND mf.intern_id = ?
               ORDER BY mf.created_at DESC''',
            (mentor_id, intern_id),
        ).fetchall()

        observations = db.execute(
            '''SELECT o.id, o.level, o.note, o.created_at, s.name AS skill_name,
                      mt.title AS task_title
               FROM mentor_skill_observations o
               JOIN skills s ON s.id = o.skill_id
               LEFT JOIN mentor_tasks mt ON mt.id = o.task_id
               WHERE o.mentor_id = ? AND o.intern_id = ?
               ORDER BY o.created_at DESC''',
            (mentor_id, intern_id),
        ).fetchall()

    elif provider_id is not None:
        asg_count = db.execute(
            '''SELECT 1 FROM mentor_assignments ma
               JOIN internships i ON i.id = ma.internship_id
               WHERE ma.intern_id = ? AND i.provider_id = ?''',
            (intern_id, provider_id),
        ).fetchone()

        app_count = db.execute(
            '''SELECT 1 FROM applications a
               JOIN internships i ON i.id = a.internship_id
               WHERE a.applicant_id = ? AND i.provider_id = ?''',
            (intern_id, provider_id),
        ).fetchone()

        task_count = db.execute(
            '''SELECT 1 FROM mentor_tasks mt
               JOIN internships i ON i.id = mt.internship_id
               WHERE mt.intern_id = ? AND i.provider_id = ?''',
            (intern_id, provider_id),
        ).fetchone()

        if not (asg_count or app_count or task_count):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Forbidden: Intern does not belong to your organization.',
            )

        assignment = db.execute(
            '''SELECT ma.id, ma.status, ma.created_at AS assigned_at, i.title AS internship_title,
                      i.department, i.work_mode, i.duration
               FROM mentor_assignments ma
               JOIN internships i ON i.id = ma.internship_id
               WHERE ma.intern_id = ? AND i.provider_id = ?
               ORDER BY (ma.status = 'active') DESC, ma.created_at DESC LIMIT 1''',
            (intern_id, provider_id),
        ).fetchone()

        tasks = db.execute(
            '''SELECT mt.*, ts.id AS submission_id, ts.status AS submission_status,
                      ts.submitted_at
               FROM mentor_tasks mt
               LEFT JOIN task_submissions ts ON ts.task_id = mt.id
               LEFT JOIN internships i ON i.id = mt.internship_id
               WHERE mt.intern_id = ? AND (
                   i.provider_id = ? OR
                   mt.mentor_id IN (
                       SELECT ma.mentor_id FROM mentor_assignments ma
                       JOIN internships i2 ON i2.id = ma.internship_id
                       WHERE ma.intern_id = ? AND i2.provider_id = ?
                   )
               )
               ORDER BY mt.due_date IS NULL, mt.due_date, mt.created_at DESC''',
            (intern_id, provider_id, intern_id, provider_id),
        ).fetchall()

        submissions = db.execute(
            '''SELECT ts.id, ts.task_id, ts.content, ts.status, ts.submitted_at, mt.title AS task_title
               FROM task_submissions ts
               JOIN mentor_tasks mt ON mt.id = ts.task_id
               LEFT JOIN internships i ON i.id = mt.internship_id
               WHERE ts.intern_id = ? AND (
                   i.provider_id = ? OR
                   mt.mentor_id IN (
                       SELECT ma.mentor_id FROM mentor_assignments ma
                       JOIN internships i2 ON i2.id = ma.internship_id
                       WHERE ma.intern_id = ? AND i2.provider_id = ?
                   )
               )
               ORDER BY ts.submitted_at DESC''',
            (intern_id, provider_id, intern_id, provider_id),
        ).fetchall()

        feedback = db.execute(
            '''SELECT mf.id, mf.feedback, mf.strengths, mf.improvements, mf.next_steps,
                      mf.created_at, mt.title AS task_title
               FROM mentor_feedback mf
               LEFT JOIN mentor_tasks mt ON mt.id = mf.task_id
               LEFT JOIN internships i ON i.id = mt.internship_id
               WHERE mf.intern_id = ? AND (
                   i.provider_id = ? OR
                   mf.mentor_id IN (
                       SELECT ma.mentor_id FROM mentor_assignments ma
                       JOIN internships i2 ON i2.id = ma.internship_id
                       WHERE ma.intern_id = ? AND i2.provider_id = ?
                   )
               )
               ORDER BY mf.created_at DESC''',
            (intern_id, provider_id, intern_id, provider_id),
        ).fetchall()

        observations = db.execute(
            '''SELECT o.id, o.level, o.note, o.created_at, s.name AS skill_name,
                      mt.title AS task_title
               FROM mentor_skill_observations o
               JOIN skills s ON s.id = o.skill_id
               LEFT JOIN mentor_tasks mt ON mt.id = o.task_id
               LEFT JOIN internships i ON i.id = mt.internship_id
               WHERE o.intern_id = ? AND (
                   i.provider_id = ? OR
                   o.mentor_id IN (
                       SELECT ma.mentor_id FROM mentor_assignments ma
                       JOIN internships i2 ON i2.id = ma.internship_id
                       WHERE ma.intern_id = ? AND i2.provider_id = ?
                   )
               )
               ORDER BY o.created_at DESC''',
            (intern_id, provider_id, intern_id, provider_id),
        ).fetchall()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Either mentor_id or provider_id must be provided.',
        )

    skills = db.execute(
        '''SELECT s.id, s.name, cs.source
           FROM candidate_skills cs
           JOIN skills s ON s.id = cs.skill_id
           WHERE cs.intern_id = ? ORDER BY s.name''',
        (intern_id,),
    ).fetchall()

    return {
        'intern': serialize(intern),
        'assignment': serialize(assignment) if assignment else None,
        'tasks': [serialize(t) for t in tasks],
        'submissions': [serialize(s) for s in submissions],
        'feedback': [serialize(f) for f in feedback],
        'skills': [serialize(s) for s in skills],
        'observations': [serialize(o) for o in observations],
    }
