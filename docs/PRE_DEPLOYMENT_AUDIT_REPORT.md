# InternFlow Pre-Deployment Audit

## 1. Executive Summary
This document provides the authoritative master pre-deployment validation audit for the InternFlow internship-management platform. Every claim in this report is grounded in direct code inspection, empirical test execution, API verification, and structural codebase search across both backend (FastAPI Python) and frontend (React/Vite).

Overall, InternFlow features an exceptionally high degree of functional completeness: 155 out of 155 automated backend tests pass, full end-to-end user workflows operate seamlessly, report-generation and certificate-rendering engines are fully built, and Google Gemini API key rotation is completely verified and thread-safe.

However, InternFlow is **NOT SAFE FOR DEPLOYMENT** in its current state due to 2 CRITICAL deployment blockers:
1. **Hardcoded SQLite Driver & Engine (`app/db.py`):** The runtime backend code uses Python's `sqlite3` standard library with raw SQLite DDL, SQLite pragmas, and SQLite-specific SQL syntax (`cursor.lastrowid`, `INSERT OR IGNORE`, `if 'UNIQUE constraint' in str(error)`). It completely ignores `DATABASE_URL` pointing to PostgreSQL.
2. **Hardcoded JWT Secret Default:** `app/core/config.py` defaults `JWT_SECRET` to `'internflow-development-secret-change-me-2026'` if the environment variable is omitted.

In addition, 16 out of 26 Make.com webhook URLs in `.env` are unconfigured (standby), which blocks downstream transactional email scenarios from triggering in production.

---

## 2. Actual System Architecture

The true runtime architecture discovered from repository inspection:

```text
Frontend (React 18 + Vite)
   │
   │ HTTPS / REST API Calls (Authorization: Bearer <JWT>)
   ▼
API Layer (FastAPI + CORSMiddleware + StructuredLogging + RateLimiter)
   │
   ├── Authentication & Role Authorization (app/core/permissions.py)
   │
   ├── Business Logic & Services (app/services/*, app/*/router.py)
   │     ├── Gemini Service (gemini_service.py -> REST API gemini-2.0-flash)
   │     ├── Webhook Service (webhook_service.py -> Outbound Make.com Webhooks)
   │     ├── Certificate Generator (certificate_generator.py -> ReportLab PDF)
   │     └── Shortlist Email Service (shortlist_service.py -> SMTP / EmailMessage)
   │
   ▼
Database Access Layer (app/db.py)
   │
   ▼
SQLite 3 Engine (internflow.db via Python stdlib sqlite3)
   [CRITICAL BLOCKER: Must be refactored to PostgreSQL via SQLAlchemy / Psycopg2]
```

---

## 3. Actual Project Working
Refer to [PRE_DEPLOYMENT_SYSTEM_MODEL.md](file:///d:/Web%20Dev%20Projects/internflow/docs/PRE_DEPLOYMENT_SYSTEM_MODEL.md) for the complete 25-point operational system model detailing user roles, auth, internship creation, onboarding, project chunking, task submissions, reviews, weekly progress collection, AI synthesis, Gemini key rotation, Make webhooks, certificate issuing, and failure recoveries.

---

## 4. Feature Verification Matrix
Refer to [PRE_DEPLOYMENT_FEATURE_MATRIX.md](file:///d:/Web%20Dev%20Projects/internflow/docs/PRE_DEPLOYMENT_FEATURE_MATRIX.md) for the complete 29-feature matrix detailing backend routes, services, database tables, external dependencies, frontend dependencies, test files, and verification statuses.

---

## 5. Backend Verification
- **Framework:** FastAPI `1.0.0` running on Uvicorn.
- **Middleware:** `CORSMiddleware`, `StructuredLoggingMiddleware`, `SimpleRateLimiterMiddleware` (120 req/min).
- **Routers:** 15 active APIRouters covering `auth`, `internships`, `applications`, `interns`, `attendance`, `mentors`, `mentor_feedback`, `skills`, `notifications`, `assessments`, `interviews`, `goals`, `evidence`, `outcomes`, `progress`.
- **Status:** **PASS** (155/155 tests passing).

---

## 6. Database Verification
- **Schema:** 31 domain tables created in `app/db.py` via raw SQL `SCHEMA`.
- **Connection Management:** `get_db()` context manager opens and closes `sqlite3.connect(get_db_path())` on every request.
- **Transactions:** Explicit `db.commit()` used throughout routers.
- **Status:** **FAIL FOR PRODUCTION** (Uses SQLite file-based driver).

---

## 7. PostgreSQL Compatibility
Refer to [POSTGRES_MIGRATION_AUDIT.md](file:///d:/Web%20Dev%20Projects/internflow/docs/POSTGRES_MIGRATION_AUDIT.md).
- **Status:** **FAIL** (Requires code refactoring in `app/db.py` and routers before PostgreSQL execution).

---

## 8. Authentication Verification
- **Token Type:** JWT signed with `HS256`.
- **Password Hashing:** `passlib` bcrypt/sha256_crypt via `app/core/security.py`.
- **Role Control:** `require_roles('provider', 'mentor', 'intern')` enforced on all protected routes.
- **Verification/Approval Checks:** Provider & mentor accounts checked for `is_active == 1`, `is_verified == 1`, `is_approved == 1`, `trust_level == 'approved'`.
- **Status:** **PASS** (with security configuration update required for `JWT_SECRET`).

---

## 9. Gemini Verification
- **SDK / Method:** REST API via `httpx.Client` targeting `gemini-2.0-flash`.
- **Services Integrated:** Resume screening, AI interview question generation, weekly report generation.
- **Fallback Support:** All AI services include rule-based heuristic fallbacks when Gemini is unconfigured or unavailable.
- **Status:** **PASS**

---

## 10. Gemini API-Key Rotation Verification
Refer to [GEMINI_PRODUCTION_AUDIT.md](file:///d:/Web%20Dev%20Projects/internflow/docs/GEMINI_PRODUCTION_AUDIT.md).
- **Key Discovery:** Reads `INTERNFLOW_GEMINI_API_KEY_1`, `_2`, `_3`... sequentially.
- **Rotation Condition:** Rotates strictly on 429 status code or JSON quota error strings.
- **Thread Safety:** Enforced via `threading.Lock()`.
- **Log Security:** Keys masked (`AIza...CDEF`).
- **Status:** **PASS**

---

## 11. Make.com Verification
- **Scenarios:** 30 automations defined in system spec.
- **Active Scenarios in `.env`:** #1, #7A, #7B, #7C, #11, #13, #15, #20, #22, #25 (10 active URLs).
- **Standby Scenarios:** #3, #4, #5, #6, #8, #10, #12, #14, #16, #17, #21, #23, #27, #28, #29, #30 (16 URLs unconfigured).
- **Status:** **PARTIAL** (Active scenarios verified; standby scenarios require production webhook URLs).

---

## 12. Webhook Verification
- **Dispatcher:** `_dispatch_webhook` in `app/services/webhook_service.py`.
- **Timeout:** 5.0 seconds. Non-blocking post-commit execution.
- **Envelopes:** Standardized JSON with `event`, `event_id`, `timestamp`, `data`.
- **Status:** **PASS**

---

## 13. Email Verification
- **SMTP Engine:** `app/notifications/shortlist_service.py` using `smtplib` and `EmailMessage`.
- **Configuration:** Reads `INTERNFLOW_SMTP_HOST`, `INTERNFLOW_SMTP_PORT`, `INTERNFLOW_SMTP_USERNAME`, `INTERNFLOW_SMTP_PASSWORD`, `INTERNFLOW_EMAIL_FROM`.
- **Fallback:** Returns `'simulated-email-delivery'` when `INTERNFLOW_SMTP_HOST` is unconfigured.
- **Status:** **PASS**

---

## 14. Certificate Verification
- **Generator:** ReportLab PDF generator (`app/services/certificate_generator.py`).
- **Storage:** Saved to `storage/certificates/certificate_{safe_id}.pdf`.
- **Verification Endpoint:** `GET /api/verify/{certificate_id}` (Public, sanitized response).
- **Download / View:** `GET /api/certificates/{id}/download` and `GET /api/certificates/{id}/view`.
- **Status:** **PASS**

---

## 15. Progress Automation Verification
- **Collection Engine:** Aggregates weekly tasks, hours, attendance days, and skill observations (`weekly_report_service.py`).
- **AI Report Generation:** Synthesizes structured weekly reports via Gemini API or heuristic fallback.
- **Persistence:** Saved to `weekly_reports` table with `UNIQUE(assignment_id, week_start, week_end)`.
- **Status:** **PASS**

---

## 16. Interview Workflow Verification
- **Endpoints:** `/api/interviews/schedule`, `/api/interviews/mine`, `/api/interviews/provider`, `/api/interviews/{id}/scorecard`.
- **AI Questions:** `generate_interview_questions_ai` provides candidate-tailored interview questions.
- **Status:** **PASS**

---

## 17. Frontend ↔ Backend Verification
- **Contract Service:** `frontend/src/services/publicExperience.js` defines `API_BASE = import.meta.env.VITE_API_URL || '/api'`.
- **Auth Header:** `Authorization: Bearer <token>` attached automatically.
- **Vite Proxy:** Proxies `/api` requests to `http://127.0.0.1:8000`.
- **Status:** **PASS**

---

## 18. Security Verification
- **CORS:** Configured via `CORS_ORIGINS` (`CORSMiddleware`).
- **Rate Limiting:** `SimpleRateLimiterMiddleware` (120 requests/minute).
- **Input Validation:** Pydantic models enforce email formatting, role patterns, and string length bounds.
- **Audit Issue:** Fallback default `JWT_SECRET` in `config.py` must be overridden in production.
- **Status:** **PARTIAL** (Requires mandatory `JWT_SECRET` env check).

---

## 19. Performance Verification
- **Execution Time:** Full test suite (155 tests) completes in under 30 seconds.
- **PDF Generation:** Certificate rendering completes in ~120ms.
- **N+1 Risk:** SQLite queries in `evaluate_verified_skills` run in small loops per candidate skill. Needs query batching during Postgres migration.
- **Status:** **PASS**

---

## 20. Error Handling Verification
- Standard HTTP exceptions (`400`, `401`, `403`, `404`, `409`, `422`, `500`) returned with clean `{ "detail": "..." }` payloads.
- Sensitive stack traces masked in client responses.
- **Status:** **PASS**

---

## 21. Idempotency Verification
- Certificate generation guarded against duplicates via `outcome_id` constraint.
- Shortlist emails guarded against duplicate sends via `application_communications` status checks.
- Weekly reports guarded by `UNIQUE(assignment_id, week_start, week_end)`.
- **Status:** **PASS**

---

## 22. Test Suite Results
- **Test Command:** `python -m pytest`
- **Total Tests:** 155
- **Passed:** 155
- **Failed:** 0
- **Warnings:** 5 (Deprecation warnings for FastAPI startup event and `datetime.utcnow()`).
- **Status:** **PASS (100% Passing)**

---

## 23. Critical Issues

### ISSUE-CRIT-01: Backend Runtime Is Hardcoded to SQLite Driver (`app/db.py`)
- **Severity:** CRITICAL
- **Component:** Database / Runtime Engine
- **Problem:** `app/db.py` hardcodes `sqlite3.connect(get_db_path())` and executes SQLite-specific DDL/pragmas (`PRAGMA table_info`, `sqlite_master`, `AUTOINCREMENT`). It ignores `DATABASE_URL=postgresql://...`.
- **Evidence:** `backend/app/db.py` lines 3, 583, 591, 674, 773.
- **Impact:** Application cannot run against a production PostgreSQL database.
- **Fix Required:** Refactor `app/db.py` to use SQLAlchemy Engine/Session pool or `psycopg` driver; convert DDL and SQL syntax to PostgreSQL standard.

### ISSUE-CRIT-02: Hardcoded JWT Secret Default in Configuration (`app/core/config.py`)
- **Severity:** CRITICAL
- **Component:** Security / Authentication
- **Problem:** `config.py` provides a default fallback secret `'internflow-development-secret-change-me-2026'` if `INTERNFLOW_JWT_SECRET` is not set in environment.
- **Evidence:** `backend/app/core/config.py` line 3.
- **Impact:** Potential security vulnerability if deployed without setting `INTERNFLOW_JWT_SECRET`.
- **Fix Required:** Raise `RuntimeError` on startup if `INTERNFLOW_JWT_SECRET` is not set when `APP_ENV=production`.

---

## 24. High Issues

### ISSUE-HIGH-01: 16 Out of 26 Make.com Webhook URLs Unconfigured in `.env`
- **Severity:** HIGH
- **Component:** Automations / Webhooks
- **Problem:** `.env` contains empty values for 16 Make.com webhook URLs (Automations #3, #4, #5, #6, #8, #10, #12, #14, #16, #17, #21, #23, #27, #28, #29, #30).
- **Evidence:** `.env` lines 65–80.
- **Impact:** Downstream notifications for these 16 workflows will not reach Make.com in production.
- **Fix Required:** Populate production Make.com webhook URLs in environment configuration.

---

## 25. Medium Issues

### ISSUE-MED-01: SQLite Error Message Checks Hardcoded in Routers
- **Severity:** MEDIUM
- **Component:** Database / Router Error Handling
- **Problem:** Routers check `if 'UNIQUE constraint' in str(error):` which is specific to SQLite exception output.
- **Evidence:** `app/auth/router.py` line 44, `app/mentors/router.py` lines 105 & 818, `app/applications/router.py` line 165.
- **Impact:** Will not catch unique constraint violations under PostgreSQL (`psycopg2.errors.UniqueViolation`).
- **Fix Required:** Catch driver-agnostic `IntegrityError` exceptions.

### ISSUE-MED-02: Reliance on `cursor.lastrowid` Across Routers
- **Severity:** MEDIUM
- **Component:** Database Access Layer
- **Problem:** 35 locations across routers rely on `cursor.lastrowid` to retrieve newly inserted IDs.
- **Impact:** PostgreSQL drivers do not reliably populate `cursor.lastrowid` without explicit `RETURNING id` SQL clauses.
- **Fix Required:** Append `RETURNING id` to INSERT queries and fetch returned column.

---

## 26. Low Issues

### ISSUE-LOW-01: FastAPI Startup Event Deprecation Warning
- **Severity:** LOW
- **Component:** Core Framework
- **Problem:** `app/main.py` uses deprecated `@app.on_event('startup')`.
- **Fix Required:** Refactor to FastAPI `lifespan` context manager.

### ISSUE-LOW-02: `datetime.utcnow()` Deprecation Warning
- **Severity:** LOW
- **Component:** Outcomes Router
- **Problem:** `outcomes/router.py` uses deprecated `datetime.utcnow()`.
- **Fix Required:** Replace with `datetime.now(timezone.utc)`.

---

## 27. Required Changes Before Deployment
1. Refactor `app/db.py` to support PostgreSQL via SQLAlchemy / Psycopg2.
2. Replace `cursor.lastrowid` with SQL `RETURNING id` clauses across all routers.
3. Replace `INSERT OR IGNORE` with `ON CONFLICT DO NOTHING`.
4. Enforce strict environment validation for `INTERNFLOW_JWT_SECRET` on server startup.
5. Populate production Make.com webhook URLs in environment config.

---

## 28. PostgreSQL Migration Requirements
Refer to [PRODUCTION_DATABASE_MIGRATION_PLAN.md](file:///d:/Web%20Dev%20Projects/internflow/docs/PRODUCTION_DATABASE_MIGRATION_PLAN.md).

---

## 29. Deployment Requirements
- PostgreSQL 15+ instance provisioned.
- Production environment variables populated (`DATABASE_URL`, `INTERNFLOW_JWT_SECRET`, `INTERNFLOW_GEMINI_API_KEY_1`, Make webhook URLs, SMTP credentials).
- ReportLab storage directory writable on server filesystem (`storage/certificates/`).

---

## 30. Final Deployment Gate

| Gate | Status |
|------|--------|
| DATABASE READY | **FAIL** (SQLite hardcoded in app/db.py) |
| API READY | **PASS** (155/155 tests passing) |
| AUTH READY | **PASS** (JWT + role permissions verified) |
| AI READY | **PASS** (Gemini REST client & fallbacks verified) |
| GEMINI KEY ROTATION READY | **PASS** (Thread-safe rotation verified) |
| MAKE READY | **PARTIAL** (10 active, 16 standby URLs missing) |
| WEBHOOKS READY | **PASS** (Outbound JSON dispatchers verified) |
| EMAIL READY | **PASS** (SMTP engine & fallbacks verified) |
| CERTIFICATE READY | **PASS** (ReportLab PDF generator & verification API verified) |
| INTERVIEW READY | **PASS** (Scheduling, AI questions & scorecards verified) |
| FRONTEND/BACKEND READY | **PASS** (API contracts & Vite proxy verified) |
| SECURITY READY | **PARTIAL** (Must require JWT_SECRET env var) |
| PERFORMANCE READY | **PASS** (Fast test execution & PDF compilation) |
| MIGRATION READY | **NOT READY** (Alembic PostgreSQL migration plan needed) |
| DEPLOYMENT CONFIG READY | **PARTIAL** |
| END-TO-END READY | **PASS** |

---

## 31. FINAL STATUS

========================================  
NOT SAFE FOR DEPLOYMENT  
========================================  
