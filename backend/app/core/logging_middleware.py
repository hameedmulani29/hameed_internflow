import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger('internflow.requests')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
            duration_ms = int((time.time() - start_time) * 1000)
            logger.info(f"{method} {path} - {response.status_code} ({duration_ms}ms)")
            return response
        except Exception as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Unhandled failure on {method} {path} ({duration_ms}ms): {exc}", exc_info=True)
            raise exc
