# Internship Operations Platform — Development Phases

## Strategy

Build the project as a sequence of vertical slices.

Do not build every frontend screen first and postpone backend/AI/integration work.

Each phase should produce something demonstrable.

---

# Phase 0 — Project Foundation

### Goal
Create the technical skeleton.

### Build
- Git repository
- React/Vite/JavaScript
- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- environment configuration
- Docker setup if desired
- basic CI

### Deliverable
Frontend and backend run together and can communicate.

---

# Phase 1 — Authentication and Roles

### Goal
Establish the user model.

### Build
- registration
- login
- password hashing
- authentication
- role system
- provider/mentor/candidate roles
- protected routes
- server-side authorization

### Deliverable
Three users can log in and see role-specific areas.

---

# Phase 2 — Internship Management

### Goal
Create the core provider workflow.

### Build
- provider dashboard
- create internship
- edit internship
- publish/unpublish
- internship list
- internship details
- eligibility
- skills
- openings
- deadline
- duration
- stipend
- work mode

### Deliverable
Provider can create and publish an internship.

---

# Phase 3 — Applications

### Goal
Create the candidate application lifecycle.

### Build
- public internship listing
- internship details
- candidate application
- resume upload
- application status
- provider application table
- candidate profile

### Deliverable
Candidate applies and provider sees the application.

---

# Phase 4 — AI Resume Screening

### Goal
Introduce the first major AI capability.

### Build
- PDF/DOCX extraction
- resume processing
- structured candidate profile
- Gemini integration
- AI analysis storage
- candidate match explanation
- Make.com workflow

### Deliverable

```text
Resume
 ↓
AI analysis
 ↓
Structured profile
 ↓
Provider dashboard
```

---

# Phase 5 — Candidate Matching and Shortlisting

### Goal
Turn AI extraction into an actionable workflow.

### Build
- deterministic scoring
- skill matching
- requirement matching
- explainable results
- shortlist
- reject
- manual override
- application timeline

### Deliverable
Provider can review and shortlist candidates.

---

# Phase 6 — Communication Automation

### Goal
Automate candidate communication.

### Build in Make.com
- application confirmation
- shortlist email
- rejection email
- selection email
- assessment invitation

### Deliverable
Changing an application status triggers the correct communication.

---

# Phase 7 — Assessment

### Goal
Add structured candidate evaluation.

### Build
- assessment creation
- MCQ
- short answer
- debugging
- candidate assessment page
- scoring
- result storage
- AI-generated question option

### Deliverable
Candidate completes an assessment and provider sees the result.

---

# Phase 8 — Interview

### Goal
Automate interview scheduling and preparation.

### Build
- interview slots
- booking
- conflict prevention
- calendar integration
- reminders
- AI interview questions
- candidate-specific questions

### Deliverable
Candidate books an interview and interviewer receives AI-assisted questions.

---

# Phase 9 — Selection and Onboarding

### Goal
Move candidates into active internships.

### Build
- selection workflow
- onboarding checklist
- document upload
- profile completion
- agreement/policy completion
- onboarding progress

### Deliverable
Selected candidate becomes an active intern.

---

# Phase 10 — Task Management

### Goal
Build the operational internship workspace.

### Build
- mentor dashboard
- intern list
- task creation
- task assignment
- deadlines
- priorities
- submission
- review
- comments
- Kanban UI

### Deliverable
Mentor can assign work and intern can submit it.

---

# Phase 11 — Attendance and Progress

### Goal
Collect operational evidence.

### Build
- check-in
- check-out
- attendance history
- attendance summary
- task progress
- progress dashboard
- optional GitHub integration

### Deliverable
Provider/mentor can see internship activity.

---

# Phase 12 — AI Weekly Reports

### Goal
Automate progress reporting.

### Build
Make.com scheduled workflow:
- collect task data
- collect attendance
- collect GitHub activity
- collect mentor feedback
- send structured context to Gemini
- generate report
- save through API
- notify mentor

### Deliverable
A weekly report is generated automatically.

---

# Phase 13 — AI Mentor Feedback

### Goal
Reduce mentor reporting effort.

### Build
- feedback form
- AI draft
- strengths
- improvements
- next steps
- edit/approve
- feedback history

### Deliverable
Mentor enters rough notes and receives an editable structured draft.

---

# Phase 14 — Final Evaluation

### Goal
Close the internship lifecycle.

### Build
- evaluation form
- categories
- mentor evaluation
- provider review
- AI summary
- completion status

### Deliverable
Internship can be officially completed.

---

# Phase 15 — Certificates

### Goal
Automate proof of completion.

### Build
- unique certificate ID
- certificate template
- PDF generation
- QR code
- storage
- certificate notification

### Deliverable
Completed intern receives a verifiable certificate.

---

# Phase 16 — Public Verification

### Goal
Make certificates independently verifiable.

### Build
- public verification page
- certificate ID search
- QR route
- server-side verification
- limited public information

### Deliverable
Anyone can verify a certificate.

---

# Phase 17 — RAG / Organization Knowledge

### Goal
Add deeper AI capabilities if time allows.

### Build
- company documents
- text extraction
- chunking
- embeddings
- pgvector
- retrieval
- source-aware responses

### Example
Mentor asks:

> What are the backend internship evaluation criteria?

The assistant retrieves the company's actual policy.

---

# Phase 18 — Production Hardening

### Build
- error handling
- loading states
- empty states
- authorization audit
- file security
- webhook security
- rate limiting
- logging
- tests
- monitoring
- deployment
- backups

---

# Recommended Hackathon Cut

If time is limited, complete these first:

```text
1. Authentication
2. Provider Dashboard
3. Internship Creation
4. Applications
5. AI Resume Screening
6. Candidate Matching
7. Shortlisting
8. Communication Automation
9. Assessment
10. Selection
11. Onboarding
12. Task Management
13. Mentor Dashboard
14. AI Weekly Report
15. Final Evaluation
16. Certificate
17. Verification
```

Then add:
- Calendar
- GitHub
- attendance
- AI feedback
- RAG

as time permits.

---

# Demo Sequence

The final hackathon demo should tell one story:

```text
Provider creates internship
        ↓
Candidate applies
        ↓
Resume automatically analyzed
        ↓
Provider sees explainable match
        ↓
Candidate shortlisted
        ↓
Email automatically sent
        ↓
Candidate completes assessment
        ↓
Interview scheduled
        ↓
Candidate selected
        ↓
Onboarding completed
        ↓
Mentor assigns task
        ↓
Intern submits task
        ↓
Activity collected
        ↓
AI generates weekly report
        ↓
Mentor gives feedback
        ↓
Final evaluation
        ↓
Certificate generated
        ↓
QR scanned
        ↓
Certificate verified
```

This should be the primary "golden path" of the hackathon demo.
