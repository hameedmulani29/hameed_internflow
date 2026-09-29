# Internship Operations Platform — Engineering Rules

## 1. Core Principles

### Rule 1 — Build the core product first
Do not start by building AI workflows before the core data model, authentication, internship lifecycle, and API are stable.

### Rule 2 — PostgreSQL is the source of truth
Make.com, Gemini, GitHub, and email are integrations. They do not own core application state.

### Rule 3 — AI assists; humans decide
AI can recommend, summarize, extract, and generate. Providers/mentors retain control over consequential decisions.

### Rule 4 — No opaque candidate decisions
Every AI-assisted candidate recommendation should expose relevant evidence, criteria, and limitations.

### Rule 5 — Deterministic logic stays deterministic
Do not ask an LLM to calculate:
- attendance percentage
- task completion
- deadlines
- certificate IDs
- permissions
- application statuses
- exact scoring formulas

Use application code.

---

## 2. Coding Rules

### Backend
- Use Python type hints.
- Use Pydantic request/response schemas.
- Use SQLAlchemy models.
- Keep route handlers thin.
- Put business logic in services.
- Validate external input.
- Use migrations through Alembic.
- Never hardcode secrets.

### Frontend
- Use JavaScript.
- Avoid unnecessary `any`.
- Keep reusable UI components generic.
- Keep API calls in service/query layers.
- Handle loading, empty, error, and success states.
- Do not duplicate business logic in multiple components.

### Naming
Use consistent naming:
- `camelCase` in frontend
- `snake_case` in Python
- clear database names
- descriptive API endpoints

---

## 3. API Rules

- Version APIs when needed.
- Return consistent error structures.
- Validate request bodies.
- Validate ownership and permissions server-side.
- Never trust IDs supplied by the client without authorization checks.
- Avoid leaking internal database errors to users.
- Use pagination for large lists.
- Use filtering/search parameters rather than loading everything.

---

## 4. Database Rules

- Use foreign keys.
- Add indexes to frequently queried fields.
- Use timestamps.
- Use explicit status fields.
- Avoid storing duplicated derived data unless justified.
- Use transactions for multi-step critical operations.
- Keep audit records for sensitive actions.
- Never delete records silently when audit/history is important.

---

## 5. AI Rules

### Prompting
Prompts should specify:
- role
- task
- input
- constraints
- expected JSON schema
- uncertainty behavior

### AI output
Every important AI response must be:
1. parsed
2. schema-validated
3. business-rule validated
4. stored only after validation

### AI hallucination control
The model must not invent:
- candidate skills
- experience
- qualifications
- interview facts
- attendance
- task completion
- certificate validity

If evidence is missing, output:
`unknown`, `not_found`, or an equivalent explicit state.

### Human review
Require review before:
- final rejection where AI materially contributed
- final selection
- final evaluation
- negative performance feedback
- certificate issuance if completion data is inconsistent

---

## 6. Make.com Rules

### Use Make.com for
- email
- calendar
- scheduled workflows
- external API orchestration
- AI workflow chains
- notifications
- periodic reports

### Do not use Make.com for
- primary authorization
- primary database
- complex transactional business rules
- certificate verification logic
- security-critical validation

### Workflow requirements
Every important workflow should have:
- trigger
- input validation
- main action
- success handling
- failure handling
- retry strategy
- duplicate prevention
- logging

---

## 7. Security Rules

- Hash passwords using a modern password hashing algorithm.
- Keep API keys in environment variables/secrets.
- Never commit `.env`.
- Never expose Gemini/API credentials to frontend code.
- Validate upload type and size.
- Prevent unauthorized file access.
- Use secure URLs for private files.
- Enforce organization-level isolation.
- Rate-limit sensitive endpoints.
- Protect webhook endpoints.
- Verify webhook signatures where supported.
- Sanitize user-generated HTML/content.
- Keep production CORS restrictive.

---

## 8. File Rules

Allowed initial formats:
- PDF
- DOCX
- PNG/JPG where OCR is needed

Every uploaded file should have:
- generated storage key
- owner
- organization
- type
- size
- upload timestamp

Do not trust original filenames.

---

## 9. Candidate Data Rules

Candidate data is sensitive.

Only expose:
- the minimum information required for the current role
- documents to authorized users
- private contact information to authorized users

Public certificate verification must not expose unnecessary personal data.

---

## 10. GitHub Rules

GitHub activity is contextual evidence.

Do not use:
- commit count as a direct performance score
- number of commits as a proxy for quality
- repository activity as the only evaluation input

Use activity to support mentor review.

---

## 11. Certificate Rules

Certificate IDs must be unique.

Verification must happen against the backend database.

Never allow the frontend to declare:
`certificate = valid`.

The server must determine validity.

---

## 12. UX Rules

Every asynchronous action must show:
- loading
- success
- failure

Every data page should support:
- empty state
- loading state
- error state

Avoid:
- unexplained AI scores
- giant text walls
- unnecessary animations
- hidden destructive actions
- confusing status labels

---

## 13. Development Rules

Build vertically.

Bad approach:
```text
Build all frontend
→ build all backend
→ add AI later
```

Preferred:
```text
Feature
→ database
→ API
→ UI
→ automation
→ test
→ next feature
```

---

## 14. Hackathon Rules

Prioritize:
1. Complete lifecycle
2. Reliability
3. Clear demo
4. AI usefulness
5. Good UX

Do not sacrifice the core workflow to add impressive-looking but disconnected AI features.

---

## 15. Definition of Done

A feature is not done until:
- UI works
- API works
- database state persists
- authorization is checked
- error states work
- happy path is tested
- integration is tested if applicable
- no critical secrets are exposed
