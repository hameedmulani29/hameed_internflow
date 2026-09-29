# InternFlow — Page & Section Structure

## Purpose

This document defines the frontend information architecture for the internship management platform.

The product has four primary user experiences:

1. **Provider** — creates and manages internships and the complete program.
2. **Mentor** — manages assigned interns and their work.
3. **Candidate / Intern** — applies for internships and later manages the internship.
4. **Public Visitor** — accesses public information and verifies certificates.

A Candidate becomes an Intern after selection. The interface should change according to the user's lifecycle state.

---

# 1. Public / Unauthenticated Experience

## 1.1 Landing Page

Status: Done

### Header
- Logo
- How It Works
- Features
- For Providers
- For Interns
- Login
- Get Started

Status: Done

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ LOGO                  How It Works  Features  For Providers  For Interns     │
│                                                        Login   Get Started   │ 
└──────────────────────────────────────────────────────────────────────────────┘
```

### Hero
- Main product statement
- Short explanation
- Create an Internship CTA
- Explore Internships CTA

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         MAIN PRODUCT STATEMENT                               │
│                                                                              │
│                 Short explanation of InternFlow                              │
│                                                                              │
│        [ Create an Internship ]       [ Explore Internships ]                │
│                                                                              │
│                         [ Product Visual / UI ]                              │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Problem Section
- Manual resume screening
- Scattered communication
- Spreadsheet-based tracking
- Manual progress reports
- Manual certificates

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                              THE PROBLEM                                     │
│                                                                              │
│   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                   │
│   │ Resume         │ │ Scattered      │ │ Spreadsheet    │                   │
│   │ screening      │ │ communication  │ │ tracking       │                   │
│   └────────────────┘ └────────────────┘ └────────────────┘                   │
│                                                                              │
│   ┌────────────────┐ ┌────────────────┐                                      │
│   │ Manual         │ │ Manual         │                                      │
│   │ progress       │ │ certificates   │                                      │
│   └────────────────┘ └────────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Solution Section
Recruit → Screen → Select → Onboard → Manage → Evaluate → Certify

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                             THE SOLUTION                                     │
│                                                                              │
│   RECRUIT → SCREEN → SELECT → ONBOARD → MANAGE → EVALUATE → CERTIFY          │
│                                                                              │
│       ●────────●────────●────────●────────●────────●────────●                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### AI + Automation Section
- AI screening
- Automated communication
- AI reports
- Workflow automation
- Certificate generation

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         AI + AUTOMATION                                      │
│                                                                              │
│   ┌────────────────┐ ┌────────────────┐ ┌────────────────┐                   │
│   │ AI Screening   │ │ Automated      │ │ AI Reports     │                   │ 
│   │                │ │ Communication  │ │                │                   │
│   └────────────────┘ └────────────────┘ └────────────────┘                   │
│                                                                              │
│   ┌────────────────┐ ┌────────────────┐                                      │
│   │ Workflow       │ │ Certificate    │                                      │
│   │ Automation     │ │ Generation     │                                      │
│   └────────────────┘ └────────────────┘                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Feature Overview
Cards for major capabilities.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FEATURE OVERVIEW                                     │
│                                                                              │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                         │
│   │   FEATURE    │ │   FEATURE    │ │   FEATURE    │                         │
│   │     01       │ │     02       │ │     03       │                         │
│   └──────────────┘ └──────────────┘ └──────────────┘                         │
│                                                                              │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                         │
│   │   FEATURE    │ │   FEATURE    │ │   FEATURE    │                         │
│   │     04       │ │     05       │ │     06       │                         │
│   └──────────────┘ └──────────────┘ └──────────────┘                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### How It Works
Separate explanations for:
- Provider
- Mentor
- Intern

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           HOW IT WORKS                                       │
│                                                                              │
│              [ PROVIDER ]     [ MENTOR ]     [ INTERN ]                      │
│                                                                              │
│              ┌──────────┐     ┌──────────┐   ┌──────────┐                    │
│              │ Creates  │     │ Manages  │   │ Applies  │                    │
│              │ program  │     │ interns  │   │ & works  │                    │
│              └──────────┘     └──────────┘   └──────────┘                    │
│                                                                              │
│                         Simple explanation                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Footer
- Product
- Company
- Resources
- Verification
- Privacy
- Terms

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                FOOTER                                        │
│                                                                              │
│  Product             Company             Resources          Verification     │
│  ───────             ───────             ─────────          ────────────     │
│  Features            About               Help               Verify           │
│  How It Works        Contact             Documentation     Certificate       │
│                                                                              │
│  Privacy     Terms                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 2. Provider Experience

The Provider is the organization/internship-program owner. Provider pages focus on recruitment, internship configuration, candidate management, intern monitoring, evaluation, certificates, and automation.

## 2.1 Provider Dashboard

### Header
- Organization name
- Search
- Notifications
- Profile

### Welcome Section
- Greeting
- Active internship count
- Create Internship CTA

### KPI Cards
- Active Internships
- Total Applications
- Shortlisted Candidates
- Active Interns
- Completion Rate

### Application Funnel
Applications → Under Review → Shortlisted → Interview → Selected

### Active Internships
Each card:
- Internship title
- Status
- Applications
- Active interns
- Deadline
- Progress

### Pending Actions
Examples:
- Applications needing review
- Interviews today
- Pending evaluations
- Incomplete onboarding

### Recent Activity
- Candidate applied
- Candidate shortlisted
- Interview booked
- Task completed
- Report generated

### Automation Status
- Resume screening
- Email automation
- Interview reminders
- Weekly reports
- Certificate notifications

---

## 2.2 Provider — Internship List

### Header
- Page title
- Search
- Filters
- Create Internship

### Filters
- Status
- Department
- Work mode
- Duration
- Date created

### Internship Table
- Internship
- Status
- Applications
- Selected
- Active interns
- Deadline
- Actions

### Actions
- View
- Edit
- Duplicate
- Publish / Unpublish
- Archive

---

## 2.3 Provider — Create Internship

Use a multi-step wizard.

### Step 1 — Basic Information
- Internship title
- Department
- Description
- Location
- Work mode
- Duration
- Stipend

### Step 2 — Requirements
- Education
- Required skills
- Preferred skills
- Eligibility
- Experience
- Number of openings

### Step 3 — Selection Process
- Resume screening
- Assessment
- Interview
- Custom stages

### Step 4 — Internship Configuration
- Start date
- End date
- Working hours
- Mentor assignment
- Task/report configuration

### Step 5 — Review
- Full internship preview
- Save Draft
- Publish

---

## 2.4 Provider — Internship Details

### Header
- Internship title
- Status
- Edit
- Publish / Close

### Overview
- Description
- Duration
- Work mode
- Openings
- Requirements

### Application Statistics
- Total applications
- Under review
- Shortlisted
- Interviewed
- Selected
- Rejected

### Application Funnel
Visual representation of the selection pipeline.

### Candidate List
- Candidate
- Match %
- Status
- Assessment
- Interview
- Applied date
- Action

### Active Interns
- Name
- Mentor
- Progress
- Attendance
- Status

### Internship Timeline
- Created
- Published
- Applications
- Selection
- Internship start
- Completion

---

## 2.5 Provider — Applications

### Header
- Search
- Filters
- Bulk actions

### Filters
- Internship
- Application status
- Match score
- Skills
- Application date

### Candidate Table
- Candidate
- Internship
- Match score
- Status
- Applied
- Assessment
- Interview
- Actions

### Bulk Actions
- Shortlist
- Reject
- Move stage
- Send communication

---

## 2.6 Provider — Candidate Detail

### Candidate Header
- Name
- Profile photo
- Application status
- Internship
- Applied date
- Primary action

### Profile
- Education
- Skills
- Experience
- Projects
- Certifications

### Resume
- Preview
- Download

### AI Screening
- Overall Match
- Required Skills
- Preferred Skills
- Education
- Experience
- Projects

### AI Evidence
For each requirement:
- Requirement
- Evidence
- Match status

### Assessment
- Score
- Attempt status
- Summary

### Interview
- Date
- Time
- Status
- Interview notes

### Provider Notes
Private internal notes.

### Application Timeline
Applied → Screened → Shortlisted → Assessment → Interview → Selected

### Actions
- Shortlist
- Reject
- Select
- Request Assessment
- Schedule Interview

---

## 2.7 Provider — Candidate Screening

### Screening Queue
Candidates waiting for review.

### AI Analysis
- Match score
- Skills found
- Missing requirements
- Relevant projects
- Evidence

### Human Decision
- Shortlist
- Reject
- Keep Under Review

AI must be clearly labeled as **AI-assisted analysis**, not the final decision.

---

## 2.8 Provider — Interviews

### Calendar
- Day/week view
- Available slots
- Booked slots

### Interview List
- Candidate
- Internship
- Interviewer
- Date
- Time
- Status

### Actions
- Reschedule
- Cancel
- View candidate
- View AI questions

---

## 2.9 Provider — Assessments

### Assessment List
- Assessment name
- Internship
- Questions
- Attempts
- Average score
- Status

### Create Assessment
- Title
- Instructions
- Time limit
- Questions
- Passing criteria

### Question Types
- MCQ
- Short answer
- Debugging

### AI Generation
- Generate
- Regenerate
- Edit
- Approve

---

## 2.10 Provider — Active Interns

### KPI Cards
- Active interns
- On track
- Needs attention
- Completed

### Intern Table
- Intern
- Internship
- Mentor
- Progress
- Attendance
- Last activity
- Status

### Filters
- Internship
- Mentor
- Progress
- Status

---

## 2.11 Provider — Intern Detail

### Header
- Intern name
- Internship
- Mentor
- Status

### Overview
- Progress
- Attendance
- Tasks
- Weeks completed

### Tasks
- Assigned
- In progress
- Submitted
- Completed

### Attendance
- Present
- Absent
- Hours

### Reports
- Weekly reports
- AI summaries

### Mentor Feedback
- Feedback history

### GitHub Activity
Optional:
- Commits
- Pull requests
- Reviews
- Repository activity

### Evaluation
- Current evaluation status
- Final evaluation

---

## 2.12 Provider — Reports

### Overview
- Internship completion
- Application funnel
- Candidate conversion
- Intern progress
- Attendance

### Internship Report
- Applications
- Selection rate
- Completion rate
- Task completion

### AI Weekly Reports
- Report list
- Week
- Intern
- Status

### Report Detail
- Summary
- Completed work
- Pending work
- Strengths
- Improvement areas
- Recommended next steps

---

## 2.13 Provider — Certificates

### Certificate Dashboard
- Certificates issued
- Pending certificates
- Completed internships

### Certificate List
- Intern
- Certificate ID
- Internship
- Issue date
- Verification status

### Certificate Detail
- Preview
- Download
- Verification URL
- QR code

### Actions
- Generate
- View
- Share

---

## 2.14 Provider — Automation Center

Show business-level automation status instead of Make.com implementation details.

### Automation Cards
- Resume Screening — Active
- Candidate Emails — Active
- Interview Reminders — Active
- Weekly Reports — Active
- Feedback Drafts — Active
- Certificate Emails — Active

### Each Automation
- Trigger
- Last run
- Status
- Recent execution
- Error if failed

---

## 2.15 Provider — Settings

### Organization
- Company name
- Logo
- Description
- Website

### Users
- Providers
- Mentors
- Permissions

### Integrations
- Gemini
- Make.com
- Gmail/Resend
- Google Calendar
- GitHub

### Notifications
- Email preferences
- Report preferences

### Security
- Password
- Sessions
- API/webhook settings

---

# 3. Mentor Experience

The Mentor has a narrower operational scope than the Provider. Mentors manage assigned interns, tasks, submissions, feedback, reports, and evaluations.

## 3.1 Mentor Dashboard

### KPI Cards
- Assigned Interns
- Pending Reviews
- Active Tasks
- Reports Due

### My Interns
- Intern
- Internship
- Progress
- Status
- Last activity

### Pending Actions
- Task reviews
- Feedback requests
- Weekly reports
- Evaluations

### Recent Activity
- Submission
- Task completion
- Intern update
- Feedback

---

## 3.2 Mentor — My Interns

### Intern List
- Intern
- Internship
- Progress
- Attendance
- Status

### Filters
- Internship
- Progress
- Status

### Action
- View Intern

---

## 3.3 Mentor — Intern Detail

### Header
- Intern name
- Internship
- Status
- Progress

### Overview
- Progress
- Attendance
- Current week
- Tasks completed

### Tasks
- Assigned
- In progress
- Submitted
- Completed

### Submissions
- Files/links
- Submission date
- Review status

### GitHub
Optional:
- Repository
- Pull requests
- Reviews
- Activity

### Weekly Reports
- Current week
- Previous weeks

### Feedback
- Existing feedback
- Add feedback

### Evaluation
- Midpoint evaluation if used
- Final evaluation

---

## 3.4 Mentor — Task Management

### Task Form
- Title
- Description
- Intern
- Priority
- Deadline
- Resources

### Task List
- Task
- Intern
- Priority
- Deadline
- Status

### Task Detail
- Description
- Submission
- Comments
- Review

### Actions
- Approve
- Request Changes
- Mark Complete

---

## 3.5 Mentor — Feedback

### Feedback List
- Intern
- Date
- Status
- Category

### Create Feedback
Mentor enters rough notes.

### AI Draft
- Strengths
- Areas for improvement
- Next steps

### Mentor Actions
- Edit
- Approve
- Save

AI output must not automatically become final feedback.

---

## 3.6 Mentor — Weekly Reports

### Report List
- Intern
- Week
- Generated date
- Status

### Report Detail
- Summary
- Completed tasks
- Pending tasks
- Attendance
- GitHub activity
- Mentor feedback
- AI recommendations

### Actions
- Add comment
- Approve
- Share with intern

---

## 3.7 Mentor — Final Evaluation

### Intern Summary
- Internship duration
- Tasks
- Attendance
- Reports
- Feedback

### Evaluation Categories
- Technical Skills
- Problem Solving
- Communication
- Teamwork
- Reliability
- Task Completion
- Project Quality

### Final Section
- Strengths
- Areas for improvement
- Final comments
- Completion status

### AI Assistance
- Generate Summary
- Edit
- Approve

---

# 4. Candidate Experience

Before selection, the user is a Candidate. This experience focuses on discovering internships, applying, completing selection stages, and tracking the application.

## 4.1 Candidate Dashboard

### Application Summary
- Applications
- Under review
- Shortlisted
- Interviews
- Selected

### Current Applications
Each card:
- Internship
- Company
- Current stage
- Last update
- Next action

### Upcoming Actions
- Assessment
- Interview
- Document upload

### Recommended Internships
Optional.

---

## 4.2 Candidate — Explore Internships

### Search
- Keyword
- Skill
- Company

### Filters
- Work mode
- Location
- Duration
- Stipend
- Domain

### Internship Cards
- Title
- Company
- Work mode
- Duration
- Stipend
- Skills
- Deadline

### Action
- View Internship

---

## 4.3 Candidate — Internship Details

### Header
- Internship title
- Company
- Apply

### Overview
- Description
- Duration
- Work mode
- Stipend
- Start date

### Responsibilities
- Responsibilities

### Requirements
- Education
- Required skills
- Preferred skills

### Selection Process
Application → Screening → Assessment → Interview → Selection

### About Organization
- Company description
- Website

### Apply CTA

---

## 4.4 Candidate — Application

### Personal Details
- Name
- Contact
- Education

### Skills
- Skills
- Projects
- Links

### Resume
- Upload
- Replace
- Preview

### Submit
After submission show:
- Application ID
- Current status
- Next possible step

---

## 4.5 Candidate — Application Tracking

### Timeline
Applied → Under Review → AI Screening → Shortlisted → Assessment → Interview → Decision

### Current Status
Large status card.

### Next Action
Examples:
- Complete Assessment
- Select Interview Slot
- Upload Document

### Communication
Official application messages.

---

## 4.6 Candidate — Assessment

### Header
- Assessment name
- Time remaining
- Question count

### Question Area
- Question
- Input/options
- Navigation

### Progress
- Completed questions
- Remaining questions

### Submit
Confirmation before final submission.

---

## 4.7 Candidate — Interview

### Interview Information
- Date
- Time
- Interviewer
- Meeting link
- Status

### Scheduling
If not booked:
- Available slots
- Select slot
- Confirm

### Actions
- Reschedule
- Cancel where allowed

---

# 5. Intern Experience

After selection, the Candidate becomes an Intern. The intern interface focuses on performing the internship rather than recruitment.

## 5.1 Intern Dashboard

### Welcome
- Internship name
- Mentor
- Current week

### Progress
- Internship progress bar

### KPI Cards
- Tasks completed
- Tasks pending
- Attendance
- Weeks completed

### Today's Tasks
- Task
- Priority
- Deadline
- Status

### Upcoming Deadline

### Latest Mentor Feedback

### Latest Weekly Report

### Quick Actions
- View Tasks
- Check In
- Submit Work
- View Report

---

## 5.2 Intern — Tasks

### Tabs
- All
- Assigned
- In Progress
- Submitted
- Completed

### Task Cards
- Title
- Description
- Priority
- Deadline
- Status

### Task Detail
- Requirements
- Resources
- Comments
- Submission

### Submit Work
- File
- GitHub link
- Description

---

## 5.3 Intern — Attendance

### Current Status
- Not Checked In
- Checked In
- Checked Out

### Actions
- Check In
- Check Out

### Statistics
- Attendance percentage
- Days present
- Days absent
- Total hours

### History
- Calendar/table

---

## 5.4 Intern — Weekly Reports

### Report List
- Week
- Date
- Status

### Report Detail
- Summary
- Completed work
- Pending work
- Strengths
- Improvement areas
- Recommended next steps

### Feedback
Mentor comments.

AI-generated content must be visibly labeled.

---

## 5.5 Intern — Feedback

### Feedback Timeline
Each item:
- Mentor
- Date
- Strengths
- Improvements
- Next steps

Private provider notes must not be exposed.

---

## 5.6 Intern — Documents

### Categories
- Internship agreement
- Eligibility documents
- Project documents
- Completion documents

### Status
- Required
- Uploaded
- Approved
- Needs changes

### Actions
- Upload
- Replace
- View

---

## 5.7 Intern — Certificate

Before completion:

```text
Certificate Locked
Complete internship requirements to receive your certificate.
```

After completion:
- Certificate ID
- Issue date
- Internship
- Organization
- QR code

Actions:
- View
- Download
- Share
- Verify

---

# 6. Public Certificate Verification

No login is required.

## 6.1 Verification Page

### Hero
Verify an Internship Certificate

### Search
- Certificate ID

### QR
- Scan QR code

---

## 6.2 Verification Result

### Valid

```text
✓ Certificate Verified

Certificate ID
Name
Internship
Organization
Duration
Issue Date
```

### Invalid

```text
Certificate Not Found

The provided certificate ID could not be verified.
```

Do not expose unnecessary private candidate information.

---

# 7. Shared Pages

## 7.1 Login

### Sections
- Logo
- Email
- Password
- Remember me
- Login
- Forgot password
- Create account

After authentication, redirect according to role.

Status: Done

---

## 7.2 Profile

### Shared
- Name
- Email
- Photo
- Contact information

### Provider
- Organization information

### Candidate / Intern
- Education
- Skills
- Projects
- Links

### Security
- Change password
- Sessions

---

## 7.3 Notifications

### Categories
- Applications
- Interviews
- Tasks
- Reports
- Feedback
- Certificates
- System

### Notification Item
- Title
- Message
- Timestamp
- Read/unread
- Action

---

# 8. Role Visibility Matrix

| Page / Capability | Provider | Mentor | Candidate | Intern | Public |
|---|---:|---:|---:|---:|---:|
| Provider Dashboard | Yes | No | No | No | No |
| Create Internship | Yes | No | No | No | No |
| Manage Applications | Yes | No | No | No | No |
| Candidate Screening | Yes | Optional | No | No | No |
| Assessment Management | Yes | Optional | No | No | No |
| Take Assessment | No | No | Yes | No | No |
| Interview Scheduling | Yes | Yes | Yes | No | No |
| Mentor Dashboard | No | Yes | No | No | No |
| Task Management | Optional | Yes | No | Yes | No |
| Attendance | Yes | Yes | No | Yes | No |
| Weekly Reports | Yes | Yes | No | Yes | No |
| Final Evaluation | Yes | Yes | No | View | No |
| Certificate Generation | Yes | Optional | No | No | No |
| Certificate View | Yes | Optional | No | Yes | No |
| Certificate Verification | No | No | No | No | Yes |

---

# 9. Global Navigation

## Provider

```text
Dashboard
Internships
Applications
Candidates
Interviews
Interns
Reports
Certificates
Automation
Settings
```

## Mentor

```text
Dashboard
My Interns
Tasks
Submissions
Attendance
Feedback
Reports
Evaluations
Profile
```

## Candidate

```text
Dashboard
Explore
My Applications
Assessments
Interviews
Profile
Notifications
```

## Intern

```text
Dashboard
Tasks
Attendance
Reports
Feedback
Documents
Certificate
Profile
```

## Public

```text
Home
Explore Internships
Verify Certificate
About
```

---

# 10. Development Priority

## Priority 1 — Golden Path

```text
Login
Provider Dashboard
Create Internship
Internship Details
Explore Internships
Application
Provider Applications
Candidate Detail
AI Screening
Shortlisting
Assessment
Selection
Onboarding
Mentor Dashboard
Intern Dashboard
Tasks
Weekly Report
Final Evaluation
Certificate
Verification
```

## Priority 2

```text
Interview Scheduling
Attendance
Mentor Feedback
Automation Center
Provider Reports
```

## Priority 3

```text
GitHub Integration
RAG
Advanced Analytics
Advanced Settings
Recommendation Engine
```

---

# 11. Page State Rule

Every important page must support:

```text
Loading
Empty
Error
Success
```

Every async action must provide visible feedback.

---

# 12. Product Boundary

The four experiences are different views of one platform:

```text
                    INTERNFLOW
                        │
        ┌───────────────┼────────────────┐
        │               │                │
     PROVIDER         MENTOR        CANDIDATE/INTERN
        │               │                │
   Program Owner    Work Manager     Personal Journey
        │               │                │
        └───────────────┼────────────────┘
                        │
                 Shared Backend
                        │
             PostgreSQL + FastAPI
                        │
                  AI + Make.com
```

**Provider** manages the program.

**Mentor** manages the work.

**Candidate / Intern** manages their application and internship journey.

**Public Visitor** verifies outcomes such as certificates.
