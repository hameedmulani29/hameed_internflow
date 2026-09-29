from fastapi import APIRouter, Depends, HTTPException, status

from app.core.permissions import _require_account_trust
from app.core.security import read_token
from app.notifications.shortlist_service import trigger_shortlist_communication

router = APIRouter(prefix='/api', tags=['notifications'])


def _provider_guard(token=Depends(read_token)):
    if token.get('role') != 'provider':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='You do not have permission for this action.')
    try:
        _require_account_trust(token)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Application not found.') from exc
        raise
    return token


@router.post('/applications/{application_id}/shortlist-notify', status_code=status.HTTP_200_OK)
def shortlist_notify(application_id: int, user=Depends(_provider_guard)):
    try:
        return trigger_shortlist_communication(application_id, provider_id=int(user['sub']))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail='Application not found.') from exc
