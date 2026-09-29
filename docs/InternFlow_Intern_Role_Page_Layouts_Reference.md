# InternFlow — Intern Role Page Layout Reference

> **Authenticated Intern Experience**
>
> The Intern Dashboard is already completed. This document contains the remaining Intern role pages and flows that should be built as one connected experience.

---

## Important Shell Rule

**Do NOT create:**

- Sidebar
- Conventional navbar
- Top navigation
- Bottom navigation

The Intern role will eventually use **one single circular floating navigation orb**.

**Do not build the orb yet.**  
First complete all Intern pages and flows. The orb will be designed as a separate phase afterward.

---

# Overall Intern Journey

```text
DISCOVER
   ↓
APPLY
   ↓
TRACK
   ↓
ASSESS
   ↓
INTERVIEW
   ↓
DECISION
```

---

# 01 — Explore Internships

**Route:** `/intern/explore`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│        Find an Internship That's Right for You              │
│                                                             │
│   [ Search internships, skills, companies... ]             │
│                                                             │
│   Work Mode ▼   Location ▼   Duration ▼                    │
│   Stipend ▼     Domain ▼                                    │
│                                                             │
│   124 internships found                                     │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Frontend Development Intern                         │   │
│   │ Acme Labs                                           │   │
│   │ Remote · React · JavaScript · TypeScript            │   │
│   │ 3 Months · ₹15,000/month · Deadline: Oct 10        │   │
│   │                                      [View Internship]│   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ AI Research Intern                                  │   │
│   │ ...                                                 │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- Header: **Find an Internship That's Right for You**
- Search internships, skills, companies
- Filters:
  - Work mode
  - Location
  - Duration
  - Stipend
  - Domain
- Result count
- Internship result cards
- Each card:
  - Internship title
  - Company
  - Work mode
  - Skills
  - Duration
  - Stipend
  - Deadline
  - View Internship

### Functional Requirements

- Results must come from real internship data.
- Search must work.
- Filters must work.
- `View Internship` must open the correct internship.
- Include:
  - Loading state
  - Empty/no-results state
  - Error state

---

# 02 — Internship Details

**Route:** `/intern/internships/:internshipId`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Internships                                       │
│                                                             │
│ Acme Labs                                                   │
│                                                             │
│ Full Stack Development Intern                               │
│                                                             │
│ Remote        3 Months        ₹15,000/month                 │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Ready to apply?                                         │ │
│ │ Application takes ~5 min.                               │ │
│ │                                                         │ │
│ │                         [ Apply Now ]                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ About                                                       │
│ ...                                                         │
│                                                             │
│ Responsibilities                                            │
│ ...                                                         │
│                                                             │
│ Requirements                                                │
│ ...                                                         │
│                                                             │
│ Selection Process                                           │
│ ...                                                         │
│                                                             │
│ About Company                                               │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Required Sections

- Back to Internships
- Company
- Internship title
- Work mode
- Duration
- Stipend
- Apply card
- About
- Responsibilities
- Requirements
- Selection Process
- About Company

### Primary CTA

**Apply Now**

### Functional Requirements

- Display the actual internship data.
- Respect application eligibility/status.
- Do not show fake or unavailable information.
- If already applied, the CTA should reflect the actual application state.

---

# 03 — Application — Personal Details

**Route:** `/intern/applications/:applicationId/apply`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Application                              │
│                                                             │
│   ● Personal Details   ○ Skills   ○ Resume   ○ Review      │
│                                                             │
│   Step 1 — Personal Details                                 │
│                                                             │
│   Full Name                                                 │
│   [________________________________________]                │
│                                                             │
│   Email                                                     │
│   [________________________________________]                │
│                                                             │
│   Phone                                                     │
│   [________________________________________]                │
│                                                             │
│   Education                                                 │
│   [________________________________________]                │
│                                                             │
│                              [ Continue ]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Fields

- Full Name
- Email
- Phone
- Education

### Actions

- Continue
- Back where applicable

### Functional Requirements

- Validate required fields.
- Persist entered data.
- Do not lose information when moving between steps.

---

# 04 — Application — Skills + Projects + Links

**Route:** `/intern/applications/:applicationId/apply`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ● Personal   ● Skills   ○ Resume   ○ Review               │
│                                                             │
│   Step 2 — Skills + Projects + Links                        │
│                                                             │
│   Skills                                                    │
│   [ React ] [ JavaScript ] [ Python ] [+ Add Skill]         │
│                                                             │
│   Projects                                                  │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Project Title                                       │   │
│   │ Description                                         │   │
│   │ Technologies                                       │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Links                                                     │
│   Portfolio: [____________________________]                 │
│   GitHub:    [____________________________]                 │
│   LinkedIn:  [____________________________]                 │
│                                                             │
│                      [ Back ]   [ Continue ]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Sections

- Skills
- Projects
- Relevant links

### Links May Include

- Portfolio
- GitHub
- LinkedIn

Use the existing data model where available.

### Functional Requirements

- Persist all entered information.
- Validate fields where required.
- Allow the user to move backward without losing data.

---

# 05 — Application — Resume Upload

**Route:** `/intern/applications/:applicationId/apply`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ● Personal   ● Skills   ● Resume   ○ Review               │
│                                                             │
│   Step 3 — Resume Upload                                    │
│                                                             │
│        ┌─────────────────────────────────────────────┐       │
│        │                                             │       │
│        │            Upload your resume              │       │
│        │                                             │       │
│        │             [ Upload Resume ]              │       │
│        │                                             │       │
│        └─────────────────────────────────────────────┘       │
│                                                             │
│   Uploaded: Alex_Resume.pdf                                 │
│                                                             │
│                 [ Preview ]                                 │
│                                                             │
│                      [ Back ]   [ Continue ]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- Resume upload area
- Upload Resume
- Uploaded file state
- Preview
- Continue
- Back

### Functional Requirements

- Use the real backend/file-storage flow.
- Validate supported file type.
- Validate file size according to backend rules.
- Allow replacement/removal only when permitted by application state.
- Do not fake successful uploads.

---

# 06 — Application — Review Everything

**Route:** `/intern/applications/:applicationId/apply`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ● Personal   ● Skills   ● Resume   ● Review               │
│                                                             │
│   Step 4 — Review Everything                                 │
│                                                             │
│   Personal Details                              [ Edit ]     │
│   ───────────────────────────────────────────────────────    │
│   Full Name: Alex                                           │
│   Email: alex@example.com                                   │
│   Phone: +91 XXXXX XXXXX                                    │
│                                                             │
│   Skills / Projects                             [ Edit ]     │
│   ───────────────────────────────────────────────────────    │
│   React · Python · TypeScript                               │
│                                                             │
│   Resume                                        [ Edit ]     │
│   ───────────────────────────────────────────────────────    │
│   Alex_Resume.pdf                                           │
│                                                             │
│                     [ Submit Application ]                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Sections

- Personal Details
- Skills
- Projects
- Links
- Resume

### Actions

- Edit sections
- Submit Application

### Functional Requirements

- Show the actual entered application data.
- Allow editing before submission where supported.
- Submit through the real backend.
- Do not create fake submission success.

---

# 07 — Application Submitted

**Route:** `/intern/applications/:applicationId/submitted`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         ✓                                   │
│                                                             │
│                  Application Submitted                      │
│                                                             │
│                 Application ID: APP-00123                   │
│                                                             │
│                 Current status: Under Review                 │
│                                                             │
│                 Next possible step: AI Screening             │
│                                                             │
│                    [ Track Application ]                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Information

- ✓ Application Submitted
- Application ID
- Current status: Under Review
- Next possible step: AI Screening
- Track Application

### Important

Do not imply that AI Screening has started unless the backend status confirms it.

---

# 08 — Application Tracking

**Route:** `/intern/applications/:applicationId/track`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                  Application Tracking                        │
│                                                             │
│       Full Stack Development Intern · Acme Labs              │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    ASSESSMENT                       │   │
│   │                                                     │   │
│   │              Your next step is ready.               │   │
│   │                                                     │   │
│   │              [ Complete Assessment ]                │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Application Progress                                      │
│                                                             │
│   ● Applied                                                 │
│   │                                                         │
│   ● Under Review                                            │
│   │                                                         │
│   ● Screened                                                │
│   │                                                         │
│   ● Assessment                                              │
│   │                                                         │
│   ○ Interview                                               │
│   │                                                         │
│   ○ Decision                                                │
│                                                             │
│   Next Action                                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Assessment                                           │   │
│   │ 25 minutes · 15 questions · Deadline Tomorrow        │   │
│   │                                      [ Start Assessment ]│ │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Communication from Acme Labs                              │
│   ...                                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- Application Tracking header
- Internship title
- Company
- Current status card
- Application progress timeline
- Next action
- Communication from company/provider

### Reference Timeline

```text
Applied
   ↓
Under Review
   ↓
Screened
   ↓
Assessment
   ↓
Interview
   ↓
Decision
```

### Functional Requirements

The timeline and CTA must be driven by the actual application status.

---

# 09 — Assessment

**Route:** `/intern/applications/:applicationId/assessment`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│ InternFlow                  Full Stack Assessment     24:37 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Question 7 of 15                          │
│                                                             │
│   What is the purpose of ...?                                │
│                                                             │
│   ○ Option A                                                 │
│                                                             │
│   ○ Option B                                                 │
│                                                             │
│   ○ Option C                                                 │
│                                                             │
│   ○ Option D                                                 │
│                                                             │
│   Question Indicators                                       │
│   [1] [2] [3] [4] [5] [6] [7] [8] [9] ... [15]             │
│                                                             │
│   [ Previous ]                  [ Save & Next ]              │
│                                                             │
│                         [ Submit Assessment ]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- InternFlow
- Assessment title
- Real timer
- Question number
- Question content
- Multiple-choice options
- Question indicators
- Previous
- Save & Next
- Submit Assessment

### Critical Functional Rules

- Timer must be real.
- Answers must persist.
- Navigation between questions must preserve answers.
- Assessment state must remain consistent with the backend.
- Handle refresh/reconnect safely according to existing assessment rules.
- Handle timer expiry according to backend rules.
- Never fake assessment completion.
- Navigation should remain non-intrusive during assessment.

---

# 10 — Interview — Scheduled

**Route:** `/intern/applications/:applicationId/interview`

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     Interview Scheduled                     │
│                                                             │
│   Full Stack Development Intern                             │
│   Acme Labs                                                  │
│                                                             │
│   Date       September 28, 2026                             │
│   Time       11:00 AM                                       │
│   Interviewer  John Doe                                     │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Meeting Details                                     │   │
│   │                                                     │   │
│   │ Online interview                                    │   │
│   │                                                     │   │
│   │                    [ Join Meeting ]                 │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│               [ Reschedule ]    [ Cancel Interview ]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- Interview Scheduled
- Date
- Time
- Interviewer
- Meeting details
- Join Meeting
- Reschedule
- Cancel Interview

### Functional Requirements

- Show only a real meeting link when one exists.
- Rescheduling must use real availability.
- Cancellation must use real backend rules.
- Clearly show timezone where relevant.

---

# 11 — Interview — Select Slot

**Route:** `/intern/applications/:applicationId/interview/select-slot`

This page is used when an interview has not yet been booked.

### Layout

```text
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                 Select an Interview Slot                    │
│                                                             │
│   Choose a date                                             │
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│   │ Sep 28   │  │ Sep 29   │  │ Sep 30   │                │
│   │ Monday   │  │ Tuesday  │  │ Wednesday│                │
│   └──────────┘  └──────────┘  └──────────┘                │
│                                                             │
│   Available Times                                           │
│                                                             │
│   [ 10:00 AM ]  [ 11:00 AM ]  [ 2:00 PM ]  [ 4:00 PM ]    │
│                                                             │
│                          [ Select ]                          │
│                                                             │
│                    [ Confirm Slot ]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Required Elements

- Available dates
- Available time slots
- Select action
- Confirm Slot

### Critical Functional Rules

- Only show slots returned as available by the backend.
- Do not invent availability.
- Handle a slot becoming unavailable before confirmation.
- After successful confirmation, transition to the Scheduled Interview state.

---

# Shared Visual / Background Rules

The Intern role should have its **own dedicated background**.

## Visual Direction

The environment should communicate:

- Growth
- Journey
- Progress
- Milestones
- Forward movement

### Preferred Palette

- Soft blue
- Cyan
- Teal
- Mint
- Pale indigo
- Cool white

### Background Motifs

Use subtle:

- Flowing paths
- Progress lines
- Milestone points
- Forward/upward movement
- Soft ambient shapes

### Avoid

- Network-diagram aesthetics
- Gaming UI
- Heavy technical/developer visuals
- Generic SaaS backgrounds
- Excessive visual noise

---

# Translucent Card Rules

Where translucent cards are used:

| UI Type | Suggested Opacity |
|---|---:|
| Primary cards | 55–70% |
| Secondary cards | 40–55% |
| Small UI elements | 30–45% |

Use:

- Subtle borders
- Soft shadows
- Restrained blur

Avoid excessive glassmorphism.

The content must remain visually dominant over decorative background effects.

---

# Logo Rule

Whenever the InternFlow logo is required:

**Use the predefined InternFlow logo.**

Do not recreate, redraw, replace, or approximate the logo.

---

# Functional / Backend Rules

All Intern pages are authenticated pages.

## Authentication

- Intern users → Intern experience.
- Role isolation must be enforced.
- Unauthorized users must not access Intern data/routes.

## Data

Use:

- Real backend/API data
- Existing database models
- Existing application/internship/status models

Do not create:

- Fake APIs
- Hardcoded final data
- Fake success states
- Duplicate data systems
- Placeholder interactions presented as functional

---

# Application State

The reference journey is:

```text
Applied
   ↓
Under Review
   ↓
AI Screening / Screened
   ↓
Assessment
   ↓
Interview
   ↓
Decision
```

Use the **existing backend status values** if they differ from this visual reference.

The UI should never assume a stage that the backend has not reached.

---

# Loading / Empty / Error States

Every page that loads data should have appropriate:

### Loading State

Show a clear loading UI without making the page appear broken.

### Empty State

Explain what is missing and provide an appropriate next action.

### Error State

Explain the problem and provide a retry/recovery action where possible.

---

# Responsive Requirements

All pages must work across:

- Desktop
- Tablet
- Mobile

The layouts should adapt naturally rather than simply shrinking the desktop layout.

---

# Accessibility Requirements

Include:

- Keyboard navigation
- Visible focus states
- Proper labels
- Readable contrast
- Clear status messages
- Accessible interactive controls
- Appropriate semantic structure

---

# Current Navigation Strategy

During this phase, pages can be reached through:

- Direct routes
- Contextual buttons
- Back actions
- Continue actions
- Track Application
- Start Assessment
- Interview actions

### Do NOT create temporary navigation

Do not add a sidebar/navbar just because navigation is needed during development.

The final navigation system will be the **single circular floating navigation orb**.

---

# Build Order

Build the remaining Intern experience in this order:

1. Explore Internships
2. Internship Details
3. Application — Personal Details
4. Application — Skills + Projects + Links
5. Application — Resume Upload
6. Application — Review
7. Application Submitted
8. Application Tracking
9. Assessment
10. Interview — Scheduled
11. Interview — Select Slot
12. Connect all pages to real backend state/data
13. Complete loading/empty/error/permission states
14. Test the complete Intern journey end-to-end
15. **Only after all pages are complete: build the single circular navigation orb**

---

# Final Intern Experience

The finished Intern role should feel like one continuous journey:

```text
                 INTERNFLOW
                     │
                     ▼
              DISCOVER
        Explore Internships
                     │
                     ▼
                 APPLY
       Application Wizard
                     │
                     ▼
                TRACK
       Application Tracking
                     │
                     ▼
                ASSESS
             Assessment
                     │
                     ▼
              INTERVIEW
       Select Slot / Scheduled
                     │
                     ▼
               DECISION
```

The Intern experience should not feel like a collection of unrelated pages. Every page should connect naturally to the application lifecycle and the user's current stage.

---

# Future Phase — Circular Navigation Orb

After all pages above are complete, create **one single circular floating navigation object** for the Intern role.

**This is intentionally NOT part of the current implementation.**

The orb will eventually provide access to the Intern's main sections without introducing a traditional sidebar or navbar.
