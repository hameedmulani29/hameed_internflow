# InternFlow — Pre-Deployment Feature Matrix

| Feature | Backend Route | Service | Database | External Dependency | Frontend Dependency | Tests | Status |
|---------|---------------|---------|----------|---------------------|---------------------|-------|--------|
| User Registration & Auth | `POST /api/auth/register`, `/login` | `app/core/security.py` | `users` | None | `publicExperience.js` | `test_auth_security.py` | **VERIFIED** |
| Internship Publishing | `POST /api/internships`, `PATCH /.../status` | `internships/router.py` | `internships`, `internship_skills` | None | `internService.js` | `test_realtime_internship_publishing.py` | **VERIFIED** |
| Candidate Application Submission | `POST /api/applications` | `applications/router.py` | `applications` | Make #1 Webhook | `internService.js` | `test_applications_mine.py` | **VERIFIED** |
| AI Resume Screening | `POST /api/applications/{id}/screen` | `screening_service.py` | `application_screening_results` | Gemini API | `internService.js` | `test_resume_screening.py` | **VERIFIED** |
| Shortlist Communication | `POST /api/applications/{id}/shortlist` | `shortlist_service.py` | `application_communications` | SMTP / Make #3 | `phase20Service.js` | `test_shortlist_communication.py` | **PARTIALLY VERIFIED** (Make #3 URL unconfigured in env) |
| Rejection Communication | `POST /api/applications/{id}/decision` | `applications/router.py` | `application_provider_decisions` | Make #4 | `phase20Service.js` | `test_phase20_ai_decisions.py` | **PARTIALLY VERIFIED** (Make #4 URL unconfigured in env) |
| Assessment Bank & Creation | `POST /api/assessments`, `POST /.../questions` | `assessments/router.py` | `assessments`, `questions` | None | `phase20Service.js` | `test_phase20_assessments.py` | **VERIFIED** |
| Assessment Execution & Grading | `POST /api/assessments/{id}/start`, `.../submit` | `assessments/router.py` | `assessment_attempts`, `responses` | Make #6 | `phase20Service.js` | `test_phase20_assessments.py` | **VERIFIED** |
| Interview Scheduling & Booking | `POST /api/interviews/schedule`, `.../status` | `interviews/router.py` | `interviews` | Make #7A, #7B, #7C | `phase20Service.js` | `test_phase20_interviews.py` | **VERIFIED** |
| AI Interview Question Generation | `POST /api/interviews/ai-generate-questions` | `question_generator.py` | `interviews` | Gemini API | `phase20Service.js` | `test_phase20_interviews.py` | **VERIFIED** |
| Interview Scorecard | `POST /api/interviews/{id}/scorecard` | `interviews/router.py` | `interview_scorecards` | None | `phase20Service.js` | `test_phase20_interviews.py` | **VERIFIED** |
| Onboarding & Mentor Assignment | `POST /api/mentor/assignments` | `mentors/router.py` | `mentor_assignments` | Make #11, #13 | `mentorshipFoundationService.js` | `test_mentorship_phase1.py` | **VERIFIED** |
| Mentorship Project & Task Breakdown | `POST /api/mentor/projects`, `.../master-tasks` | `distribution_service.py` | `projects`, `master_tasks`, `project_chunks` | None | `mentorshipFoundationService.js` | `test_mentorship_phase1.py`, `phase2` | **VERIFIED** |
| Task Assignment & Execution | `POST /api/mentor/tasks` | `mentors/router.py` | `mentor_tasks` | Make #14 | `internService.js` | `test_intern_api.py` | **VERIFIED** |
| Task Submission & Review | `POST /api/interns/tasks/{id}/submit`, `PATCH .../submissions/{id}` | `mentors/router.py` | `task_submissions` | Make #15 | `internService.js` | `test_intern_api.py` | **VERIFIED** |
| Daily Attendance Tracking | `POST /api/attendance/check-in`, `.../check-out` | `attendance/router.py` | `attendance` | Make #17 | `internService.js` | `test_attendance_api.py` | **VERIFIED** |
| Mentor Feedback | `POST /api/mentor/feedback` | `mentor_feedback/router.py` | `mentor_feedback` | Make #22 | `mentorFeedbackService.js` | `test_mentor_feedback.py` | **VERIFIED** |
| Mentorship Goals & Milestones | `POST /api/goals`, `POST /.../milestones` | `goals/router.py` | `internship_goals`, `milestones` | None | `phase20Service.js` | `test_phase20_mentorship_goals.py` | **VERIFIED** |
| Skill Observation & Evidence | `POST /api/evidence/observations` | `evidence/router.py` | `mentor_skill_observations`, `skill_evidence` | None | `phase20Service.js` | `test_skills_foundation.py` | **VERIFIED** |
| Final Mentorship Evaluation | `POST /api/evidence/final-evaluations` | `evidence/router.py` | `final_evaluations` | None | `phase20Service.js` | `test_phase20_verified_outcomes.py` | **VERIFIED** |
| Weekly Progress Collection | Service function `collect_weekly_progress_data` | `weekly_report_service.py` | `mentor_tasks`, `attendance` | None | `phase20Service.js` | `test_weekly_report_system.py` | **VERIFIED** |
| AI Weekly Progress Report | `POST /api/progress/weekly-report/generate` | `weekly_report_service.py` | `weekly_reports` | Gemini API / Make #20 | `phase20Service.js` | `test_weekly_report_system.py` | **VERIFIED** |
| Outcome Completion & Certificate | `POST /api/outcomes/complete/{assignment_id}` | `outcomes/router.py`, `certificate_generator.py` | `internship_outcomes`, `certificates` | Make #25 | `phase20Service.js` | `test_certificate_system.py` | **VERIFIED** |
| PDF Certificate Rendering & Download | `GET /api/certificates/{id}/download` | `certificate_generator.py` | `certificates` | ReportLab PDF | `phase20Service.js` | `test_certificate_system.py` | **VERIFIED** |
| Public Certificate Verification | `GET /api/verify/{certificate_id}` | `outcomes/router.py` | `certificates` | None | `publicExperience.js` | `test_certificate_system.py` | **VERIFIED** |
| Skill Passport & Visibility | `GET /api/skill-passport/me`, `POST .../toggle-visibility` | `outcomes/router.py` | `skill_passports`, `verified_skills` | None | `phase20Service.js` | `test_phase20_verified_outcomes.py` | **VERIFIED** |
| Gemini Key Rotation | `GeminiProvider.generate_content` | `gemini_service.py` | None | Google Gemini REST API | None | `test_gemini_key_rotation.py` | **VERIFIED** |
| Make.com Webhook Dispatcher | `_dispatch_webhook` | `webhook_service.py` | None | Make.com HTTPS Webhooks | None | `test_phase21_advanced_features.py` | **PARTIALLY VERIFIED** (10 active, 16 standby URLs missing in env) |
| Production PostgreSQL Database Compatibility | `get_db()` SQLite context manager | `app/db.py` | PostgreSQL engine | PostgreSQL DB Server | None | None | **BROKEN** (App hardcoded to SQLite `sqlite3` driver) |
