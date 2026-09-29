import time
from collections import defaultdict
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware

# In-memory token bucket rate limiter per client IP
class SimpleRateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests_per_minute: int = 120):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.client_records = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        # Apply rate limiting to sensitive API routes
        path = request.url.path
        is_sensitive = any(
            path.startswith(prefix) for prefix in [
                '/api/auth/login',
                '/api/auth/register',
                '/api/applications/screen',
                '/api/assessments/attempts',
                '/api/verify'
            ]
        )

        if is_sensitive and request.method != 'OPTIONS':
            client_ip = request.client.host if request.client else '127.0.0.1'
            now = time.time()
            cutoff = now - 60.0

            # Filter records in the last 60 seconds
            recent = [t for t in self.client_records[client_ip] if t > cutoff]
            self.client_records[client_ip] = recent

            limit = 20 if ('login' in path or 'register' in path or 'screen' in path) else 60
            if len(recent) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail='Rate limit exceeded. Please wait a moment before trying again.'
                )

            self.client_records[client_ip].append(now)

        response = await call_next(request)
        return response
