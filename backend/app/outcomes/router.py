import json
import secrets
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.permissions import require_roles, current_user
from app.db import get_db
from app.services.certificate_generator import generate_certificate_pdf, get_storage_dir, sanitize_certificate_id
from app.services.webhook_service import emit_certificate_issued_event

router = APIRouter(prefix='/api', tags=['outcomes'])


def evaluate_verified_skills(db, intern_id: int) -> list[dict]:
    """Explicit backend rule for skill verification.

    A skill is marked VERIFIED if:
    1. Assessment score for the skill >= 70% OR
    2. Mentor observation level is 'proficient' or 'strong' OR
    3. Final evaluation evidence exists for the skill.
    """
    candidate_skills = db.execute(
        '''SELECT cs.skill_id, s.name AS skill_name
           FROM candidate_skills cs
           JOIN skills s ON s.id = cs.skill_id
           WHERE cs.intern_id = ?''',
        (intern_id,),
    ).fetchall()

    verified_list = []

    for cs in candidate_skills:
        sk_id = cs['skill_id']
        sk_name = cs['skill_name']

        evidence_items = db.execute(
            'SELECT * FROM skill_evidence WHERE candidate_id = ? AND skill_id = ?',
            (intern_id, sk_id),
        ).fetchall()

        reasons = []
        is_verified = False

        for ev in evidence_items:
            stype = ev['source_type']
            score = ev['score'] or 0
            level = (ev['level'] or '').casefold()

            if stype == 'assessment' and score >= 70:
                is_verified = True
                reasons.append(f"Assessment score {score}%")
            elif stype == 'mentor_observation' and level in {'proficient', 'strong'}:
                is_verified = True
                reasons.append(f"Mentor observation ({level})")
            elif stype == 'final_evaluation':
                is_verified = True
                reasons.append(f"Final evaluation ({level or 'confirmed'})")
            elif stype == 'interview' and score >= 75:
                is_verified = True
                reasons.append(f"Interview rating ({score}%)")

        if is_verified:
            rule_text = "Verified via " + ", ".join(reasons)
            db.execute(
                '''INSERT INTO verified_skills (intern_id, skill_id, verification_rule, verified_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(intern_id, skill_id) DO UPDATE SET
                   verification_rule = excluded.verification_rule, verified_at = CURRENT_TIMESTAMP''',
                (intern_id, sk_id, rule_text),
            )
            verified_list.append({'skill_id': sk_id, 'skill_name': sk_name, 'rule': rule_text})

    return verified_list


def get_or_create_passport(db, intern_id: int) -> dict:
    row = db.execute('SELECT * FROM skill_passports WHERE candidate_id = ?', (intern_id,)).fetchone()
    if row:
        return dict(row)

    code = f"SP-2026-{secrets.token_hex(4).upper()}"
    db.execute(
        'INSERT INTO skill_passports (candidate_id, passport_code, is_public) VALUES (?, ?, 0)',
        (intern_id, code),
    )
    db.commit()
    row = db.execute('SELECT * FROM skill_passports WHERE candidate_id = ?', (intern_id,)).fetchone()
    return dict(row)


def _ensure_certificate_pdf_exists(cert_dict: dict) -> str:
    """Helper to ensure the physical PDF artifact exists on disk."""
    cert_code = cert_dict['certificate_id']
    safe_code = sanitize_certificate_id(cert_code)
    target_dir = get_storage_dir()
    expected_path = target_dir / f"certificate_{safe_code}.pdf"

    if expected_path.is_file():
        return str(expected_path.resolve())

    # Regenerate PDF safely if missing
    try:
        skills = json.loads(cert_dict.get('verified_skills', '[]'))
    except Exception:
        skills = []

    generated_path = generate_certificate_pdf(
        certificate_id=cert_code,
        candidate_name=cert_dict['candidate_name'],
        internship_title=cert_dict['internship_title'],
        provider_name=cert_dict['provider_name'],
        issue_date=cert_dict['issue_date'],
        verified_skills=skills,
        verification_url=cert_dict['verification_url'],
    )
    return generated_path


# ================= Outcomes & Verification API =================

@router.post('/outcomes/complete/{assignment_id}', status_code=status.HTTP_200_OK)
def complete_internship_outcome(assignment_id: int, user=Depends(require_roles('provider', 'mentor'))):
    provider_id = int(user['sub'])
    with get_db() as db:
        assignment = db.execute('SELECT * FROM mentor_assignments WHERE id = ?', (assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail='Mentor assignment not found.')

        intern_id = assignment['intern_id']
        internship_id = assignment['internship_id'] or 1

        # Check final evaluation completion (Strict eligibility check)
        fe = db.execute("SELECT * FROM final_evaluations WHERE assignment_id = ? AND status = 'submitted'", (assignment_id,)).fetchone()
        if not fe:
            raise HTTPException(status_code=400, detail='Final evaluation must be submitted before completing internship.')

        # Calculate goals and tasks completion
        goals_row = db.execute(
            '''SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
               FROM internship_goals WHERE assignment_id = ?''',
            (assignment_id,),
        ).fetchone()
        tot_goals = goals_row['total'] or 0
        comp_goals = goals_row['completed'] or 0

        tasks_row = db.execute(
            '''SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
               FROM mentor_tasks WHERE intern_id = ?''',
            (intern_id,),
        ).fetchone()
        tot_tasks = tasks_row['total'] or 0
        comp_tasks = tasks_row['completed'] or 0

        # Create internship_outcome
        db.execute(
            '''INSERT INTO internship_outcomes (assignment_id, intern_id, internship_id, provider_id, status, duration_weeks, goals_completed, total_goals, tasks_completed, total_tasks, final_evaluation_id, verified_at)
               VALUES (?, ?, ?, ?, 'completed', 8, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(assignment_id) DO UPDATE SET
               status='completed', goals_completed=excluded.goals_completed, total_goals=excluded.total_goals,
               tasks_completed=excluded.tasks_completed, total_tasks=excluded.total_tasks, verified_at=CURRENT_TIMESTAMP''',
            (assignment_id, intern_id, internship_id, provider_id, comp_goals, tot_goals, comp_tasks, tot_tasks, fe['id']),
        )

        outcome_row = db.execute('SELECT * FROM internship_outcomes WHERE assignment_id = ?', (assignment_id,)).fetchone()
        outcome_id = outcome_row['id']

        # Evaluate verified skills
        verified_skills_list = evaluate_verified_skills(db, intern_id)
        skill_names = [s['skill_name'] for s in verified_skills_list]

        # Check existing certificate for idempotency
        existing_cert = db.execute('SELECT * FROM certificates WHERE outcome_id = ?', (outcome_id,)).fetchone()

        user_row = db.execute('SELECT full_name, email FROM users WHERE id = ?', (intern_id,)).fetchone()
        provider_row = db.execute('SELECT organization, full_name FROM users WHERE id = ?', (provider_id,)).fetchone()
        internship_row = db.execute('SELECT title FROM internships WHERE id = ?', (internship_id,)).fetchone()

        candidate_name = user_row['full_name'] if user_row else 'Intern Candidate'
        intern_email = user_row['email'] if user_row else 'intern@internflow.com'
        provider_name = (provider_row['organization'] or provider_row['full_name']) if provider_row else 'InternFlow Partner'
        internship_title = internship_row['title'] if internship_row else 'Software Engineering Internship'

        if existing_cert:
            cert_code = existing_cert['certificate_id']
            issue_date_val = existing_cert['issue_date']
        else:
            cert_code = f"IF-2026-{secrets.token_hex(4).upper()}"
            issue_date_val = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        verify_url = f"https://internflow.com/verify/{cert_code}"
        download_url = f"/api/certificates/{cert_code}/download"

        # Generate physical PDF artifact
        pdf_file_path = generate_certificate_pdf(
            certificate_id=cert_code,
            candidate_name=candidate_name,
            internship_title=internship_title,
            provider_name=provider_name,
            issue_date=issue_date_val,
            verified_skills=skill_names,
            verification_url=verify_url,
        )

        db.execute(
            '''INSERT INTO certificates (certificate_id, outcome_id, intern_id, provider_id, internship_id, candidate_name, internship_title, provider_name, issue_date, verified_skills, verification_url, file_path, download_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(outcome_id) DO UPDATE SET
               verified_skills=excluded.verified_skills,
               file_path=excluded.file_path,
               download_url=excluded.download_url''',
            (cert_code, outcome_id, intern_id, provider_id, internship_id, candidate_name, internship_title, provider_name, issue_date_val, json.dumps(skill_names), verify_url, pdf_file_path, download_url),
        )

        # Mark assignment as completed
        db.execute("UPDATE mentor_assignments SET status = 'completed' WHERE id = ?", (assignment_id,))

        # Initialize skill passport
        get_or_create_passport(db, intern_id)

        db.commit()

        cert_row = db.execute('SELECT * FROM certificates WHERE outcome_id = ?', (outcome_id,)).fetchone()

    # Emit event for Make #25 (Non-blocking, post-commit)
    emit_certificate_issued_event(
        certificate_id=cert_code,
        intern_id=intern_id,
        intern_name=candidate_name,
        intern_email=intern_email,
        internship_id=internship_id,
        internship_title=internship_title,
        provider_id=provider_id,
        provider_name=provider_name,
        issue_date=cert_row['issue_date'],
        verification_url=verify_url,
        download_url=download_url,
    )

    return {
        'outcome': dict(outcome_row),
        'verified_skills': verified_skills_list,
        'certificate': dict(cert_row),
    }


@router.get('/outcomes/me')
def get_my_internship_outcome(user=Depends(require_roles('intern'))):
    intern_id = int(user['sub'])
    with get_db() as db:
        outcome = db.execute('SELECT * FROM internship_outcomes WHERE intern_id = ? ORDER BY id DESC LIMIT 1', (intern_id,)).fetchone()
        if not outcome:
            return {'has_outcome': False, 'outcome': None}

        cert = db.execute('SELECT * FROM certificates WHERE outcome_id = ?', (outcome['id'],)).fetchone()
        verified = db.execute(
            '''SELECT vs.*, s.name AS skill_name FROM verified_skills vs
               JOIN skills s ON s.id = vs.skill_id
               WHERE vs.intern_id = ?''',
            (intern_id,),
        ).fetchall()

    return {
        'has_outcome': True,
        'outcome': dict(outcome),
        'certificate': dict(cert) if cert else None,
        'verified_skills': [dict(v) for v in verified],
    }


# ================= Skill Passport API =================

@router.get('/skill-passport/me')
def get_my_skill_passport(user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        passport = get_or_create_passport(db, candidate_id)
        user_row = db.execute('SELECT full_name, email FROM users WHERE id = ?', (candidate_id,)).fetchone()

        verified = db.execute(
            '''SELECT vs.*, s.name AS skill_name FROM verified_skills vs
               JOIN skills s ON s.id = vs.skill_id
               WHERE vs.intern_id = ?''',
            (candidate_id,),
        ).fetchall()

        skills_detail = []
        for v in verified:
            v_dict = dict(v)
            evidence = db.execute(
                'SELECT * FROM skill_evidence WHERE candidate_id = ? AND skill_id = ? ORDER BY created_at DESC',
                (candidate_id, v['skill_id']),
            ).fetchall()
            v_dict['evidence'] = [dict(e) for e in evidence]
            skills_detail.append(v_dict)

        outcomes = db.execute(
            '''SELECT io.*, i.title AS internship_title, u.full_name AS provider_name
               FROM internship_outcomes io
               JOIN internships i ON i.id = io.internship_id
               JOIN users u ON u.id = io.provider_id
               WHERE io.intern_id = ?''',
            (candidate_id,),
        ).fetchall()

    return {
        'passport': passport,
        'candidate': dict(user_row),
        'verified_skills': skills_detail,
        'outcomes': [dict(o) for o in outcomes],
    }


class VisibilityInput(BaseModel):
    is_public: bool


@router.post('/skill-passport/toggle-visibility')
def toggle_passport_visibility(payload: VisibilityInput, user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        get_or_create_passport(db, candidate_id)
        db.execute('UPDATE skill_passports SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE candidate_id = ?', (1 if payload.is_public else 0, candidate_id))
        db.commit()
        passport = db.execute('SELECT * FROM skill_passports WHERE candidate_id = ?', (candidate_id,)).fetchone()
    return dict(passport)


@router.get('/skill-passport/public/{passport_code}')
def get_public_skill_passport(passport_code: str):
    with get_db() as db:
        passport = db.execute('SELECT * FROM skill_passports WHERE passport_code = ?', (passport_code,)).fetchone()
        if not passport:
            raise HTTPException(status_code=404, detail='Skill Passport not found.')

        if not passport['is_public']:
            raise HTTPException(status_code=403, detail='This Skill Passport is private.')

        candidate_id = passport['candidate_id']
        candidate = db.execute('SELECT full_name FROM users WHERE id = ?', (candidate_id,)).fetchone()

        verified = db.execute(
            '''SELECT vs.*, s.name AS skill_name FROM verified_skills vs
               JOIN skills s ON s.id = vs.skill_id
               WHERE vs.intern_id = ?''',
            (candidate_id,),
        ).fetchall()

        skills_detail = []
        for v in verified:
            v_dict = dict(v)
            evidence = db.execute(
                '''SELECT source_type, title, details, score, level, created_at FROM skill_evidence
                   WHERE candidate_id = ? AND skill_id = ? ORDER BY created_at DESC''',
                (candidate_id, v['skill_id']),
            ).fetchall()
            v_dict['evidence'] = [dict(e) for e in evidence]
            skills_detail.append(v_dict)

        outcomes = db.execute(
            '''SELECT io.status, io.duration_weeks, i.title AS internship_title, u.full_name AS provider_name
               FROM internship_outcomes io
               JOIN internships i ON i.id = io.internship_id
               JOIN users u ON u.id = io.provider_id
               WHERE io.intern_id = ?''',
            (candidate_id,),
        ).fetchall()

    return {
        'candidate_name': candidate['full_name'] if candidate else 'Candidate',
        'passport_code': passport_code,
        'verified_skills': skills_detail,
        'outcomes': [dict(o) for o in outcomes],
    }


# ================= Certificates & Public Verification API =================

@router.get('/certificates/provider')
def get_provider_certificates(user=Depends(require_roles('provider'))):
    """Provider view of certificates issued for the provider's own internships."""
    provider_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM certificates WHERE provider_id = ? ORDER BY id DESC',
            (provider_id,),
        ).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/certificates/me')
def get_my_certificates(user=Depends(require_roles('intern'))):
    candidate_id = int(user['sub'])
    with get_db() as db:
        rows = db.execute('SELECT * FROM certificates WHERE intern_id = ? ORDER BY id DESC', (candidate_id,)).fetchall()
    return {'items': [dict(r) for r in rows]}


@router.get('/certificates/{certificate_id}')
def get_certificate_details(certificate_id: str, user=Depends(current_user)):
    """Retrieve detailed certificate metadata for authorized users (intern, provider, mentor)."""
    user_id = int(user['sub'])
    user_role = user.get('role')

    with get_db() as db:
        cert = db.execute('SELECT * FROM certificates WHERE certificate_id = ?', (certificate_id,)).fetchone()
        if not cert:
            raise HTTPException(status_code=404, detail='Certificate not found.')

        cert_dict = dict(cert)

        # Authorization check: intern owner, issuing provider, mentor, or admin
        if user_role == 'intern' and cert_dict['intern_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')
        if user_role == 'provider' and cert_dict['provider_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')

        return cert_dict


@router.get('/certificates/{certificate_id}/view')
def view_certificate_pdf(certificate_id: str, user=Depends(current_user)):
    """Inline view of the generated PDF certificate artifact in browser."""
    user_id = int(user['sub'])
    user_role = user.get('role')

    with get_db() as db:
        cert = db.execute('SELECT * FROM certificates WHERE certificate_id = ?', (certificate_id,)).fetchone()
        if not cert:
            raise HTTPException(status_code=404, detail='Certificate not found.')

        cert_dict = dict(cert)

        if user_role == 'intern' and cert_dict['intern_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')
        if user_role == 'provider' and cert_dict['provider_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')

    pdf_path = _ensure_certificate_pdf_exists(cert_dict)
    return FileResponse(
        pdf_path,
        media_type='application/pdf',
        headers={'Content-Disposition': f'inline; filename="certificate_{certificate_id}.pdf"'},
    )


@router.get('/certificates/{certificate_id}/download')
def download_certificate_pdf(certificate_id: str, user=Depends(current_user)):
    """Download the generated PDF certificate artifact as an attachment."""
    user_id = int(user['sub'])
    user_role = user.get('role')

    with get_db() as db:
        cert = db.execute('SELECT * FROM certificates WHERE certificate_id = ?', (certificate_id,)).fetchone()
        if not cert:
            raise HTTPException(status_code=404, detail='Certificate not found.')

        cert_dict = dict(cert)

        if user_role == 'intern' and cert_dict['intern_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')
        if user_role == 'provider' and cert_dict['provider_id'] != user_id:
            raise HTTPException(status_code=403, detail='Access denied to this certificate.')

    pdf_path = _ensure_certificate_pdf_exists(cert_dict)
    filename = f"InternFlow_Certificate_{certificate_id}.pdf"
    return FileResponse(
        pdf_path,
        media_type='application/pdf',
        filename=filename,
    )


@router.get('/verify/{certificate_id}')
def verify_certificate_public(certificate_id: str):
    """PUBLIC Certificate Verification Endpoint.

    Returns only safe public verification information. Protects private email,
    internal notes, and sensitive candidate data.
    """
    with get_db() as db:
        cert = db.execute('SELECT * FROM certificates WHERE certificate_id = ?', (certificate_id,)).fetchone()
        if not cert:
            raise HTTPException(status_code=404, detail='Certificate invalid or not found.')

    cert_dict = dict(cert)
    try:
        skills = json.loads(cert_dict['verified_skills'])
    except Exception:
        skills = []

    return {
        'valid': True,
        'status': 'Verified Certificate ✓',
        'certificate_id': cert_dict['certificate_id'],
        'candidate_name': cert_dict['candidate_name'],
        'internship_title': cert_dict['internship_title'],
        'provider_name': cert_dict['provider_name'],
        'issue_date': cert_dict['issue_date'],
        'verified_skills': skills,
        'verification_url': cert_dict['verification_url'],
        'download_url': cert_dict.get('download_url') or f"/api/certificates/{cert_dict['certificate_id']}/download",
    }
