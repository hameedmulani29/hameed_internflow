# InternFlow — Pre-Deployment System Model

## 1. Overview & Core Mission
InternFlow is an end-to-end internship-management platform designed to govern the full internship lifecycle: from multi-role authentication, internship listing publishing, resume screening, candidate assessment, interview scheduling, mentor assignment, project task chunking, progress tracking, weekly report generation, final evaluation, skill passport updates, and certificate generation.

---

## 2. Comprehensive Operational System Model (25 Core Operational Aspects)

### 1. Who Uses the System
- **Providers (Organizations/Admins):** Create and publish internships, manage candidate applications, view AI resume screening results, make selection/rejection decisions, assign mentors, view platform certificates, and monitor outcomes.
- **Mentors:** Oversee assigned interns, create projects and master tasks, break projects into actionable task chunks, review submissions, record skill observations, provide qualitative feedback, generate weekly progress reports, and submit final evaluations.
- **Interns:** Discover internships, submit applications, check in/out daily for attendance, work on assigned task chunks, submit completed work with links/notes, track skill growth, view weekly reports, receive certificates, and manage public Skill Passports.

### 2. What Each Role Can Do
- **Provider:** `POST /api/internships`, `PATCH /api/internships/{id}/status`, `GET /api/applications`, `POST /api/applications/{id}/screen`, `POST /api/applications/{id}/decision`, `POST /api/interviews/schedule`, `POST /api/mentor/assignments`, `POST /api/outcomes/complete/{assignment_id}`, `GET /api/certificates/provider`.
- **Mentor:** `GET /api/mentor/dashboard`, `GET /api/mentor/interns`, `POST /api/mentor/tasks`, `PATCH /api/mentor/submissions/{id}`, `POST /api/mentor/feedback`, `POST /api/evidence/observations`, `POST /api/evidence/final-evaluations`, `POST /api/progress/weekly-report/generate`.
- **Intern:** `GET /api/internships`, `POST /api/applications`, `GET /api/interns/me/workspace`, `GET /api/interns/tasks`, `POST /api/interns/tasks/{id}/submit`, `POST /api/attendance/check-in`, `POST /api/attendance/check-out`, `GET /api/skill-passport/me`, `GET /api/certificates/me`.

### 3. How Users Authenticate
Authentication uses JSON Web Tokens (JWT) signed with HS256 algorithm via `app/core/security.py`.
- **Endpoint:** `POST /api/auth/register` and `POST /api/auth/login`.
- **Payload:** Returns `{ "user": { "id", "full_name", "email", "role", "organization" }, "token": "<jwt>" }`.
- **Authorization:** `Authorization: Bearer <jwt>` header is passed in all protected API requests. `app/core/permissions.py` validates tokens and enforces role restrictions (`require_roles`).

### 4. How Internships Are Created
- Provider submits title, department, description, location, work_mode, duration, stipend, openings, deadline, and skills.
- Inserted into `internships` table with initial `status = 'draft'`.
- Provider publishes via `PATCH /api/internships/{id}/status?status=published`.
- Live published internships become discoverable by candidates via `GET /api/internships`.

### 5. How Interns Are Onboarded
- Candidates submit applications via `POST /api/applications`.
- Provider reviews AI resume screening queue (`GET /api/applications/screening-queue`), invites to assessment or schedules interview.
- Upon selection (`status = 'selected'`), provider creates a mentor assignment via `POST /api/mentor/assignments` mapping `mentor_id` to `intern_id` and `internship_id`.
- Emits `intern.onboarding_required` and `internship.started` events to Make.com automations.

### 6. How Mentors Interact with Interns
- Mentors view assigned interns on `GET /api/mentor/interns` and control-tower dashboard `GET /api/mentor/dashboard`.
- Mentors define execution projects (`projects`), master tasks (`master_tasks`), and task chunks (`project_chunks`), assigning chunks to interns as `mentor_tasks`.
- Mentors review work submissions, leave structured feedback (`mentor_feedback`), log skill observations (`mentor_skill_observations`), and submit final evaluations (`final_evaluations`).

### 7. How Tasks/Projects Are Created
- Project hierarchy: `Internship -> Project -> Master Task -> Project Chunk -> Mentor Task`.
- Projects created via `POST /api/mentor/projects`.
- Master tasks created via `POST /api/mentor/projects/{id}/master-tasks`.
- Project chunks created via `POST /api/mentor/master-tasks/{id}/chunks`.
- Tasks assigned to interns via `POST /api/mentor/tasks` or distribution service.

### 8. How Submissions Work
- Intern views assigned tasks via `GET /api/interns/tasks`.
- Submits work via `POST /api/interns/tasks/{id}/submit` providing content text, optional `repo_url`, `demo_url`, and notes.
- Row created in `task_submissions` (`status = 'pending'`), task status updated to `'submitted'`.
- Emits `task.submitted` webhook event (#15) to Make.com.

### 9. How Reviews Work
- Mentor views pending reviews via `GET /api/mentor/submissions`.
- Mentor reviews via `PATCH /api/mentor/submissions/{submission_id}?decision=approve` (or `request_changes`).
- Approval updates task status to `'completed'` and submission status to `'approved'`.
- Rejection updates task status to `'changes_requested'` and submission status to `'changes_requested'`.

### 10. How Progress Is Collected
- `app/services/weekly_report_service.py` aggregates DB metrics for an assignment over a 7-day period:
  - Completed task count, total tasks count, work hours from attendance (`attendance`), submitted tasks count, days present, completed milestones.
- Computes skills observed during the week from `mentor_skill_observations`.

### 11. How Progress Is Analyzed
- Aggregated weekly data is formatted into a prompt and submitted to Google Gemini REST API (`gemini-2.0-flash`).
- Gemini synthesizes an executive summary, completed work breakdown, pending work items, key achievements, challenges, next week focus, and mentor attention items.
- If Gemini is unavailable, `call_gemini_weekly_report` generates a deterministic fallback executive summary.

### 12. How AI Mentor Functionality Works
- AI assists with resume screening (`call_gemini_screening`), interview question generation (`generate_interview_questions_ai`), and weekly report generation (`call_gemini_weekly_report`).
- AI results are validated against strict JSON schemas/Pydantic models.

### 13. How Gemini Is Called
- Calls hit Google Gemini REST API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`) via Python `httpx.Client`.
- Service defined in `app/services/gemini_service.py`.

### 14. How Gemini API Keys Rotate
- `GeminiKeyManager` loads numbered env vars `INTERNFLOW_GEMINI_API_KEY_1`, `_2`, `_3`... sequentially.
- On HTTP 429 or JSON quota error (`RESOURCE_EXHAUSTED`, `rate_limit_exceeded`), `GeminiProvider` catches the error, rotates thread-safely to the next key, and retries.
- Key rotation is strictly bounded by `key_count` to prevent infinite loops.

### 15. How Make Automations Interact with Backend
- Backend emits outbound JSON webhooks post-commit to Make.com webhook endpoints (e.g. `MAKE_APPLICATION_CREATED_WEBHOOK_URL`).
- Make scenarios receive payloads to trigger external transactional email delivery or third-party SaaS actions.
- Make.com does NOT store core state; FastAPI is the single source of truth.

### 16. How Webhooks Work
- `app/services/webhook_service.py` formats standardized event JSON envelopes (`event`, `event_id`, `timestamp`, `data`).
- Dispatched via HTTP POST with a 5.0-second timeout.
- Webhook dispatch failures log a warning and do NOT abort database transactions.

### 17. How Certificates Are Generated/Sent
- Triggered when provider/mentor completes an internship outcome (`POST /api/outcomes/complete/{assignment_id}`).
- Backend verifies that a final evaluation exists.
- `evaluate_verified_skills` identifies verified skills based on assessment scores >= 70% or mentor observations (`proficient`/`strong`).
- ReportLab engine compiles a PDF artifact saved to `storage/certificates/certificate_{safe_id}.pdf`.
- Database row inserted into `certificates`.
- Dispatches `certificate.issued` webhook (#25) to Make.com.

### 18. How Emails/Notifications Work
- Transactional emails can be sent directly via SMTP (`app/notifications/shortlist_service.py`) using `INTERNFLOW_SMTP_HOST` or downstream via Make.com webhook scenarios.
- Communication logs are stored in `application_communications`.

### 19. How Interview Scheduling Works
- Provider schedules interview via `POST /api/interviews/schedule`.
- Creates record in `interviews` table with `scheduled_at`, `duration_minutes`, `meeting_link`.
- Candidate and provider view interviews via `GET /api/interviews/mine` and `GET /api/interviews/provider`.
- After interview, interviewer submits `interview_scorecards`.

### 20. How Data Moves Through the System
`Frontend Component -> React Service Layer -> HTTP Fetch -> FastAPI Router -> Permission/Role Check -> DB Context Manager -> SQLite Execute -> Webhook/AI Dispatch -> HTTP Response`.

### 21. What Happens When an External Service Fails
- **Gemini Failure:** Application catches exception and falls back to deterministic rule-based generation (for reports and interview questions) or logs error state (for screening).
- **Make.com Webhook Failure:** Logged as warning; DB transaction commits successfully.
- **SMTP Failure:** Logged in `application_communications` with `status = 'failed'` and error message.

### 22. What Happens When an API Key Reaches Usage Limit
- `GeminiProvider` detects 429 / quota error, logs masked key rotation notice, advances `_current_index`, and retries with next available key.
- If all keys exhausted, raises `GeminiQuotaExhaustedError` and falls back to offline generators.

### 23. What Happens When a Webhook Is Duplicated
- Idempotency guards in routers:
  - `complete_internship_outcome`: Checks `SELECT * FROM certificates WHERE outcome_id = ?`; reuses existing certificate code.
  - `trigger_shortlist_communication`: Checks `SELECT * FROM application_communications WHERE status = 'sent'`; skips re-sending unless `force_retry=True`.

### 24. What Happens When a Request Fails
- FastAPI exception handlers return standard HTTP status codes (`400`, `401`, `403`, `404`, `409`, `422`, `500`) with structured `{ "detail": "..." }` JSON body.

### 25. What Happens When the Database Is Unavailable
- `get_db()` context manager fails on connection attempt, FastAPI returns HTTP 500. Server health check `GET /api/health` currently returns `{"status": "ok"}` without pinging DB (documented health check gap).
