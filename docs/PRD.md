# Internship Operations Platform — Product Requirements Document

## 1. Product Overview

**Working name:** InternFlow  
**Product type:** AI-powered internship operations platform  
**Primary users:** Internship providers, mentors, interns/candidates  
**Core idea:** Automate the internship lifecycle from internship creation and candidate screening through onboarding, internship execution, evaluation, certification, and public certificate verification.

The product is not intended to be a generic job board. Its core value is **internship operations automation**.

### Core lifecycle

Provider creates internship → candidates apply → AI assists screening → assessment/interview → selection → onboarding → tasks/attendance/progress → mentor feedback → weekly AI reports → final evaluation → certificate → public verification.

---

## 2. Problem

Internship providers often manage recruitment and internship operations through disconnected tools such as forms, spreadsheets, email, calendars, messaging applications, GitHub, and manually generated documents.

This creates:
- repetitive administrative work
- inconsistent candidate communication
- difficult candidate screening
- fragmented intern progress information
- manual weekly reporting
- inconsistent evaluation
- manual certificate generation
- poor traceability across the internship lifecycle

---

## 3. Product Goals

### Primary goals

1. Centralize internship lifecycle management.
2. Reduce repetitive provider/mentor work through automation.
3. Use AI where interpretation or generation provides genuine value.
4. Keep business-critical data and permissions inside the core application.
5. Provide explainable AI outputs rather than opaque decisions.
6. Connect external services through Make.com workflows.
7. Produce a complete end-to-end hackathon demonstration.

### Non-goals for v1

- Full job-board marketplace
- Payroll/stipend processing
- Banking/payment infrastructure
- Biometric attendance
- Automated hiring decisions without human review
- Enterprise HRIS replacement
- Fully autonomous AI recruiter
- Production-grade coding judge
- Complex employee benefits management

---

## 4. User Roles

### Provider
Creates internships, manages applications, selects candidates, assigns mentors, monitors internships, evaluates completion, and issues certificates.

### Mentor
Manages assigned interns, creates/reviews tasks, provides feedback, monitors progress, and contributes to final evaluation.

### Candidate / Intern
Browses internships, applies, completes assessments/interviews, completes onboarding, performs tasks, records attendance, receives feedback, and obtains certificates.

### Public Visitor
Can verify an issued certificate without having an account.

---

## 5. Feature Requirements

### 1. Provider Dashboard
The provider can:
- view active internships
- view applications
- view shortlisted/selected candidates
- monitor active interns
- view pending tasks and reports
- view attendance/progress analytics
- manage certificates

### 2. AI Resume Screening
The system can:
- accept PDF/DOCX resumes
- extract text
- identify skills, education, projects, experience, certifications
- compare extracted information with internship requirements
- return structured candidate data
- explain relevant matches and gaps

AI must assist rather than make an irreversible hiring decision.

### 3. Candidate Ranking / Shortlisting
The system can:
- calculate a transparent match score
- compare candidates against defined criteria
- display evidence for the score
- allow provider override
- track shortlist/rejection status

### 4. Automated Candidate Communication
The system can trigger:
- application acknowledgement
- shortlist notification
- assessment invitation
- interview invitation
- selection notification
- rejection notification
- onboarding reminders
- completion/certificate notification

### 5. AI Interview Scheduling
The system can:
- create interview slots
- expose available slots to candidates
- prevent double booking
- confirm bookings
- reschedule/cancel
- send reminders
- optionally create calendar/meeting events

### 6. AI Interview Assistant
The system can:
- generate questions from internship requirements
- generate candidate-specific questions from resumes/projects
- generate follow-up questions
- provide interviewer guidance/evaluation areas

### 7. Automated Assessment
The system can support:
- MCQs
- short answers
- debugging questions
- optional coding questions
- automated scoring where deterministic
- AI-assisted scoring for suitable subjective responses

### 8. Internship Onboarding
The system can:
- create onboarding checklists
- collect profile information
- collect required documents
- track agreement/policy completion
- show onboarding progress
- trigger onboarding notifications

### 9. Internship Task Management
Mentors can:
- create tasks
- assign tasks
- set priority/deadline
- review submissions
- add comments
- change status

Interns can:
- view tasks
- update status
- submit work
- respond to feedback

### 10. Automatic Progress Tracking
The system can combine:
- task completion
- submissions
- attendance
- optional GitHub activity
- mentor feedback

Progress must be presented as contextual evidence, not as a simplistic productivity judgment.

### 11. Weekly AI Progress Report
The system can:
- collect weekly internship data
- summarize completed/pending work
- summarize mentor feedback
- identify improvement areas
- recommend next steps
- save reports
- notify mentors/providers

### 12. Attendance / Check-in
The system can:
- check in
- check out
- calculate working hours
- record daily attendance
- show attendance history
- display summary statistics

### 13. Mentor Dashboard
Mentors can:
- view assigned interns
- see intern status
- manage tasks
- review submissions
- view attendance
- view progress
- write feedback
- review AI-generated reports

### 14. AI Feedback Generation
Mentors can provide rough notes. AI can transform them into:
- strengths
- areas for improvement
- actionable next steps
- structured comments

Mentors must be able to edit/approve generated feedback.

### 15. Final Evaluation
The system can capture:
- technical skills
- problem solving
- communication
- teamwork
- reliability
- task completion
- project quality
- final comments
- completion status

AI may draft summaries but must not silently determine the final evaluation.

### 16. Automatic Certificate Generation
After completion requirements are satisfied:
- generate unique certificate ID
- generate certificate PDF
- add QR code
- store certificate
- notify candidate

### 17. Certificate Verification
Anyone can:
- scan certificate QR
- open verification URL
- enter certificate ID
- see whether certificate is valid
- view limited public certificate details

---

## 6. Functional Requirements

### Authentication
- Registration/login
- Password hashing
- JWT/session authentication
- Role-based access control
- Protected API routes

### Internship Management
- CRUD internship
- Draft/published/closed status
- Application deadline
- openings
- eligibility
- skills
- stipend
- duration
- work mode

### Application Management
- application submission
- resume upload
- application status
- screening result
- shortlist/reject
- provider notes

### Automation
The backend emits events that Make.com can consume through webhooks or API polling.

Example events:
- `application.created`
- `candidate.shortlisted`
- `interview.booked`
- `candidate.selected`
- `onboarding.completed`
- `internship.week.completed`
- `evaluation.completed`
- `certificate.issued`

### Auditability
Important provider actions should be logged:
- shortlist
- rejection
- selection
- evaluation changes
- certificate issuance
- permission-sensitive changes

---

## 7. AI Requirements

AI outputs should use structured schemas whenever possible.

AI should:
- return evidence with conclusions
- distinguish extracted facts from generated interpretation
- avoid inventing candidate qualifications
- fail safely when resume data is missing
- allow human review before consequential actions

### AI use cases

| Use case | AI |
|---|---|
| Resume extraction | Gemini |
| Candidate-job explanation | Gemini |
| Interview questions | Gemini |
| Assessment generation | Gemini |
| Subjective assessment assistance | Gemini |
| Weekly report | Gemini |
| Feedback drafting | Gemini |
| Communication drafting | Gemini |
| Company knowledge Q&A | Gemini + RAG |

---

## 8. Success Criteria for Hackathon MVP

A successful demo should show one complete journey:

1. Provider creates internship.
2. Candidate applies.
3. Resume is analyzed.
4. Provider sees explainable match information.
5. Candidate is shortlisted.
6. Automated communication is triggered.
7. Candidate completes assessment/interview flow.
8. Candidate is selected.
9. Onboarding is completed.
10. Mentor assigns tasks.
11. Intern submits work.
12. Progress data is collected.
13. AI weekly report is generated.
14. Mentor provides feedback.
15. Final evaluation is completed.
16. Certificate is generated.
17. QR/certificate verification works.

---

## 9. Core Data Entities

- User
- Company
- Internship
- Application
- Resume
- CandidateProfile
- CandidateMatch
- Assessment
- AssessmentQuestion
- AssessmentAttempt
- Interview
- InterviewSlot
- OnboardingItem
- Intern
- Task
- TaskSubmission
- Attendance
- MentorFeedback
- WeeklyReport
- Evaluation
- Certificate
- Notification
- AuditLog

---

## 10. Security and Privacy Requirements

- Hash passwords securely.
- Enforce server-side authorization.
- Never trust role information supplied only by the client.
- Restrict candidate documents to authorized users.
- Use signed/temporary file URLs where appropriate.
- Validate uploaded files.
- Limit file size and supported types.
- Sanitize user-generated content.
- Keep secrets in environment variables.
- Never expose Gemini/API keys to the frontend.
- Log sensitive operations without logging unnecessary personal data.
- Apply least-privilege access to external integrations.

---

## 11. Product Principle

**AI recommends. Humans decide.**

The platform should automate repetitive operations without turning important recruitment/evaluation decisions into unreviewable AI decisions.
