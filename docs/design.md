# Internship Operations Platform — Design System

## 1. Design Direction

### Product personality

The product should feel:

- professional
- modern
- trustworthy
- operational
- AI-enabled without looking gimmicky

Avoid making it look like:
- a generic AI chatbot
- a college portal
- a crowded enterprise HR dashboard
- a flashy neon AI landing page

The platform should communicate:

**"Run internships with less manual work."**

---

## 2. Visual Language

Recommended direction:

- light neutral base
- deep navy/charcoal text
- blue or indigo primary action color
- green for successful/completed states
- amber for warnings
- red for destructive/error states
- subtle borders
- restrained shadows
- medium corner radius

### Suggested palette

```text
Primary:       #4F46E5
Primary Dark:  #3730A3

Background:    #F8FAFC
Surface:       #FFFFFF
Surface Alt:   #F1F5F9

Text Primary:  #0F172A
Text Secondary:#475569
Text Muted:    #64748B

Border:        #E2E8F0

Success:       #16A34A
Warning:       #D97706
Danger:        #DC2626
Info:          #0284C7
```

Dark mode can be added after the light interface is stable.

---

## 3. Typography

Recommended:
- Inter
- Geist
- Plus Jakarta Sans

Use one primary font family consistently.

### Hierarchy

```text
Page title       28–36px
Section title    20–24px
Card title       16–18px
Body             14–16px
Metadata         12–14px
```

Avoid excessive font weights.

---

## 4. Provider Navigation

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

Sidebar should remain visually stable across provider pages.

---

## 5. Provider Dashboard

Top:

```text
Good morning, Provider

[ Active Internships ]
[ Applications ]
[ Active Interns ]
[ Completion Rate ]
```

Middle:

```text
Application Funnel
------------------------------
Applications      247
Shortlisted        32
Selected            8
```

Bottom:

```text
Intern Progress
Recent Applications
Pending Actions
Automation Activity
```

---

## 6. Internship Creation

Use a multi-step form.

### Step 1
Basic information

### Step 2
Requirements

### Step 3
Selection process

### Step 4
Internship configuration

### Step 5
Review & publish

Do not put 30 fields on one screen.

---

## 7. Candidate Screen

Candidate list should support:

- search
- filters
- status
- skills
- match score
- application date

Example:

```text
Candidate     Match     Status       Action
Rahul         91%       Shortlisted  View
Aisha         87%       Review       View
Aman          72%       Review       View
```

Candidate details:

```text
Profile
Resume
Skills
Projects
AI Match Explanation
Assessment
Interview
Notes
Application Timeline
```

---

## 8. AI UI Design

AI should look integrated, not magical.

Use labels such as:

**AI Analysis**

**AI Suggested Questions**

**AI Draft**

**AI Summary**

Always provide:
- evidence
- edit action
- regenerate where appropriate
- human approval

Avoid giant animated "AI thinking" interfaces.

---

## 9. Intern Dashboard

Intern should see only what matters.

```text
Internship Progress
████████████████░░░░ 82%

Today's Tasks
Upcoming Deadline

Attendance
Weekly Report

Mentor Feedback
```

Primary navigation:

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

## 10. Mentor Dashboard

Mentor home:

```text
My Interns

Rahul      On Track
Aisha      On Track
Aman       Needs Attention
```

Intern detail:

```text
Progress
Tasks
Attendance
Submissions
GitHub
Feedback
Weekly Reports
Evaluation
```

---

## 11. Status System

Use consistent statuses.

### Application

```text
Applied
Under Review
Shortlisted
Assessment
Interview
Selected
Rejected
Withdrawn
```

### Task

```text
Assigned
In Progress
Submitted
Needs Changes
Completed
```

### Internship

```text
Draft
Published
Active
Completed
Archived
```

---

## 12. Empty States

Empty states should explain the next action.

Bad:

> No data.

Better:

> No internships yet. Create your first internship to start receiving applications.

Include a primary action.

---

## 13. Forms

Rules:
- clear labels
- inline validation
- useful error messages
- preserve user input after errors
- disable submit during submission
- show success feedback

---

## 14. Tables

Use:
- sticky headers where useful
- pagination
- filters
- search
- row actions
- status badges

Do not put 15 columns into one table.

---

## 15. Charts

Use charts only when they answer a question.

Useful charts:
- application funnel
- applications over time
- intern progress
- attendance
- task completion
- internship completion

Avoid decorative charts.

---

## 16. Automation Center

A dedicated automation page can show:

```text
Automation Center

Resume Screening             ● Active
Shortlist Notifications      ● Active
Interview Reminders          ● Active
Weekly Reports               ● Active
Mentor Feedback              ● Active
Certificate Notifications   ● Active
```

Each automation should show:
- trigger
- last execution
- status
- failure if any

This makes the Make.com integration visible in the product without exposing implementation complexity.

---

## 17. Certificate Design

Certificate should be:
- minimal
- professional
- printable
- verifiable

Include:
- company logo
- intern name
- role
- duration
- project/achievement
- certificate ID
- issue date
- QR code

---

## 18. Responsive Design

Must work on:
- desktop
- tablet
- mobile

Provider dashboards prioritize desktop.

Candidate/Intern pages should be mobile-friendly.

---

## 19. Accessibility

- keyboard navigation
- sufficient contrast
- visible focus states
- semantic HTML
- labels for form fields
- alt text
- don't rely on color alone for status

---

## 20. Motion

Use subtle motion only:
- page transitions
- dropdowns
- modal entry
- progress changes
- toast notifications

Avoid constant animated backgrounds or excessive effects in the operational dashboard.
