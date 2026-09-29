# Internship Operations Platform — Project Memory

## Purpose

This file is the compact project memory/reference for future development sessions.

When starting a new session, use this file to recover the project's decisions and constraints before changing architecture.

---

## Product Identity

**Working name:** InternFlow  
**Category:** AI-powered Internship Operations Platform

### One-line description

An AI-powered platform that helps internship providers manage the complete internship lifecycle — from recruitment and screening to onboarding, task management, mentoring, evaluation, certification, and verification.

### Core positioning

> **An operating system for running internships, not another internship/job board.**

---

## Core Users

### Provider
Owns internships and the internship lifecycle.

### Mentor
Manages assigned interns and their work.

### Candidate / Intern
Applies, completes selection, performs internship work, and receives evaluation/certificate.

### Public Visitor
Verifies certificates.

---

## 17 Core Features

1. Provider Dashboard
2. AI Resume Screening
3. Candidate Ranking / Shortlisting
4. Automated Candidate Communication
5. AI Interview Scheduling
6. AI Interview Assistant
7. Automated Assessment
8. Internship Onboarding
9. Internship Task Management
10. Automatic Progress Tracking
11. Weekly AI Progress Report
12. Attendance / Check-in
13. Mentor Dashboard
14. AI Feedback Generation
15. Final Evaluation
16. Automatic Certificate Generation
17. Certificate Verification

Do not silently remove a feature from the product specification. If a feature is deferred, mark it as deferred.

---

## Architecture Decision

### Core application

```text
React
JavaScript
Vite
        ↓
FastAPI
        ↓
PostgreSQL
```

### Automation

```text
FastAPI
   ↓
Make.com
   ↓
Gemini / Gmail / Calendar / GitHub / other services
```

### Storage

```text
Supabase Storage or S3
```

### AI

```text
Gemini
```

### Optional AI orchestration

```text
LangGraph
```

Use LangGraph only when a multi-step AI workflow actually needs it.

---

## Technology Stack

### Frontend
- React
- JavaScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS
- Recharts

### Backend
- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic

### Database
- PostgreSQL
- pgvector

### AI
- Gemini
- LangGraph where justified

### Automation
- Make.com

### Documents
- PyMuPDF
- python-docx
- Tesseract OCR

### Integrations
- GitHub API
- Google Calendar API
- Gmail/Resend

### Certificates
- ReportLab
- QR code library

### Infrastructure
- Docker
- GitHub Actions
- Vercel
- Render/Railway/Fly.io
- Supabase/Neon
- Upstash if Redis is needed

---

## Most Important Architecture Rule

### PostgreSQL = source of truth

Make.com is an automation/orchestration layer.

Gemini is an intelligence layer.

Neither should replace the application's core database or authorization system.

---

## AI Philosophy

### AI recommends. Humans decide.

AI can:
- extract
- summarize
- explain
- generate
- recommend
- draft

AI should not silently:
- reject candidates
- select candidates
- determine final evaluation
- invent candidate information
- determine certificate validity

Provider/mentor must retain control over consequential decisions.

---

## Deterministic vs AI

### Deterministic

Keep in backend code:
- authentication
- authorization
- application status
- deadlines
- attendance calculations
- task completion
- scoring formulas
- certificate IDs
- certificate verification
- permissions

### AI

Use Gemini for:
- resume extraction
- candidate match explanation
- interview questions
- assessment generation
- subjective answer assistance
- weekly reports
- feedback drafts
- communication drafts
- RAG Q&A

---

## Make.com Philosophy

Use Make.com for:
- event-driven automation
- email
- calendar
- scheduled reports
- external integrations
- AI workflow chains
- notifications

Do not use Make.com for:
- primary authentication
- primary authorization
- primary database
- core transactional business rules
- public certificate verification

---

## Main Data Entities

```text
User
Company
Internship
Application
Resume
CandidateProfile
CandidateMatch
Assessment
AssessmentQuestion
AssessmentAttempt
Interview
InterviewSlot
OnboardingItem
Intern
Task
TaskSubmission
Attendance
MentorFeedback
WeeklyReport
Evaluation
Certificate
Notification
AuditLog
```

---

## Main Roles

```text
PROVIDER
MENTOR
CANDIDATE
```

Optional:

```text
ADMIN
```

Public certificate verification does not require authentication.

---

## Core Lifecycle

```text
Create Internship
      ↓
Application
      ↓
Resume Screening
      ↓
Candidate Matching
      ↓
Shortlisting
      ↓
Assessment
      ↓
Interview
      ↓
Selection
      ↓
Onboarding
      ↓
Internship
      ↓
Tasks + Attendance + GitHub
      ↓
Weekly Reports
      ↓
Mentor Feedback
      ↓
Final Evaluation
      ↓
Certificate
      ↓
Public Verification
```

---

## Design Direction

### Feel

Professional, modern, trustworthy, operational.

Avoid:
- generic job-board appearance
- excessive neon AI styling
- overly dense enterprise UI
- unnecessary animations

### Suggested colors

```text
Primary:        #4F46E5
Primary Dark:   #3730A3
Background:     #F8FAFC
Surface:        #FFFFFF
Surface Alt:    #F1F5F9
Text Primary:   #0F172A
Text Secondary: #475569
Text Muted:     #64748B
Border:         #E2E8F0
Success:        #16A34A
Warning:        #D97706
Danger:         #DC2626
Info:           #0284C7
```

### Font

Inter, Geist, or Plus Jakarta Sans.

---

## Provider Navigation

```text
Dashboard
Internships
Applications
Candidates
Interviews
Interns
Tasks
Attendance
Reports
Certificates
Automation
Settings
```

---

## Intern Navigation

```text
Overview
Tasks
Assessment
Interview
Attendance
Reports
Documents
Certificate
```

---

## Mentor Navigation

```text
Dashboard
My Interns
Tasks
Submissions
Attendance
Feedback
Reports
Evaluations
```

---

## Important UX Rule

Every page must handle:

```text
Loading
Empty
Error
Success
```

Do not show blank screens.

---

## Security Memory

Always remember:

- secrets only on server
- passwords hashed
- server-side authorization
- organization-level data isolation
- private files protected
- uploaded files validated
- webhook endpoints protected
- API rate limiting where appropriate
- candidate data treated as sensitive
- public verification exposes only necessary certificate information

---

## Development Strategy

Build vertically.

Preferred:

```text
Database
 ↓
Backend
 ↓
Frontend
 ↓
Automation
 ↓
AI
 ↓
Test
 ↓
Next feature
```

Do not build all UI first.

---

## Hackathon Golden Path

The demo must be able to show:

```text
Provider creates internship
→ Candidate applies
→ Resume analyzed
→ Candidate match displayed
→ Candidate shortlisted
→ Automated email
→ Assessment
→ Interview
→ Selection
→ Onboarding
→ Mentor task
→ Intern submission
→ Progress data
→ AI weekly report
→ Mentor feedback
→ Final evaluation
→ Certificate
→ QR verification
```

---

## Current Scope Philosophy

The platform has 17 defined capabilities, but implementation can be staged.

### Must demonstrate
- Provider
- Candidate
- Mentor
- Internship
- Application
- AI screening
- Matching
- Communication
- Selection
- Onboarding
- Tasks
- Reports
- Evaluation
- Certificate
- Verification

### Can be integrated later
- Google Calendar
- GitHub
- advanced attendance
- RAG
- coding sandbox
- advanced analytics

Do not compromise the golden path just to add integrations.

---

## What Not To Do

Do not:
- turn the platform into a job marketplace
- make every screen AI-generated
- let AI make irreversible decisions
- store everything in Make.com
- use commit counts as performance scores
- build a coding judge before the core lifecycle works
- add RAG without a real knowledge-base use case
- create disconnected AI demos
- prioritize animations over workflow reliability

---

## Project Success Definition

The project succeeds when a judge can understand this in one sentence:

> **"This platform lets an organization run an entire internship program in one place while AI and automation remove repetitive recruitment, communication, reporting, and administrative work."**
