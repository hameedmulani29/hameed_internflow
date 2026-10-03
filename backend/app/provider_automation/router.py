from fastapi import APIRouter, Depends

from app.core.permissions import require_roles
from app.db import get_db
from app.services.intern_detail_service import get_intern_progress_detail

router = APIRouter(prefix='/api/provider/automation', tags=['provider-automation'])


@router.get('/interns/{intern_id}/detail')
def get_provider_automation_intern_detail(intern_id: int, token=Depends(require_roles('provider'))):
    """Make automation endpoint for provider to retrieve internship progress detail for an authorized intern."""
    provider_id = int(token['sub'])
    with get_db() as db:
        return get_intern_progress_detail(db, intern_id=intern_id, provider_id=provider_id)
