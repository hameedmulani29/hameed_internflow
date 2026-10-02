# InternFlow — Gemini AI & Key Rotation Production Audit

> **Deployment Audit Document**  
> **Target AI Engine:** Google Gemini REST API (`gemini-2.0-flash`)  
> **Implementation File:** `backend/app/services/gemini_service.py`  
> **Test File:** `backend/tests/test_gemini_key_rotation.py`

---

## 1. Architecture Overview

InternFlow integrates Google Gemini AI directly on the Python backend using server-side REST API calls via `httpx.Client`. No third-party SDK or external service layer (like Make.com) is used for AI generation.

```text
FastAPI Router / Service
          │
          ▼
   GeminiProvider ── (uses) ──> GeminiKeyManager (Thread-Safe Lock)
          │                            │
          │ HTTP POST (params={"key": api_key})
          ▼                            │ (Sequential Rotation on 429 / Quota Error)
Google Gemini REST API                 ▼
(gemini-2.0-flash)            INTERNFLOW_GEMINI_API_KEY_1
                              INTERNFLOW_GEMINI_API_KEY_2
                              INTERNFLOW_GEMINI_API_KEY_3...
```

---

## 2. Key Rotation System Audit & Verification

### Sequential Key Discovery & Ordering
- `GeminiKeyManager.reload_keys()` scans `os.environ` for numbered environment variables matching `INTERNFLOW_GEMINI_API_KEY_(\d+)`.
- Sorts key indices numerically (`_1`, `_2`, `_3`...).
- Falls back to `INTERNFLOW_GEMINI_API_KEY` or `GEMINI_API_KEY` if no numbered keys exist.

### Failure Detection & Rotation Rule
- `is_quota_error(status_code, response_text)` inspects responses for HTTP status `429` as well as explicit Gemini quota JSON strings (`RESOURCE_EXHAUSTED`, `rate_limit_exceeded`, `quota_exceeded`, `daily quota`, `per-minute quota`).
- When a quota error occurs, `GeminiKeyManager.rotate_key(failed_index)` thread-safely advances to the next key.
- Multi-thread safety is guaranteed via `threading.Lock()` to prevent race conditions during rotation.

### Error Differentiation & Non-Rotation
- **Authentication Errors (HTTP 401 / 403):** Does NOT blindly rotate keys; raises `GeminiConfigurationError`.
- **Bad Request Errors (HTTP 400):** Does NOT rotate keys; raises `RuntimeError` describing invalid prompt/schema.
- **Server Errors (HTTP 5xx) & Network Timeouts:** Raises HTTP error for retry handling.

### Credential Masking & Security
- All log messages utilize `mask_key(api_key)` (e.g. `AIza...CDEF`). API keys are never written in full to application logs or error tracebacks.

### Fallback Behavior
- When no API keys are configured, or when all configured keys are exhausted, higher-level services (`call_gemini_screening`, `generate_interview_questions_ai`, `call_gemini_weekly_report`) fall back to deterministic offline heuristic generators.

---

## 3. Test Suite Verification

The test suite in `backend/tests/test_gemini_key_rotation.py` covers 10 dedicated test cases:
1. `test_is_quota_error_detection`: Verifies 429 status codes and quota keywords.
2. `test_mask_key_security`: Verifies key masking logic.
3. `test_single_key_backward_compatibility`: Verifies single-key fallback.
4. `test_numbered_key_discovery_and_order`: Verifies ordered discovery (`_1`, `_2`, `_3`).
5. `test_sequential_rotation_on_quota`: Verifies rotation on 429.
6. `test_all_keys_exhausted`: Verifies `GeminiQuotaExhaustedError` when all keys fail.
7. `test_non_quota_error_does_not_rotate`: Verifies 400 Bad Request retains active key.
8. `test_auth_error_distinguished_from_quota`: Verifies 401 raises `GeminiConfigurationError`.
9. `test_concurrent_requests_safety`: Verifies thread lock across 10 concurrent worker threads.
10. `test_services_integration_fallbacks`: Verifies offline fallback output when no keys configured.

**Audit Result:** 🟢 **GEMINI AI & KEY ROTATION SYSTEM IS VERIFIED & PRODUCTION READY**
