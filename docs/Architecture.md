# Internship Operations Platform — Architecture

## 1. Architecture Principle

Use a **hybrid architecture**:

- React handles the product interface.
- FastAPI owns core application logic and APIs.
- PostgreSQL is the source of truth.
- Object storage stores files.
- Make.com orchestrates external automation.
- Gemini provides AI capabilities.
- External APIs provide integrations.

Do not make Make.com the application's database or core authorization layer.

---

## 2. High-Level Architecture

```text
                         ┌──────────────────────┐
                         │       React          │
                         │    JavaScript/Vite   │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                         ┌──────────────────────┐
                         │       FastAPI        │
                         │   Core Application   │
                         └───────┬──────┬───────┘
                                 │      │
                   ┌─────────────┘      └──────────────┐
                   ▼                                    ▼
          ┌─────────────────┐                  ┌─────────────────┐
          │   PostgreSQL    │                  │ Object Storage  │
          │  + pgvector     │                  │ Supabase/S3    │
          └─────────────────┘                  └─────────────────┘
                                 │
                                 │ events/webhooks
                                 ▼
                         ┌──────────────────────┐
                         │      Make.com        │
                         │ Automation Workflows │
                         └─────┬────┬────┬─────┘
                               │    │    │
                    ┌──────────┘    │    └───────────┐
                    ▼               ▼                ▼
                 Gemini          Gmail          Calendar
                    │
                    ├──────── GitHub
                    │
                    └──────── Other APIs
```

---

## 3. Technology Stack

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
- Gemini API
- LangGraph only where multi-step AI workflows justify it

### Automation
- Make.com

### Documents
- PyMuPDF
- python-docx
- Tesseract OCR where required

### Storage
- Supabase Storage or Amazon S3

### External services
- GitHub API
- Google Calendar API
- Gmail/Resend

### Certificates
- ReportLab
- QR code library

### Optional infrastructure
- Redis
- Celery
- Docker
- GitHub Actions

---

## 4. Responsibility Boundaries

### React owns
- UI
- routing
- forms
- tables
- charts
- dashboards
- loading/error states
- client-side validation

### FastAPI owns
- authentication
- authorization
- business rules
- CRUD
- data validation
- scoring
- certificate verification
- event creation
- secure integration endpoints

### PostgreSQL owns
- persistent application state
- relationships
- statuses
- audit data
- AI structured outputs
- vector data where RAG is used

### Make.com owns
- external service orchestration
- email
- scheduled workflows
- calendar integration
- AI workflow chains
- notifications
- multi-step integrations

### Gemini owns
- language understanding
- extraction
- generation
- summarization
- explanation
- question generation

---

## 5. Core Backend Modules

```text
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── permissions.py
│   ├── auth/
│   ├── users/
│   ├── companies/
│   ├── internships/
│   ├── applications/
│   ├── resumes/
│   ├── assessments/
│   ├── interviews/
│   ├── onboarding/
│   ├── tasks/
│   ├── attendance/
│   ├── progress/
│   ├── feedback/
│   ├── evaluations/
│   ├── certificates/
│   ├── notifications/
│   ├── integrations/
│   ├── ai/
│   └── audit/
├── migrations/
└── tests/
```

---

## 6. Frontend Structure

```text
frontend/
├── src/
│   ├── app/
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   │   ├── auth/
│   │   ├── provider/
│   │   ├── mentor/
│   │   ├── candidate/
│   │   └── public/
│   ├── features/
│   ├── hooks/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── styles/
```

---

## 7. Event-Driven Automation

The backend should generate meaningful events.

Example:

```text
candidate.shortlisted
        ↓
POST Make webhook
        ↓
Make scenario
        ├── Generate communication
        ├── Send email
        └── Create notification
```

Another:

```text
internship.week.completed
        ↓
Make
        ├── Fetch tasks
        ├── Fetch attendance
        ├── Fetch GitHub activity
        ├── Fetch mentor feedback
        ├── Gemini summary
        └── Save report via FastAPI
```

---

## 8. API Style

Use REST for the core application.

Example:

```text
POST   /api/auth/login
GET    /api/internships
POST   /api/internships
GET    /api/internships/{id}
PATCH  /api/internships/{id}

POST   /api/applications
GET    /api/applications
PATCH  /api/applications/{id}/status

POST   /api/resumes/analyze

POST   /api/assessments
POST   /api/assessments/{id}/submit

POST   /api/interviews/slots
POST   /api/interviews/book

POST   /api/tasks
PATCH  /api/tasks/{id}

POST   /api/attendance/check-in
POST   /api/attendance/check-out

POST   /api/feedback
POST   /api/evaluations

POST   /api/certificates
GET    /api/certificates/{id}/verify
```

---

## 9. AI Architecture

Avoid putting all logic inside prompts.

Preferred flow:

```text
Raw input
   ↓
Parser/validator
   ↓
Gemini structured output
   ↓
Pydantic validation
   ↓
Business-rule validation
   ↓
Database
```

For candidate matching:

```text
Resume
 ↓
Extract structured profile
 ↓
Normalize skills
 ↓
Deterministic match calculation
 ↓
Gemini explanation
 ↓
Provider review
```

---

## 10. RAG Architecture

RAG is optional for v1 but useful for organization-specific knowledge.

```text
Company document
      ↓
Text extraction
      ↓
Chunking
      ↓
Embedding
      ↓
pgvector
      ↓
Similarity search
      ↓
Relevant context
      ↓
Gemini
      ↓
Answer with source references
```

Potential documents:
- company handbook
- internship policy
- project documentation
- evaluation policy
- onboarding guide

---

## 11. File Architecture

Files should not be stored directly in PostgreSQL.

```text
PostgreSQL
  stores:
  file_id
  storage_path
  owner_id
  file_type
  metadata

Object storage
  stores:
  resume.pdf
  agreement.pdf
  certificate.pdf
  project files
```

---

## 12. Authentication Flow

```text
Login
 ↓
FastAPI verifies credentials
 ↓
Token/session
 ↓
React stores secure auth state
 ↓
Request includes authorization
 ↓
FastAPI checks:
  1. authenticated?
  2. correct role?
  3. resource belongs to allowed organization?
```

Never rely on frontend route hiding as authorization.

---

## 13. Deployment Architecture

### Development

```text
React/Vite
localhost:5173

FastAPI
localhost:8000

PostgreSQL
local/Docker

Make.com
cloud

Gemini
cloud
```

### Production

```text
Vercel
  ↓
React

Render/Railway/Fly.io
  ↓
FastAPI

Supabase/Neon
  ↓
PostgreSQL

Supabase Storage/S3
  ↓
Files

Make.com
  ↓
Automations

Gemini
  ↓
AI
```

---

## 14. Architecture Rules

1. PostgreSQL is the source of truth.
2. Make.com is not the primary database.
3. FastAPI owns authorization.
4. AI outputs must be validated.
5. External integrations should be isolated behind service modules.
6. Never expose API secrets to React.
7. Critical decisions require human review.
8. Keep deterministic calculations outside the LLM.
9. Make workflows should be idempotent where possible.
10. Every asynchronous workflow should have a failure path.
