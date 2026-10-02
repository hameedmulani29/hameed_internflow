from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.permissions import require_roles
from app.db import get_db

router = APIRouter(prefix='/api/skills', tags=['skills'])


def normalize_skill_name(raw: str) -> str:
    """Light normalization so 'python', 'Python ' and 'Python 3' share one entry.

    Deliberately not an NLP taxonomy: casefold, collapse whitespace, and drop
    a trailing version-like token ('python 3' -> 'python', 'python 3.11' ->
    'python'). Words like 'sql server' are untouched.
    """
    parts = raw.strip().split()
    while len(parts) > 1 and all(ch.isdigit() or ch == '.' for ch in parts[-1]):
        parts.pop()
    return ' '.join(parts).casefold()


def display_name(raw: str) -> str:
    """Title-case each word for display ('fastapi' -> 'Fastapi' is acceptable;
    the catalog keeps the first casing a skill was created with)."""
    return ' '.join(part.capitalize() for part in raw.strip().split())


def get_or_create_skill(db, raw_name: str) -> tuple[int, str]:
    normalized = normalize_skill_name(raw_name)
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='Skill name is required.')
    row = db.execute('SELECT id, name FROM skills WHERE name = %s', (normalized,)).fetchone()
    if row:
        return row['id'], row['name']
    cursor = db.execute('INSERT INTO skills (name) VALUES (%s) RETURNING id', (normalized,))
    return cursor.fetchone()['id'], normalized


def resolve_skill_ids(db, names):
    ids = []
    for name in names:
        skill_id, _ = get_or_create_skill(db, name)
        ids.append(skill_id)
    return ids


class SkillInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class CandidateSkillsInput(BaseModel):
    skills: list[str] = Field(default_factory=list, max_length=50)


class ObservationInput(BaseModel):
    intern_id: int
    skill: str = Field(min_length=1, max_length=60)
    level: str = Field(pattern='^(emerging|developing|proficient|strong)$')
    note: str | None = Field(default=None, max_length=2000)
    task_id: int | None = None


def serialize_skill(row):
    return {'id': row['id'], 'name': row['name'], 'category': row['category']}


def _ensure_mentor_assignment(db, mentor_id: int, intern_id: int) -> None:
    assignment = db.execute(
        "SELECT id FROM mentor_assignments WHERE mentor_id = ? AND intern_id = ? AND status = 'active'",
        (mentor_id, intern_id),
    ).fetchone()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='No active assignment for this intern.')


@router.get('')
def list_skills():
    """Public skill catalog (used for autocomplete and internship skill display)."""
    with get_db() as db:
        rows = db.execute('SELECT id, name, category FROM skills ORDER BY name').fetchall()
    return {'items': [serialize_skill(row) for row in rows]}


@router.get('/match/{internship_id}')
def match_skills_for_me(internship_id: int, token=Depends(require_roles('intern'))):
    """Intern-facing match: my declared skills vs an internship's required skills."""
    intern = int(token['sub'])
    with get_db() as db:
        internship = db.execute(
            "SELECT id, title FROM internships WHERE id = ? AND status = 'published'",
            (internship_id,),
        ).fetchone()
        if not internship:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Published internship not found.')

        required = db.execute(
            '''SELECT s.id, s.name FROM internship_skills isx
               JOIN skills s ON s.id = isx.skill_id
               WHERE isx.internship_id = ? ORDER BY s.name''',
            (internship_id,),
        ).fetchall()
        declared = db.execute(
            '''SELECT s.id, s.name FROM candidate_skills cs
               JOIN skills s ON s.id = cs.skill_id
               WHERE cs.intern_id = ? ORDER BY s.name''',
            (intern,),
        ).fetchall()

    required_ids = {row['id'] for row in required}
    declared_ids = {row['id'] for row in declared}
    matched = sorted(
        [{'id': row['id'], 'name': row['name']} for row in required if row['id'] in declared_ids],
        key=lambda item: item['name'],
    )
    gaps = sorted(
        [{'id': row['id'], 'name': row['name']} for row in required if row['id'] not in declared_ids],
        key=lambda item: item['name'],
    )
    return {
        'internship': {'id': internship['id'], 'title': internship['title']},
        'matched_skills': matched,
        'potential_gaps': gaps,
        'declared_skills': [{'id': row['id'], 'name': row['name']} for row in declared],
    }
