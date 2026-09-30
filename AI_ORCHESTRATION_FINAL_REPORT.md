# INTERNFLOW — AI Internship Orchestration & Mentor Copilot: Final Report

Status: **frontend implementation complete and verified**. Nothing was rebuilt; all changes are edits to existing screens plus one new derivation service and one stylesheet. Every AI surface either calls a real backend endpoint or renders an explicit honest "not available yet" state — no invented backend functionality.

Companion documents: [`AUDIT_AI_ORCHESTRATION.md`](AUDIT_AI_ORCHESTRATION.md) (Phase 1 audit, verified capabilities, 12 confirmed gaps).

---

## A. FRONTEND CHANGES

Every changed screen, with what changed and why.

### Shared services & styles

| File | Change |
| --- | --- |
| `frontend/src/services/orchestrationService.js` | **New.** Client-side orchestration layer: `PROGRESS_STATES` (on_track / ahead / at_risk / blocked / inactive / completed), `deriveTaskInsights` (overdue / due-soon), `deriveInternState` (state + always-visible evidence), `buildAttentionQueue` (severity-ordered: changes_requested → pending reviews → overdue/stale → draft evaluations), `summarizeProgressStates` (rollup), `progressStateLabel`. All derived from real API payloads — no invented fields. |
| `frontend/src/styles/Orchestration.css` | **New.** Shared styles: `.orchestration-state-*` chips (text labels, never color-only), attention-queue rows, severity badges, AI-transparency note styles, evidence disclosure, plan banners, DoD checklist, mobile breakpoints. |
| `frontend/src/services/publicExperience.js` | **Bug fix (pre-existing).** `request()` routed `/mentor-feedback` to the mentor session via `path.startsWith('/mentor')`, so intern blocker submissions returned 401. Fixed: explicit branch resolves the role from the caller's location (`/mentor-feedback` = intern side, all other `/mentor*` = mentor side). Verified end-to-end in the browser. |

### Mentor (`frontend/src/pages/mentor/MentorWorkspacePage.jsx`)

| Screen | Changes |
| --- | --- |
| **/mentor/dashboard** | Rebuilt as a **control tower**: Requires-Attention panel with a progress-state rollup strip + severity-ordered attention queue (fed by a new `mentorTasks` fetch + `buildAttentionQueue`); intern cards now show derived `ProgressStateChip` (with evidence) instead of raw mentor status. Makes "who needs me right now?" a single glance. |
| **/mentor/interns** | Replaced fake status filters (on_track / needs_attention — values that never existed in the backend) with real filters (active / paused / completed). Added risk chip + "Why this state?" evidence disclosure. Added `internship_title` display. |
| **/mentor/interns/{id}** (InternDetailPage) | ProgressStateChip + evidence; per-task Overdue chips; new **Blocker Reports** panel (parses `[Blocker]`-prefixed intern→mentor feedback records, filtered per intern); new **Weekly Progress Reports** panel wired to the real `fetchAssignmentWeeklyReports` API, showing `ai_status` honestly, mentor attention items, and challenges. |
| **/mentor/tasks** | Status filter fixed to the real task enums (was `under_review`, a value the backend never returns — the filter matched nothing). |
| **/mentor/submissions** | Added an explicit, honest note: "AI pre-review not available yet — backend feature required" (slot reserved, no fake AI). |
| **/mentor/feedback** | Added an explicit, honest note: "AI feedback draft is planned, not connected" (gap documented, no fake button). |

### Mentor planning (`frontend/src/pages/mentor/MentorProjectsPage.jsx`)

| Screen | Changes |
| --- | --- |
| **/mentor/projects** | Header reframed as **"AI Planning & Roadmap"** with hierarchy copy (Internship → Project → Master tasks → Chunks → Tasks). Plan-status chips on every project card (`derivePlanStatus` → not_planned / plan_ready / executing) + legend. Roadmap progress bars per master task, computed from chunk completion (accessible, with aria attributes). Definition-of-Done repeatable checklist on the project create form (local-only, honest gap note). Two orchestration plan banners: creation ("nothing goes live until you execute") and distribution/scheduling engines ("Generated plan proposal — review before activation"). Engine section renamed "Plan Distribution & Scheduling". The existing preview→execute flow is preserved as the human-in-the-loop review. |

### Intern (`frontend/src/pages/intern/InternDashboardPage.jsx`)

| Screen | Changes |
| --- | --- |
| **/intern** (dashboard) | New 4-card orchestration strip: **Today's Work** (count + next task + Start working), **Current Milestone** (from real master_task/project data + overall progress bar), **Blockers** (changes-requested count + Report-a-blocker button), **Weekly Progress** (real `fetchMyWeeklyReports` API; labeled "AI-generated" vs "Prepared summary" by `ai_status`). New "Start here" banner: overdue-first next action with due date + estimate. **Blocker modal**: 8 structured types (technical_issue, requirement_unclear, dependency_blocked, environment_setup, missing_access, knowledge_gap, availability, other), description ≥ 20 chars, affected-task select; submits via the existing mentor-feedback API with a `[Blocker]`-prefixed message. "Report blocker" buttons on TaskCard + TaskDetailModal. |

### Provider (`frontend/src/pages/provider/ProviderWorkspacePage.jsx`)

| Screen | Changes |
| --- | --- |
| **/provider-internship-new** | Wizard reorganized: step 2 → **"Scope & Definition of Done"**, step 4 → **"Mentorship & Planning"** (informational workflow copy). **Removed four orphan fields** that were collected but never submitted to any API (`requirements`, `responsibilities`, `mentor_assigned` hardcoded-mentor select, `ai_screening_enabled`). New repeatable **Definition-of-Done checklist** on step 2, appended to the internship description on submit (`\n\nDefinition of Done:\n- item`) — uses the existing field, no backend change. Step 2 AI-screening copy made honest ("available per-candidate from Applications view"). Review step now shows Duration/Skills + the DoD list. |

### Explicitly untouched
Public/auth screens (Landing, Explore, Verify, Login, Register), application flow, assessment/interview, attendance, evaluations, certificates, notifications, admin — audited, no orchestration conflicts found, no changes required.

---

## B. NEW SCREENS

**None.** Per the master prompt (§5, §46), every orchestration concept was implemented by updating existing screens. The two genuinely new *files* (`orchestrationService.js`, `Orchestration.css`) are a shared derivation layer and stylesheet — not routes or screens. No second dashboard system, no duplicate task/reporting systems.

---

## C. NEW / MODIFIED FIELDS

| Field | Screen | Purpose | Existing / New | Backend supported? |
| --- | --- | --- | --- | --- |
| Definition of Done checklist (repeatable items) | Provider internship wizard step 2; Mentor project create | Concrete acceptance criteria instead of "complete the project" | **New UI**, persisted by appending to the existing `internships.description` (and stored locally on project create) | ✅ Partially — works via description text today; ❌ structured storage is a backend gap (see E.5) |
| Blocker report (type, description ≥20 chars, affected task) | Intern dashboard modal (also TaskCard / TaskDetailModal) | Intern escalates blockers in a structured way | **New UI**, transported via existing `intern_mentor_feedback` with a `[Blocker] Type: … / Affected task: …` message convention (`feedback_type: 'other'`) | ✅ Supported end-to-end today (verified in browser); ❌ proper blocker entity is a backend gap (E.1) |
| Progress state (on_track / ahead / at_risk / blocked / inactive / completed) + evidence | Mentor dashboard, intern cards, intern detail, interns list | Risk visibility without manual monitoring | **Derived client-side** — presentation only, never persisted | ⚠️ Derivable from real data today; ❌ authoritative backend computation with reason codes is gap E.2 |
| Attention-queue items | Mentor dashboard | "Who needs me right now?" | **Derived client-side** from dashboard + mentor tasks + submissions + evaluations | ⚠️ Partial today; ❌ server-side queue endpoint is gap E.3 |
| Plan status (not_planned / plan_ready / executing) | Mentor project cards | Shows where each project sits in planning | **Derived client-side** from project/task/chunk data | ⚠️ Derivable; ❌ true planning state machine is gap E.4 |
| Roadmap progress per master task | Mentor project cards | Progress without manual calculation | **Derived client-side** from chunk completion | ✅ Fully supported by existing roadmap tables |
| Weekly report card (`ai_status`, mentor_attention_items, challenges) | Intern dashboard, mentor intern detail | Surfaces the existing real AI weekly report | **Existing backend** (`weekly_reports`), previously orphaned — now consumed | ✅ Fully supported |
| Next action ("Start here": task, due date, estimate) | Intern dashboard | Removes "what do I do now?" friction | **Derived client-side** from real task data (overdue-first) | ✅ Fully supported |
| **Removed:** `requirements`, `responsibilities`, `mentor_assigned`, `ai_screening_enabled` (wizard) | Provider internship wizard | Were collected but never submitted — orphan data entry | **Removed** (honest fix per audit gap 11) | n/a — nothing was ever persisted |

No field requires manual entry where the backend already provides it, and no field was invented that the backend cannot carry.

---

## D. AI UX CHANGES

| Area | What the UI now does | Honesty model |
| --- | --- | --- |
| **AI planning** | Mentor Projects is framed as "AI Planning & Roadmap" with hierarchy copy; the existing deterministic distribution + scheduling engines are presented as "Generated plan proposal — review before activation" with the preserved preview→execute human-in-the-loop flow | Engine labeled as a generated proposal requiring mentor activation — mentor is the final decision-maker; no claim of AI generation |
| **AI recommendations** | Plan-status chips and roadmap bars show where each project stands; derived progress states always ship with visible evidence ("Why this state?") | Labeled as system-derived states, never as AI facts |
| **AI progress monitoring** | Mentor control tower: state rollup + attention queue rebuilt automatically on every dashboard load; intern detail shows per-task overdue flags | Client-side derivation from real payloads; backend gap documented |
| **AI blocker detection** | Intern-blocker reporting (structured modal) + mentor-side Blocker Reports panel on intern detail | Real end-to-end today via the `[Blocker]` feedback convention; automatic *detection* remains a backend gap |
| **AI submission assistance** | Submissions page reserves a pre-review slot with an explicit "not available yet" note | No fake analysis rendered |
| **AI feedback** | Feedback page states plainly that AI draft is planned, not connected | No fake button |
| **AI weekly reports** | Intern dashboard + mentor intern detail consume the real Gemini-backed weekly report service; card is labeled **"AI-generated"** vs **"Prepared summary"** based on the actual `ai_status` field | Real AI, truthfully labeled, with the deterministic fallback visible |
| **Transparency principle** | Every AI-flavored surface is either (a) a real endpoint, or (b) an explicit unavailability note recorded in section E. Zero decorative AI badges, zero fake scores, no overlapping progress percentages (§44 respected) | — |

---

## E. BACKEND GAPS

Required API/database changes (frontend is ready to consume each; none faked):

1. **Blocker entity + endpoints** — dedicated `blockers` table (type, description, task link, status open/resolved, timestamps), intern `POST`, mentor `GET`/resolve. Today's `[Blocker]` feedback convention works but can't track resolution state or filter reliably.
2. **Authoritative progress/risk states** — server-side computation (overdue tasks, attendance gap, submission staleness, previous performance) exposed on dashboard/interns endpoints with evidence + reason codes. Current client-side derivation is presentation-only and per-screen.
3. **Requires-Attention queue endpoint** — server-side queue merging pending reviews, overdue work, blockers, stale interns, draft evaluations; avoids re-deriving across screens and enables notification fan-out.
4. **AI plan generator + planning status machine** — no planner endpoint or planning states (not_planned / planning / needs_review / approved / replanning) and no plan-version storage. The distribution/scheduling engines are the deterministic backbone; a true AI planner is a new backend feature.
5. **Structured Definition-of-Done storage** — acceptance-criteria fields on internships and/or projects/master_tasks (today: text appended to description; local-only on project create).
6. **Project complexity field** — Low/Medium/High (or richer) for the planner; frontend has an honest slot reserved conceptually.
7. **Task dependencies + epics/work-areas** — no dependency or grouping fields between tasks; planner inputs can't express ordering.
8. **AI submission pre-review** — no analysis endpoint for submissions; UI slot reserved.
9. **AI mentor feedback draft** — does not exist (the source prompt claimed it; audit disproved it). `mentor_feedback` router is intern→mentor. Needs a draft endpoint.
10. **Mentor daily digest** — no endpoint; weekly cadence only.
11. **Scheduler wiring** — `run_weekly_report_job` exists in `weekly_report_service` but is never invoked from `main.py`; weekly reports are only generated on explicit user action.
12. **Calculated duration** — `internships.duration` is free text; no start/end dates on internships (dates live on projects). Duration-from-dates is a backend change.
13. **Intern level / skill profile** — no intern-level or planner-consumable skill-profile field; assessments/screening data exists but isn't surfaced for planning.

---

## F. AUTOMATION DEPENDENCIES

| Automation | Consumes | Status |
| --- | --- | --- |
| `weekly_report.generated` webhook (Make.com) | The new weekly-report UI visibility on intern + mentor sides | ✅ Already emitted by the real service; now a frontend surface actually displays the reports it announces |
| Weekly report generation on schedule | `run_weekly_report_job` needs a scheduler entry (cron/APScheduler) in `main.py` | ❌ Backend/automation gap E.11 — until wired, reports generate only on demand |
| Task reminders / mentor notifications | Blocker records + risk states + attention queue | ❌ Blocked on E.1–E.3 (blocker entity, authoritative states, queue endpoint); the frontend outputs are ready to be consumed |
| Certificate.issued webhook | Unchanged | ✅ Working, untouched |
| AI screening / interview question generation | Provider Applications view (per-candidate) | ✅ Working, untouched; wizard copy now points there honestly |

---

## G. TESTING

| Check | Result |
| --- | --- |
| ESLint (`npx eslint src`) | ✅ **0 errors**, 11 warnings — all pre-existing `react-hooks/exhaustive-deps`, none introduced by this work |
| Production build (`npm run build`) | ✅ Clean (713.31 kB bundle; pre-existing chunk-size warnings only) |
| Type checking | n/a — project is plain JavaScript (JSX), no TS config |
| Frontend unit tests | None exist in the repo (0 test files detected); no test framework to run |
| Backend pytest | **Not run this session** — the suite (143/143 at baseline) deletes rows in the dev DB, and the E2E world lives there. **No backend code was changed**, so the 143/143 baseline stands untouched |
| Broken routes | ✅ None — all walkthrough navigation used existing routes; no new routes were added (section B) |
| Console errors | ✅ Clean across the full walkthrough (only benign dev-mode vite WebSocket reconnect notices) |
| API errors | ✅ One pre-existing bug found and **fixed**: `/mentor-feedback` was misrouted to the mentor session (`path.startsWith('/mentor')`), 401-ing intern blocker submissions — verified fixed end-to-end |
| Browser walkthrough — mentor | ✅ /mentor/dashboard (attention queue shows the overdue task with evidence "Due 2026-09-27 — status is still assigned"; At Risk rollup = 1; intern chip At Risk), /mentor/projects (plan chips, roadmap bars, DoD checklist, both plan banners), /mentor/tasks (real filters), /mentor/interns/71 (At Risk + evidence, Blocker Reports panel showing 1 open, Weekly Reports honest empty state, Overdue chips) |
| Browser walkthrough — intern | ✅ /intern dashboard: all 4 orchestration cards, Start-here banner, blocker modal submit → success toast → record persisted (verified via API) |
| Browser walkthrough — provider | ✅ /provider-internship-new: new step names, DoD add-criterion interaction verified (2 inputs), orphan fields gone, review step shows DoD |
| Login flows | ✅ Each role logged in via the UI (provider / mentor / intern accounts) |

---

## H. REMAINING WORK

### Frontend complete ✅
Everything in sections A–D is implemented and verified. The frontend now fully expresses the orchestration model within the existing design system: mentor workflow = **Review → Understand → Decide → Intervene → Approve**; AI/derived system handles Plan → Break down → Monitor → Detect → Recommend → Draft → Re-plan wherever the data allows.

### Backend required ❌
Gaps E.1–E.13, in suggested priority order:
1. Blocker entity + intern POST + mentor GET/resolve (upgrade the working `[Blocker]` convention; add resolution tracking).
2. Authoritative risk-state computation + attention-queue endpoint (with evidence/reason codes) to replace client-side derivation.
3. Structured DoD/acceptance-criteria fields (internships, projects, master_tasks).
4. AI plan generator + planning status machine (human-in-the-loop activation already designed in the UI).
5. AI submission pre-review endpoint; AI mentor feedback draft endpoint.
6. Project complexity, task dependencies, intern level/skill profile for the planner; calculated internship duration.

### Automation required ❌
- Wire `run_weekly_report_job` into a scheduler (cron/APScheduler) so weekly reports generate without manual triggering.
- Extend Make.com/webhook automations to consume blockers, risk states, and the attention queue once backend gaps 1–2 land (mentor notifications, task reminders, daily digest).

### AI implementation required ❌
- Plan generation (the current distribution/scheduling engines are deterministic heuristics, honestly labeled).
- Submission pre-review, mentor feedback drafting, complexity recommendation, intern-level recommendation — all currently honest "not available yet" UI states awaiting endpoints.

### Manual configuration required ❌
- Gemini API key for the weekly-report service in non-fallback environments (service already supports a deterministic fallback).
- Scheduler cadence decision (weekly report day/time) once wired.
- Gmail/`@dev.in` registration domain policy and E2E demo accounts are already configured in the dev DB (`orch.provider.orch26@gmail.com` / `orch.mentor.orch26@gmail.com` / `orch.intern.orch26@gmail.com`, password `OrchPass26!`).

**The system is not claimed complete** — the frontend is complete and honest about every dependency; the backend, automation, and AI work above remains.
