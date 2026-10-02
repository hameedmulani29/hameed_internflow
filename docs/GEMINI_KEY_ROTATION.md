# InternFlow — Gemini API Key Sequential Rotation & Automatic Failover

> **Document Type:** Technical Architecture & Integration Guide  
> **Service Module:** [`backend/app/services/gemini_service.py`](file:///d:/Web%20Dev%20Projects/internflow/backend/app/services/gemini_service.py)  
> **Last Updated:** October 2, 2026

---

## 1. ARCHITECTURE SUMMARY

InternFlow features a **centralized, thread-safe Gemini API Key Manager & Provider** (`GeminiKeyManager` & `GeminiProvider`) that manages sequential API key rotation, quota error detection, and automatic failover across all AI features in the platform.

```text
       ┌────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
       │  AI Resume Screening   │      │  AI Interview Questions │      │    AI Weekly Report     │
       │ (screening_service.py) │      │ (question_generator.py) │      │(weekly_report_service.py│
       └───────────┬────────────┘      └────────────┬────────────┘      └────────────┬────────────┘
                   │                                │                                │
                   └────────────────────────┐       │       ┌────────────────────────┘
                                            ▼       ▼       ▼
                                ┌───────────────────────────────┐
                                │     GeminiProvider Singleton  │
                                │ (app/services/gemini_service) │
                                └───────────────┬───────────────┘
                                                │
                                                ▼
                                ┌───────────────────────────────┐
                                │       GeminiKeyManager        │
                                │   (Thread-Safe Lock Manager)  │
                                └───────────────┬───────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
    ┌─────────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
    │  Key #1 (Primary)       │    │  Key #2 (Fallback 1)    │    │  Key #3 (Fallback 2)    │
    │  INTERNFLOW_..._KEY_1   │───►│  INTERNFLOW_..._KEY_2   │───►│  INTERNFLOW_..._KEY_3   │
    └────────────┬────────────┘    └────────────┬────────────┘    └────────────┬────────────┘
                 │ (HTTP 429 Quota)             │ (HTTP 429 Quota)             │ (Success 200)
                 └──────────────► Rotation ─────┴──────────────► Rotation ─────┘
                                                │
                                                ▼
                                ┌───────────────────────────────┐
                                │  Google Gemini 2.0 Flash API  │
                                └───────────────────────────────┘
```

---

## 2. CONFIGURATION & ENVIRONMENT VARIABLES

### Numbered Key Rotation (Recommended)
Configure sequential API keys in numerical order:

```env
INTERNFLOW_GEMINI_API_KEY_1=AIzaSy...key_1... # Primary Key
INTERNFLOW_GEMINI_API_KEY_2=AIzaSy...key_2... # First Failover Key
INTERNFLOW_GEMINI_API_KEY_3=AIzaSy...key_3... # Second Failover Key
INTERNFLOW_GEMINI_API_KEY_4=AIzaSy...key_4... # Third Failover Key
INTERNFLOW_GEMINI_API_KEY_5=AIzaSy...key_5... # Fourth Failover Key

INTERNFLOW_GEMINI_MODEL=gemini-2.0-flash
```

### Backward Compatibility
Existing single-key environment variables continue to work seamlessly:
```env
INTERNFLOW_GEMINI_API_KEY=AIzaSy...single_key...
# OR
GEMINI_API_KEY=AIzaSy...single_key...
```
If no numbered keys (`INTERNFLOW_GEMINI_API_KEY_1`, `_2`...) are detected, `GeminiKeyManager` automatically falls back to single-key execution without requiring code modifications.

---

## 3. KEY ROTATION & FAILOVER RULES

### A. Rotation Conditions (Quota & Rate-Limit Errors Only)
Key rotation is triggered **strictly** when the active key is rate-limited or quota-exhausted:
* **HTTP Status Code `429` (Too Many Requests / Rate Limited)**
* **Gemini Error Payloads containing:**
  * `RESOURCE_EXHAUSTED`
  * `RATE_LIMIT_EXCEEDED`
  * `QUOTA_EXCEEDED`
  * `daily quota`
  * `per-minute quota`

When a quota error occurs:
1. `GeminiKeyManager.rotate_key()` advances the active key index thread-safely under a `threading.Lock()`.
2. Safe warning logged: `[Gemini Key Manager] Key #1 (INTERNFLOW_GEMINI_API_KEY_1, AIza...3A8f) quota/rate limited. Rotating to Key #2 (INTERNFLOW_GEMINI_API_KEY_2, AIza...B912).`
3. Request retries instantly using the next key.

### B. Non-Rotation Conditions (Normal Application & Configuration Errors)
Key rotation is **NEVER** triggered for non-quota errors:
* **HTTP `400` Bad Request (Malformed prompt or invalid parameter):** Raises exception immediately. Key is NOT rotated.
* **HTTP `401` Unauthorized / `403` Forbidden (Invalid key or configuration):** Raises `GeminiConfigurationError`. Key is NOT rotated as a quota error.
* **HTTP `500` / `502` / `503` / `504` (Server Error):** Handled via retry/error policy. Key is NOT rotated.

### C. Bounded Failover & All-Keys Exhaustion
* **Retry Bound:** The maximum number of rotation attempts per request is bounded by `len(configured_keys)`. Infinite retry loops are impossible.
* **All Keys Exhausted:** If every configured key returns a quota error, `GeminiProvider` raises `GeminiQuotaExhaustedError("All X configured Gemini API keys have been exhausted due to quota limits.")`.
* **Feature Fallbacks:**
  * **Resume Screening:** Background worker catches exception, sets screening job `status = 'failed'`, preserving database integrity.
  * **AI Interview Questions:** Catches exception and returns structured deterministic interview questions array based on role skills.
  * **AI Weekly Progress Report:** Catches exception and invokes `generate_fallback_report()` returning a structured executive report derived from DB metrics (`ai_status = 'fallback'`).

---

## 4. CONCURRENCY & THREAD SAFETY

`GeminiKeyManager` uses a `threading.Lock()` to manage state transitions. When multiple threads (e.g., concurrent resume screening workers and weekly report generation requests) hit quota limits simultaneously:
* The lock ensures atomic index increment (`self._current_index += 1`).
* Rotation only occurs if `failed_index == self._current_index`, preventing duplicate rotation race conditions across parallel requests.

---

## 5. SECURITY & CREDENTIAL PROTECTION

* **Key Masking:** `mask_key()` masks API keys in log outputs (e.g. `AIza...3A8f`). Full keys are never printed.
* **Zero Client Leakage:** Gemini keys are accessed strictly inside backend Python services. Zero keys are rendered in frontend assets, API responses, or database records.

---

## 6. AUTOMATED TEST SUITE

Automated unit tests in [`backend/tests/test_gemini_key_rotation.py`](file:///d:/Web%20Dev%20Projects/internflow/backend/tests/test_gemini_key_rotation.py) verify the failover mechanism:

```text
============================= test session starts =============================
backend/tests/test_gemini_key_rotation.py ..........                     [100%]
============================= 10 passed in 8.20s ==============================
```

### Verified Scenarios
1. `test_is_quota_error_detection`: Verifies HTTP 429 and payload string matching.
2. `test_mask_key_security`: Verifies string masking for logs.
3. `test_single_key_backward_compatibility`: Verifies single-key env variable fallback.
4. `test_numbered_key_discovery_and_order`: Verifies deterministic numerical ordering (`KEY_1` -> `KEY_2` -> `KEY_3`).
5. `test_sequential_rotation_on_quota`: Verifies automatic retry on key 2 when key 1 returns 429.
6. `test_all_keys_exhausted`: Verifies `GeminiQuotaExhaustedError` when all keys fail.
7. `test_non_quota_error_does_not_rotate`: Verifies HTTP 400 Bad Request does not trigger rotation.
8. `test_auth_error_distinguished_from_quota`: Verifies HTTP 401 raises `GeminiConfigurationError`.
9. `test_concurrent_requests_safety`: Verifies thread safety during parallel multi-threaded failovers.
10. `test_services_integration_fallbacks`: Verifies end-to-end fallback behavior for screening, questions, and weekly reports.
