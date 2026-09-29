from fastapi import Depends, HTTPException, status

from app.db import get_db

from .security import optional_token, read_token


def _require_account_trust(token):
    with get_db() as db:
        user = db.execute(
            'SELECT id, role, is_active, is_verified, is_approved, trust_level, requires_2fa FROM users WHERE id = ?',
            (int(token.get('sub')), ),
        ).fetchone()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication is required.')
    if user['is_active'] != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account is not active.')
    if user['is_verified'] != 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account email must be verified before privileged access.')
    if user['is_approved'] != 1 or (user['trust_level'] or '').lower() not in {'approved', 'active'}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Your account is not approved for privileged access.')
    if user['requires_2fa'] == 1:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Two-factor authentication is required for this account.')
    return user


def require_roles(*roles):
    def dependency(token=Depends(read_token)):
        if token.get('role') not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='You do not have permission for this action.')
        _require_account_trust(token)
        return token
    return dependency


def current_user(token=Depends(read_token)):
    return token


def optional_user(token=Depends(optional_token)):
    return token
