# INTERNFLOW — Phase 1 Audit: AI Internship Orchestration & Mentor Copilot

Scope: repository-wide frontend audit against the new orchestration model. No code modified during this phase.

## 1. VERIFIED BACKEND CAPABILITIES (reuse — do not duplicate)

| Capability | Backend truth | Frontend status |
| --- | --- | --- |
| **AI weekly progress report** | `weekly_report_service.py` (Gemini + deterministic fallback), persisted in `weekly_reports` table, API: `POST /api/progress/weekly-report/generate`, `GET /api/progress/weekly-reports/assignment/{id}`, `/weekly-reports/me`, `GET /api/progress/weekly-report/{assignment_id}` (markdown). Scheduler callback `run_weekly_report_job` exists but **is never invoked** (no scheduler in `main.py`). | Service fns exist in `phase20Service.js` (`generateWeeklyReport`, `fetchAssignmentWeeklyReports`, `fetchMyWeeklyReports`) — **no page consumes them**. |
| **Weekly report payload** | `summary, completed_work, pending_work, achievements, challenges, next_week_focus, mentor_attention_items, metrics, ai_status` — maps directly to prompt §22 fields. | Same. |
| **Roadmap hierarchy** | `projects` → `master_tasks` (sequence) → `project_chunks` (sequence) → `mentor_tasks` (execution, per intern). Distribution engine (equal / priority / workload_balanced) + scheduling engine (capacity-based dates, activates project). All mentor-owned + assignment-checked. | Full UI in `MentorProjectsPage.jsx` (create/edit master tasks & chunks, distribute preview→execute, schedule preview→execute). This is the "AI plan" backbone; it is currently deterministic (heuristic), not AI. |
| **Milestones (per-intern goals)** | `internship_goals` + `goal_milestones` (pending/in_progress/completed, due_date) with API `/api/goals*`. `weekly_report_service` counts completed milestones per week. | Service fns exist in `phase20Service.js` — **no UI**. |
| **Mentor dashboard** | `GET /api/mentor/dashboard`: interns (+progress %), pending_reviews, projects_summary, metrics, recent_activity, pending_evaluations. | Rendered in `MentorWorkspacePage.jsx` `Dashboard`. No risk states / attention queue (data doesn't exist yet). |
| **Real-time monitoring** | `activity_events` + WebSocket `/api/ws/mentor`; frontend already subscribes (`realtimeService.js`) and prepends live events. | Working. |
| **AI screening / interview questions** | `/api/applications/{id}/screen`, `/ai-screening`, screening-queue; `/api/interviews/ai-generate-questions`. | Provider UI exists (Reports/Screening views, interview modal). Leave as-is. |
| **Provider mentor assignment** | `POST /api/mentor/assignments` (mentor+intern+internship), `GET /api/mentor/assignments` (ownership-scoped), `/assignments/mentors`, `/assignments/mentees/{id}/detail`. | Provider UI exists. |
| **Task submission & review** | `POST /api/interns/tasks/{id}/submit` (content/repo_url/demo_url/notes), `PATCH /api/mentor/submissions/{id}?decision=approved|changes_requested`. Task statuses: assigned/in_progress/submitted/completed/changes_requested. | Working both sides. No AI pre-review (backend has none). |
| **Attendance, evaluations, feedback, certificates, outcomes** | All real, previously verified. | Working. |

## 2. CONFIRMED BACKEND GAPS (do not fake in frontend)

1. **Blocker reports** — no entity, endpoint, or field. Prompt §16 needs: blocker entity (type, description, task link, status, timestamps) + intern POST + mentor GET/resolve endpoints.
2. **Progress/risk state (ON TRACK / AHEAD / AT RISK / BLOCKED / INACTIVE / COMPLETED)** — not computed anywhere. Needs backend derivation (overdue tasks, attendance gap, submission staleness) exposed on dashboard/interns endpoints, with evidence + reason codes (§17, §18).
3. **"Requires Attention" queue** — backend can partially serve it (pending_reviews, drafts, overdue tasks derivable), but blocked/at-risk/inactive detection needs the risk-state work.
4. **AI planning status / plan review** — projects exist with `status` (draft/active/completed/archived) but there is no planning state machine (not_planned/planning/needs_review/approved/replanning), no AI plan generator endpoint, no plan-version storage. The **distribution/schedule preview→execute pattern is the existing human-in-the-loop equivalent**; a true AI planner is a backend feature.
5. **Definition of Done / acceptance criteria** — no fields on internships, projects, master_tasks, or chunks.
6. **Project complexity, intern level, dependencies between tasks, epics** — no fields.
7. **AI pre-review of submissions** — backend returns submission content only; no analysis endpoint.
8. **AI mentor feedback draft** — does **not** exist (prompt claimed it; audit disproves). `mentor_feedback` router is intern→mentor feedback. Gap: AI-draft endpoint for mentor feedback.
9. **Mentor daily digest** — no endpoint; weekly report covers weekly cadence only.
10. **Scheduler** — `run_weekly_report_job` never scheduled; automations are webhook-out (Make.com) only (cert.issued, weekly_report.generated events exist).
11. **Internship form orphans** — frontend collects `requirements`, `responsibilities`, `mentor_assigned`, `ai_screening_enabled` in `CreateInternship` but **submits only InternshipInput fields**; those four go nowhere (duplicate/orphan entry to remove or wire).
12. **Calculated duration** — `internships.duration` is free text ("12 weeks"); no start/end dates on internships (dates live on `projects`). Duration-from-dates is a backend change.

## 3. SCREEN-BY-SCREEN MAP (Screen | Function | Change | Backend dependency)

### Mentor
| Screen | Existing function | Change required | Backend dependency |
| --- | --- | --- | --- |
| /mentor/dashboard | Metrics, pending reviews, intern progress, activity feed, projects progress, intern feedback preview | → **Control tower**: add progress/risk state rollup + Requires Attention queue (pending reviews, overdue tasks, stale interns — derivable client-side today) + risk-state chips w/ evidence on intern rows | Risk states + attention queue endpoints (backend) for full fidelity |
| /mentor/interns | Search/filter/paginate list | Add risk-state column & filters; empty states | Risk state per intern |
| /mentor/interns/{id}/detail | Profile, assignment, tasks, submissions, feedback, skills, observations | Add blocker section (read + resolve), weekly-report AI summary block, goal/milestone progress | Blockers (backend), weekly report API (exists), goals API (exists) |
| /mentor/projects | Project CRUD + master tasks/chunks + distribute/schedule preview→execute | → **AI Planning screen**: rename framing to "AI plan proposal", keep preview→approve as the review flow; add roadmap progress bars per master task; AI-transparency labels; "Not planned / Plan ready" status chip derived from data (no fake AI status) | AI plan generator + planning status (backend); frontend prepares |
| /mentor/tasks | Create/assign tasks, filter, mark status | Add "distributed from project" context, acceptance-criteria display when available, blocker indication | Acceptance criteria, blockers (backend) |
| /mentor/submissions | Review approve / changes_requested | Add AI pre-review panel slot (labeled, only when backend provides) + AI feedback draft affordance (gap) | AI pre-review + AI feedback draft (backend) |
| /mentor/feedback | Create feedback (text/strengths/improvements/next_steps) | Keep; add "Draft with AI" button placeholder → gap note (no fake AI) | AI feedback draft (backend) |
| /mentor/evaluations | Draft/submit evaluations | Add weekly-report evidence link (exists) | none |
| /mentor/calendar | Honest N/A | Keep (already honest) | — |
| /mentor/intern-feedback | Intern→mentor feedback list | Keep | — |

### Intern
| Screen | Existing function | Change required | Backend dependency |
| --- | --- | --- | --- |
| /intern (dashboard) | Workspace data, task filters (today/overdue/upcoming/submitted/completed), submit modal, attendance check-in, feedback modal | → **Today's Work**: action-oriented reorder (Today's Work → current milestone → blockers → recent feedback → weekly report summary), acceptance-criteria/deliverable display, blocker report button + modal, "what's next" copy | Blocker POST (backend); goals API exists for milestone; weekly-report API exists |
| /intern/assessment, /interview | Server timer, read-only scorecard | Keep | — |
| /intern/my-skills, /intern/mentor-feedback | Real | Keep | — |

### Provider
| Screen | Existing function | Change required | Backend dependency |
| --- | --- | --- | --- |
| /provider-internship-new | 5-step wizard; submits InternshipInput | Reorganize into Basic Info / Objectives / Project Definition (+ Definition-of-Done checklist UI stored locally pending backend, or hidden), remove orphan fields (requirements/responsibilities/mentor_assigned/ai_screening_enabled) | DoD fields (backend) to persist |
| /provider-internships, /provider-interns, /provider-reports | Real | Add internship-level progress/rollup display where data exists; provider visibility of risk requires backend rollup | Provider-level risk/progress rollup (backend) |

### Public/auth
No changes required (Landing, Explore, Verify, Login, Register already honest and verified).

## 4. IMPLEMENTATION STRATEGY (Phases 4–5)

1. **Reuse the Phase-2 engine as the plan backbone**: milestones = master tasks; daily work = chunks + schedule; review = preview→execute (mentor approves). Frame with AI-transparency copy ("Generated plan proposal — review before activation") without claiming AI where the engine is deterministic.
2. **Derive, don't invent**: overdue/today/stale detection and simple risk states computed client-side from real API data with visible evidence, labeled as system states; backend gap report carries the authoritative version.
3. **Wire the orphaned services**: goals/milestones (`/api/goals*`) and weekly reports (`/api/progress/*`) into mentor detail + intern dashboard — real APIs already deployed.
4. **No fake AI anywhere**: every AI surface either calls a real endpoint (screening, interview Qs, weekly report) or renders an explicit "AI unavailable — backend feature required" state recorded in the gap report.
5. **Statuses**: use existing enums verbatim (internship draft/published/closed/archived; task assigned/in_progress/submitted/completed/changes_requested; project draft/active/completed/archived). Progress-state chips derived client-side are presentation only.

## 5. KEY OPEN DECISIONS RESOLVED

- Weekly report AI: **VERIFIED real** (Gemini + fallback) → integrate, don't duplicate.
- AI mentor feedback draft: **DOES NOT EXIST** → gap report, no UI fake.
- Scheduler for weekly reports: **NOT WIRED** → automation dependency.
- Milestones: two existing systems — `goal_milestones` (per-intern learning) and `master_tasks` (project roadmap). UI must not conflate them; roadmap uses master_tasks, intern milestone progress uses goals.
- `projects.objective`/`deliverable` exist → internship "Project Definition" section maps to them (no new backend needed for objectives; DoD still needs backend).
