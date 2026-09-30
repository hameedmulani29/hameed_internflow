# INTERNFLOW — AUTOMATION & WEBHOOK PAYLOADS DOCUMENTATION

This document defines the exact schema, trigger conditions, idempotency behavior, and failure handling for InternFlow's automated progress and certificate systems (#18, #19, #20, #24, #25, #26).

---

## #18 — Weekly Progress Collection

* **Automation Number**: #18
* **Automation Name**: Weekly Internship Progress Data Collection
* **Purpose**: Collects accurate weekly progress signals from database records (tasks completed/pending, attendance check-ins, mentor feedback, milestone completion, and skill observations) within an explicit `[week_start, week_end]` date window.
* **Python Implementation**: `collect_weekly_progress_data()` in `backend/app/services/weekly_report_service.py`
* **Data Sources**:
  * `mentor_tasks`: Tasks completed/submitted/pending strictly in week period.
  * `attendance`: Work minutes, active check-in days, and total hours logged in week period.
  * `mentor_feedback`: Feedback text and strengths recorded in week period.
  * `goal_milestones`: Project milestones completed in week period.
  * `mentor_skill_observations`: Verified skill observations recorded in week period.
* **Graceful Degradation**: Zero attendance or zero completed tasks are handled gracefully without throwing errors or fabricating false metrics.
* **Implementation Status**: **COMPLETE**

---

## #19 — AI Weekly Progress Report

* **Automation Number**: #19
* **Automation Name**: AI Weekly Progress Report Generation & Persistence
* **Purpose**: Generates a structured executive progress report via Gemini 2.0 Flash (`gemini-2.0-flash`) and persists it to the SQLite `weekly_reports` table.
* **Python Trigger Points**:
  * Service: `generate_and_persist_weekly_report()` in `backend/app/services/weekly_report_service.py`
  * API Endpoint: `POST /api/progress/weekly-report/generate` (`backend/app/progress/router.py`)
  * Scheduler: `run_weekly_report_job()`
* **AI Configuration**:
  * Environment Variables: `INTERNFLOW_GEMINI_API_KEY` or `GEMINI_API_KEY`
  * Model: `gemini-2.0-flash`
* **Deterministic Fallback**: If Gemini API is unconfigured, rate-limited, times out, or returns invalid JSON, the service seamlessly generates a deterministic fallback report derived strictly from database metrics and sets `ai_status = 'fallback'`.
* **Database Table**: `weekly_reports` (`assignment_id`, `intern_id`, `provider_id`, `internship_id`, `week_start`, `week_end`, `summary`, `completed_work`, `pending_work`, `achievements`, `challenges`, `next_week_focus`, `mentor_attention_items`, `metrics`, `status`, `ai_status`).
* **Idempotency**: Enforced via `UNIQUE (assignment_id, week_start, week_end)` constraint in SQLite.
* **Implementation Status**: **COMPLETE**

---

## #20 — Make #20 Weekly Report Notification Webhook

* **Automation Number**: #20
* **Automation Name**: Weekly Report Ready Notification Webhook
* **Purpose**: Emits a standardized `weekly_report.generated` event payload to Make.com (#20 scenario) after a weekly progress report has been successfully generated and persisted.
* **Python Trigger Point**: `emit_weekly_report_generated_event()` in `backend/app/services/webhook_service.py` (called post-commit in `generate_and_persist_weekly_report`).
* **Webhook Config Variable**: `MAKE_WEEKLY_REPORT_READY_WEBHOOK_URL`
* **Event Name**: `weekly_report.generated`

### Webhook Event JSON Payload Schema

```json
{
  "event": "weekly_report.generated",
  "event_id": "evt_wk_f9e8d7c6b5a43210",
  "timestamp": "2026-09-29T20:45:00.000000Z",
  "data": {
    "report": {
      "id": 14,
      "assignment_id": 5,
      "intern_id": 42,
      "provider_id": 3,
      "internship_id": 7,
      "week_start": "2026-09-21",
      "week_end": "2026-09-27",
      "summary": "Sarah completed 3 major tasks with 40.0 logged hours across 5 active days as Fullstack Engineering Intern.",
      "completed_work": [
        "Build auth middleware",
        "Implement rate limiting",
        "Add unit tests"
      ],
      "pending_work": [
        "Optimize database query performance"
      ],
      "achievements": [
        "Successfully completed 3 key tasks including: Build auth middleware, Implement rate limiting.",
        "Logged 40.0 productive working hours across 5 days."
      ],
      "challenges": [
        "1 task(s) currently pending or in progress."
      ],
      "next_week_focus": [
        "Optimize database query performance"
      ],
      "mentor_attention_items": [
        "Review pending task submissions"
      ],
      "metrics": {
        "total_tasks": 4,
        "completed_tasks_count": 3,
        "pending_tasks_count": 1,
        "submitted_tasks_count": 0,
        "days_present": 5,
        "total_hours": 40.0,
        "completed_milestones_count": 1
      },
      "status": "generated",
      "ai_status": "completed",
      "created_at": "2026-09-29 20:45:00"
    },
    "intern": {
      "id": 42,
      "name": "Sarah Connor",
      "email": "sarah.connor@example.com"
    },
    "internship": {
      "id": 7,
      "title": "Fullstack Software Engineering Intern"
    },
    "provider": {
      "id": 3,
      "name": "Acme Technologies Corp",
      "email": "contact@acme.example.com"
    }
  }
}
```

### Field Descriptions

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `event` | String | Yes | Event identifier (`weekly_report.generated`) |
| `event_id` | String | Yes | Unique event ID for Make.com deduplication (`evt_wk_<hex>`) |
| `timestamp` | String | Yes | ISO-8601 UTC timestamp of emission |
| `data.report.id` | Integer | Yes | Primary key of the weekly report record |
| `data.report.week_start` | String | Yes | Start date of reporting period (`YYYY-MM-DD`) |
| `data.report.week_end` | String | Yes | End date of reporting period (`YYYY-MM-DD`) |
| `data.report.summary` | String | Yes | AI-generated or fallback executive summary |
| `data.report.completed_work` | Array[String] | Yes | List of work completed during the week |
| `data.report.pending_work` | Array[String] | Yes | List of work currently pending |
| `data.report.achievements` | Array[String] | Yes | Key achievements & milestones |
| `data.report.challenges` | Array[String] | Yes | Observed challenges or blockers |
| `data.report.next_week_focus` | Array[String] | Yes | Focus items for the upcoming week |
| `data.report.mentor_attention_items` | Array[String] | Yes | Items needing mentor attention |
| `data.report.metrics` | Object | Yes | Quantitative progress metrics dict |
| `data.intern.name` | String | Yes | Full name of the intern |
| `data.intern.email` | String | Yes | Email address of the intern |
| `data.provider.name` | String | Yes | Company/Provider organization name |
| `data.provider.email` | String | Yes | Contact email of the provider |

### Failure Handling & Idempotency
* **Non-Blocking Dispatch**: Webhook execution is wrapped in a try-except block. Webhook failure does NOT crash the report or roll back DB transaction.
* **Deduplication**: `event_id` prevents duplicate email processing in Make.com scenarios.
* **Implementation Status**: **COMPLETE**

---

## #24 — Certificate Generation Trigger

* **Automation Number**: #24
* **Automation Name**: Certificate Generation Trigger & Artifact Storage
* **Purpose**: Automatically generates a persistent, tamper-evident PDF certificate artifact when an intern completes an internship program with a submitted final evaluation.
* **Trigger Point**: `POST /api/outcomes/complete/{assignment_id}` (`backend/app/outcomes/router.py`)
* **Artifact Storage**: `backend/storage/certificates/certificate_{certificate_id}.pdf`
* **Idempotency Behavior**: Enforced via `UNIQUE (outcome_id)` on `certificates` table.
* **Implementation Status**: **COMPLETE**

---

## #25 — Certificate Email Automation

* **Automation Number**: #25
* **Automation Name**: Certificate Email Webhook Dispatch
* **Purpose**: Emits a standardized `certificate.issued` event to Make.com (#25 scenario) to send completion email with PDF download link.
* **Python Trigger Point**: `emit_certificate_issued_event()` in `backend/app/services/webhook_service.py`
* **Webhook Config Variable**: `MAKE_CERTIFICATE_ISSUED_WEBHOOK_URL`
* **Event Name**: `certificate.issued`
* **Implementation Status**: **COMPLETE**

---

## #26 — Certificate Verification Support

* **Automation Number**: #26
* **Automation Name**: Public Certificate Verification System
* **Backend Endpoint**: `GET /api/verify/{certificate_id}` (`backend/app/outcomes/router.py`)
* **Frontend Verification Page**: `/verify` (`frontend/src/pages/public/VerifyCertificatePage.jsx`)
* **Implementation Status**: **COMPLETE**
