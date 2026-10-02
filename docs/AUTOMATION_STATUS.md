# InternFlow Automation Status & Master Webhook Integration Contract

> **Document Type:** Authoritative Source of Truth  
> **Last Updated:** October 2, 2026  
> **Architecture Model:** FastAPI Python Backend (Primary Processor & Source of Truth) + SQLite 3 (`internflow.db`) + Server-Side Google Gemini REST API (`gemini-2.0-flash`) + Downstream Make.com Transactional Webhook Engine.

---

## 1. AUTOMATION ARCHITECTURE SUMMARY

InternFlow uses a **Python-First Automation Architecture**:

```text
                 ┌────────────────────────┐
                 │     React + Vite       │
                 │   (Frontend Shell)     │
                 └───────────┬────────────┘
                             │ HTTPS / WSS
                             ▼
                 ┌────────────────────────┐
                 │    FastAPI Backend     │
                 │  (Primary Processor)   │
                 └─────┬─────┬─────┬──────┘
                       │     │     │
         ┌─────────────┘     │     └──────────────┐
         ▼                   ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐
│ SQLite 3 DB     │ │ Google Gemini   │ │ ReportLab PDF     │
│ (internflow.db) │ │ REST API (httpx)│ │ Artifact Engine   │
└─────────────────┘ └─────────────────┘ └───────────────────┘
                             │
                  Outbound HTTP Webhooks
                             ▼
                 ┌────────────────────────┐
                 │        Make.com        │
                 │ (Downstream Engine)    │
                 └───────────┬────────────┘
                             │
                             ▼
                 ┌────────────────────────┐
                 │ SendGrid / Gmail /     │
                 │ External SaaS Actions  │
                 └────────────────────────┘
```

### System Responsibilities
1. **FastAPI Python Backend:** Handles authorization, business logic, state transitions, database CRUD/transactions, structured PDF artifact rendering, Gemini API calls, event creation, and outbound webhook dispatches.
2. **Google Gemini REST API (`gemini-2.0-flash`):** Invoked **directly** server-side by Python via `httpx`. Make.com is 100% uninvolved in Gemini invocations.
3. **Make.com:** Receives post-commit JSON event webhooks emitted by Python to trigger transactional email delivery and external SaaS notifications. Make does NOT hold core application state or database records.

---

## 2. MASTER AUTOMATION MATRIX (#1 - #30)

| ID | Automation Name | Business Purpose | Trigger | Python Backend | Make.com | Gemini AI | Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **#1** | Candidate Application Notification | Confirm candidate application submit | `POST /api/applications` | Creates application record; emits `application.created` event | Active Scenario ID 7565385 | None | **COMPLETE** |
| **#2** | Resume Screening Workflow | Screen resume text against internship brief | `POST /api/applications/{id}/screen` or auto-worker | Worker extracts resume text; calls Gemini API; validates Pydantic `ResumeScreeningResult`; updates DB | None | `gemini-2.0-flash` called directly by Python | **COMPLETE** |
| **#3** | Shortlist Communication | Send shortlist update email | Application status `shortlisted` | `transition_application_status()` emits `candidate.shortlisted` event | Standby / Configured | None | **COMPLETE** |
| **#4** | Rejection Communication | Send rejection email to candidate | Provider reject action | Records decision in DB; emits `candidate.rejected` event | Standby / Configured | None | **COMPLETE** |
| **#5** | Assessment Invitation | Invite candidate to assessment | Status change to `assessment` | Emits `assessment.invited` event | Standby / Configured | None | **COMPLETE** |
| **#6** | Assessment Result Notification | Grade test attempt and notify | Candidate attempt submit | Grades MCQs & short answers; emits `assessment.completed` event | Standby / Configured | None | **COMPLETE** |
| **#7** | Interview Scheduling | Schedule interview slot | Provider schedule API | Router `/api/interviews/schedule` creates interview row; emits `INTERVIEW_REQUIRED`, `INTERVIEW_SLOT_SELECTED`, `INTERVIEW_CONFIRMED` | Active Scenario (Interview Suite) | Optional prep | **COMPLETE** |
| **#8** | Interview Reminder | Pre-interview reminder | Scheduled time | Emits `interview.reminder` event | Standby / Configured | None | **COMPLETE** |
| **#9** | AI Interview Preparation | Generate tailored interview questions | Provider `POST /api/interviews/ai-generate-questions` | `generate_interview_questions_ai()` calls Gemini API & parses `AIInterviewQuestionsResult` | None | `gemini-2.0-flash` called directly by Python | **COMPLETE** |
| **#10** | Selection Notification | Notify candidate of final selection | Provider select action | Updates application `status = 'selected'`; emits `candidate.selected` event | Standby / Configured | None | **COMPLETE** |
| **#11** | Onboarding Workflow | Init onboarding checklist | Candidate selection | Emits `intern.onboarding_required` event | Active Scenario ID 7682272 | None | **COMPLETE** |
| **#12** | Onboarding Reminder | Remind pending onboarding steps | Scheduled time | Emits `onboarding.reminder` event | Standby / Configured | None | **COMPLETE** |
| **#13** | Internship Start Workflow | Activate intern workspace on start | Scheduled start date | `POST /api/mentor/assignments` assigns mentor & intern; emits `internship.started` event | Active Scenario ID 7682410 | None | **COMPLETE** |
| **#14** | Task Deadline Reminder | Remind task due dates | Task due date | Emits `task.deadline_reminder` event | Standby / Configured | None | **COMPLETE** |
| **#15** | Task Submission Notification | Notify mentor when intern submits task | Intern task submit | Updates task `status = 'submitted'`; emits `task.submitted` event | Active Scenario ID 7669693 | None | **COMPLETE** |
| **#16** | Task Review Reminder | Remind mentor of idle submission | Submitted task idle | Emits `task.review_reminder` event | Standby / Configured | None | **COMPLETE** |
| **#17** | Attendance Reminder | Daily check-in/out reminder | Daily schedule | Attendance API `/api/attendance` logs check-ins; emits `attendance.reminder` event | Standby / Configured | None | **COMPLETE** |
| **#18** | Weekly Progress Collection | Collect tasks, hours & skills in week | On-demand or report job | `collect_weekly_progress_data()` aggregates DB metrics | None | None | **COMPLETE** |
| **#19** | AI Weekly Progress Report | Generate executive report via Gemini | `generate_and_persist_weekly_report()` or API | Calls Gemini API; validates `WeeklyReportAIResult`; executes SQLite `UPSERT` into `weekly_reports` | None | `gemini-2.0-flash` called directly by Python | **COMPLETE** |
| **#20** | Weekly Report Notification | Send weekly report email notification | Post-commit in report generation | `emit_weekly_report_generated_event()` posts `weekly_report.generated` event to Make | Active Scenario ID 7682168 | None | **COMPLETE** |
| **#21** | AI Mentor Feedback Draft | Assist mentor in drafting feedback | Mentor draft request | `POST /api/mentor/feedback/draft-ai` returns structured feedback template | None | Heuristic template generator | **COMPLETE** |
| **#22** | Feedback Notification | Notify intern of mentor feedback | Mentor feedback submit | `POST /api/mentors/feedback` saves DB row; emits `feedback.approved` event | Active Scenario ID 7681762 | None | **COMPLETE** |
| **#23** | Evaluation Reminder | Remind mentor of final evaluation | End of internship | Emits `evaluation.reminder` event | Standby / Configured | None | **COMPLETE** |
| **#24** | Certificate Generation Trigger | Compile ReportLab PDF & DB row | Outcome completion | Compiles landscape PDF artifact; inserts row into `certificates` table | None | None | **COMPLETE** |
| **#25** | Certificate Email | Send certificate email with PDF link | Certificate issuance | `emit_certificate_issued_event()` posts `certificate.issued` event to Make | Active Scenario ID 7681867 | None | **COMPLETE** |
| **#26** | Certificate Verification Support | Public verification of certificate | `GET /api/verify/{certificate_id}` | Serves verification JSON payload & `/verify` page | None | None | **COMPLETE** |
| **#27** | Internship Completion Workflow | Complete assignment & update passport | Provider complete API | Validates evaluation; updates `skill_passports`; emits `internship.completed` event | Standby / Configured | None | **COMPLETE** |
| **#28** | Provider Notifications | Log provider activity feed | System events | `record_and_broadcast_activity()` logs events; emits `provider.notification` event | Standby / Configured | None | **COMPLETE** |
| **#29** | Automation Failure Alert | Log background task errors | Worker exception | Catches errors; logs DB failure; emits `automation.failed` event | Standby / Configured | None | **COMPLETE** |
| **#30** | Scheduled Cleanup / Follow-ups | Periodic maintenance cron | Scheduled cron | Periodic job runner; emits `scheduled.cleanup` event | Standby / Configured | None | **COMPLETE** |

---

## 3. MASTER WEBHOOK ENVIRONMENT VARIABLE INVENTORY

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/internflow_prod
INTERNFLOW_DB_PATH=internflow.db

# Security Configuration
INTERNFLOW_JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_EXPIRE_MINUTES=1440

# AI Engine (Google Gemini REST API)
INTERNFLOW_GEMINI_API_KEY=your_gemini_api_key_here
INTERNFLOW_GEMINI_MODEL=gemini-2.0-flash

# Make.com Master Webhook Configuration (Automations #1 - #30)
MAKE_APPLICATION_CREATED_WEBHOOK_URL=
MAKE_CANDIDATE_SHORTLISTED_WEBHOOK_URL=
MAKE_CANDIDATE_REJECTED_WEBHOOK_URL=
MAKE_ASSESSMENT_INVITED_WEBHOOK_URL=
MAKE_ASSESSMENT_RESULT_WEBHOOK_URL=
MAKE_INTERVIEW_SCHEDULED_WEBHOOK_URL=https://hook.eu1.make.com/YOUR_WEBHOOK_ID
MAKE_INTERVIEW_SLOT_BOOKED_WEBHOOK_URL=
MAKE_INTERVIEW_CONFIRMED_WEBHOOK_URL=
MAKE_INTERVIEW_REMINDER_WEBHOOK_URL=
MAKE_SELECTION_NOTIFICATION_WEBHOOK_URL=
MAKE_ONBOARDING_WEBHOOK_URL=
MAKE_ONBOARDING_REMINDER_WEBHOOK_URL=
MAKE_INTERNSHIP_START_WEBHOOK_URL=
MAKE_TASK_DEADLINE_WEBHOOK_URL=
MAKE_TASK_SUBMITTED_WEBHOOK_URL=
MAKE_TASK_REVIEW_REMINDER_WEBHOOK_URL=
MAKE_ATTENDANCE_REMINDER_WEBHOOK_URL=
MAKE_WEEKLY_REPORT_READY_WEBHOOK_URL=
MAKE_WEEKLY_REPORT_NOTIFICATION_WEBHOOK_URL=
MAKE_AI_MENTOR_FEEDBACK_WEBHOOK_URL=
MAKE_FEEDBACK_APPROVED_WEBHOOK_URL=
MAKE_EVALUATION_REMINDER_WEBHOOK_URL=
MAKE_CERTIFICATE_ISSUED_WEBHOOK_URL=
MAKE_CERTIFICATE_EMAIL_WEBHOOK_URL=
MAKE_PROVIDER_NOTIFICATION_WEBHOOK_URL=
MAKE_AUTOMATION_FAILURE_WEBHOOK_URL=
MAKE_COMPLETION_WORKFLOW_WEBHOOK_URL=
MAKE_SCHEDULED_CLEANUP_WEBHOOK_URL=

# Legacy Fallback Variable
INTERNFLOW_MAKE_INTERVIEW_WEBHOOK_URL=https://hook.eu1.make.com/YOUR_WEBHOOK_ID

# Production SMTP Email Delivery
INTERNFLOW_SMTP_HOST=smtp.sendgrid.net
INTERNFLOW_SMTP_PORT=587
INTERNFLOW_SMTP_USERNAME=apikey
INTERNFLOW_SMTP_PASSWORD=your_sendgrid_api_key
INTERNFLOW_EMAIL_FROM=notifications@internflow.com
INTERNFLOW_SMTP_USE_TLS=true

# Server & CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,https://internflow.com
INTERNFLOW_DEMO_DATA=true
```
