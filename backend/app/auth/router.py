from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.core.config import validate_email_for_role
from app.core.security import create_token, hash_password, verify_password
from app.db import get_db, is_unique_violation, seed_mentor_demo_data

router = APIRouter(prefix='/api/auth', tags=['auth'])


class RegisterRequest(BaseModel):
    role: str = Field(pattern='^(provider|mentor|intern)$')
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    organization: str | None = Field(default=None, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


@router.post('/register')
def register(payload: RegisterRequest):
    email_lower = payload.email.lower()
    if payload.role == 'provider' and not payload.organization:
        raise HTTPException(status_code=422, detail='Organization name is required for providers.')
    if not validate_email_for_role(payload.role, email_lower):
        if payload.role == 'provider':
            raise HTTPException(status_code=422, detail='Provider email domain is not allowed by the configured policy.')
        if payload.role == 'mentor':
            raise HTTPException(status_code=422, detail='Mentor email domain is not allowed by the configured policy.')
    with get_db() as db:
        try:
            is_approved = 1
            is_verified = 1
            cursor = db.execute(
                'INSERT INTO users (full_name, email, password_hash, role, organization, is_active, is_verified, is_approved, trust_level, requires_2fa) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id',
                (payload.full_name.strip(), email_lower, hash_password(payload.password), payload.role, payload.organization, 1, is_verified, is_approved, 'approved', 0),
            )
            ret = cursor.fetchone()
            user_id = ret["id"] if isinstance(ret, dict) or hasattr(ret, "__getitem__") and "id" in ret else ret[0]
            db.commit()
        except Exception as error:
            if is_unique_violation(error):
                raise HTTPException(status_code=409, detail='An account with this email already exists.') from error
            raise
        if payload.role == 'mentor':
            seed_mentor_demo_data(db, user_id)
    return {'user': {'id': user_id, 'full_name': payload.full_name, 'email': payload.email, 'role': payload.role, 'organization': payload.organization}, 'token': create_token(user_id, payload.role)}


@router.post('/login')
def login(payload: LoginRequest):
    email_lower = payload.email.lower()
    with get_db() as db:
        user = db.execute('SELECT * FROM users WHERE email = %s', (email_lower,)).fetchone()
    if not user or not verify_password(payload.password, user['password_hash']):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid email or password.')
    if user['role'] in {'provider', 'mentor'}:
        if user['is_active'] != 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account is not active.')
        if user['is_verified'] != 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account email must be verified before privileged access.')
        if user['is_approved'] != 1 or (user['trust_level'] or '').lower() not in {'approved', 'active'}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account is not approved for privileged access.')
        if user['requires_2fa'] == 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Two-factor authentication is required for this account.')
    return {'user': {'id': user['id'], 'full_name': user['full_name'], 'email': user['email'], 'role': user['role'], 'organization': user['organization']}, 'token': create_token(user['id'], user['role'])}
