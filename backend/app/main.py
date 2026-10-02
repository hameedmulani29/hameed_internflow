from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.applications.router import router as applications_router
from app.assessments.router import router as assessments_router
from app.attendance.router import router as attendance_router
from app.auth.router import router as auth_router
from app.core.config import CORS_ORIGINS
from app.core.logging_middleware import StructuredLoggingMiddleware
from app.core.rate_limiter import SimpleRateLimiterMiddleware
from app.db import get_db, init_db
from app.evidence.router import router as evidence_router
from app.goals.router import router as goals_router
from app.interns.router import intern_websocket, router as interns_router
from app.internships.router import router as internships_router
from app.interviews.router import router as interviews_router
from app.mentor_feedback.router import router as mentor_feedback_router
from app.mentors.router import router as mentor_router, mentor_websocket
from app.notifications.router import router as notifications_router
from app.outcomes.router import router as outcomes_router
from app.progress.router import router as progress_router
from app.skills.router import router as skills_router

app = FastAPI(title='InternFlow API', version='1.0.0')

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS or ['http://localhost:5173'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(SimpleRateLimiterMiddleware, requests_per_minute=120)

app.include_router(auth_router)
app.include_router(internships_router)
app.include_router(applications_router)
app.include_router(interns_router)
app.include_router(attendance_router)
app.include_router(mentor_router)
app.include_router(mentor_feedback_router)
app.include_router(skills_router)
app.include_router(notifications_router)
app.include_router(assessments_router)
app.include_router(interviews_router)
app.include_router(goals_router)
app.include_router(evidence_router)
app.include_router(outcomes_router)
app.include_router(progress_router)

# Mount alias for /api/ws/mentor
app.websocket('/api/ws/mentor')(mentor_websocket)

# Mount alias for /api/ws/intern (intern real-time updates)
app.websocket('/api/ws/intern')(intern_websocket)


@app.on_event('startup')
def startup():
    init_db()


@app.get('/health')
@app.get('/api/health')
@app.get('/ready')
@app.get('/api/ready')
def health():
    try:
        with get_db() as db:
            db.execute("SELECT 1").fetchone()
        db_status = "healthy"
    except Exception as exc:
        db_status = f"unhealthy: {exc}"
        return {'status': 'degraded', 'database': db_status}, 503
    return {'status': 'ok', 'database': db_status}

