import os
import secrets
from datetime import datetime, timezone
import httpx


def _get_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _dispatch_webhook(webhook_url: str | None, payload: dict, event_label: str) -> bool:
    if not webhook_url:
        return False
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(webhook_url, json=payload)
            return resp.status_code < 400
    except Exception as err:
        print(f"[Webhook Warning] Failed to dispatch {event_label} event to Make.com ({webhook_url}): {err}")
        return False


# ------------------------------------------------------------------------------
# AUTOMATION #1 — CANDIDATE APPLICATION NOTIFICATION
# ------------------------------------------------------------------------------
def emit_application_created_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
) -> dict:
    event_id = f"evt-app-{secrets.token_hex(4)}"
    payload = {
        "event": "application.created",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
        },
    }
    url = os.getenv("MAKE_APPLICATION_CREATED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "application.created")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #3 — SHORTLIST COMMUNICATION
# ------------------------------------------------------------------------------
def emit_candidate_shortlisted_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
) -> dict:
    event_id = f"evt-shortlist-{secrets.token_hex(4)}"
    payload = {
        "event": "candidate.shortlisted",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
        },
    }
    url = os.getenv("MAKE_CANDIDATE_SHORTLISTED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "candidate.shortlisted")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #4 — REJECTION COMMUNICATION
# ------------------------------------------------------------------------------
def emit_candidate_rejected_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_name: str,
    rejection_reason: str = "Selection criteria not met",
) -> dict:
    event_id = f"evt-reject-{secrets.token_hex(4)}"
    payload = {
        "event": "candidate.rejected",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
            },
            "rejection_reason": rejection_reason,
        },
    }
    url = os.getenv("MAKE_CANDIDATE_REJECTED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "candidate.rejected")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #5 — ASSESSMENT INVITATION
# ------------------------------------------------------------------------------
def emit_assessment_invited_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    assessment_id: str | int,
    assessment_title: str,
    deadline: str,
    assessment_url: str,
) -> dict:
    event_id = f"evt-assessment-{secrets.token_hex(4)}"
    payload = {
        "event": "assessment.invited",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "assessment": {
                "id": str(assessment_id),
                "title": assessment_title,
                "deadline": deadline,
                "url": assessment_url,
            },
        },
    }
    url = os.getenv("MAKE_ASSESSMENT_INVITED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "assessment.invited")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #6 — ASSESSMENT RESULT NOTIFICATION
# ------------------------------------------------------------------------------
def emit_assessment_result_event(
    assessment_id: str | int,
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    score: float | int,
    status: str,
    completed_at: str,
) -> dict:
    event_id = f"evt-assessment-result-{secrets.token_hex(4)}"
    payload = {
        "event": "assessment.completed",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "assessment_id": str(assessment_id),
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "score": score,
            "status": status,
            "completed_at": completed_at,
        },
    }
    url = os.getenv("MAKE_ASSESSMENT_RESULT_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "assessment.completed")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #7A — INTERVIEW AVAILABILITY REQUEST
# ------------------------------------------------------------------------------
def emit_interview_scheduled_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_email: str,
) -> dict:
    payload = {
        "event": "INTERVIEW_REQUIRED",
        "applicationId": application_id,
        "candidateId": candidate_id,
        "candidateName": candidate_name,
        "candidateEmail": candidate_email,
        "internshipId": internship_id,
        "internshipTitle": internship_title,
        "providerId": provider_id,
        "providerEmail": provider_email,
    }
    url = (
        os.getenv("MAKE_INTERVIEW_SCHEDULED_WEBHOOK_URL")
        or os.getenv("INTERNFLOW_MAKE_INTERVIEW_WEBHOOK_URL")
        or os.getenv("INTFLOW_MAKE_INTERVIEW_WEBHOOK_URL")
    )
    _dispatch_webhook(url, payload, "INTERVIEW_REQUIRED")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #7B — INTERVIEW SLOT BOOKED
# ------------------------------------------------------------------------------
def emit_interview_slot_booked_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    provider_id: str | int,
    provider_email: str,
    internship_id: str | int,
    internship_title: str,
    slot_start: str,
    slot_end: str,
) -> dict:
    payload = {
        "event": "INTERVIEW_SLOT_SELECTED",
        "applicationId": application_id,
        "candidateId": candidate_id,
        "candidateName": candidate_name,
        "candidateEmail": candidate_email,
        "providerId": provider_id,
        "providerEmail": provider_email,
        "internshipId": internship_id,
        "internshipTitle": internship_title,
        "slotStart": slot_start,
        "slotEnd": slot_end,
    }
    url = os.getenv("MAKE_INTERVIEW_SLOT_BOOKED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "INTERVIEW_SLOT_SELECTED")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #7C — INTERVIEW CONFIRMED
# ------------------------------------------------------------------------------
def emit_interview_confirmed_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    provider_id: str | int,
    provider_email: str,
    internship_id: str | int,
    internship_title: str,
    slot_start: str,
    slot_end: str,
    calendar_event_id: str,
    calendar_event_link: str,
    meeting_link: str,
) -> dict:
    payload = {
        "event": "INTERVIEW_CONFIRMED",
        "applicationId": application_id,
        "candidateId": candidate_id,
        "candidateName": candidate_name,
        "candidateEmail": candidate_email,
        "providerId": provider_id,
        "providerEmail": provider_email,
        "internshipId": internship_id,
        "internshipTitle": internship_title,
        "slotStart": slot_start,
        "slotEnd": slot_end,
        "calendarEventId": calendar_event_id,
        "calendarEventLink": calendar_event_link,
        "meetingLink": meeting_link,
    }
    url = os.getenv("MAKE_INTERVIEW_CONFIRMED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "INTERVIEW_CONFIRMED")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #8 — INTERVIEW REMINDER
# ------------------------------------------------------------------------------
def emit_interview_reminder_event(
    interview_id: str | int,
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    provider_id: str | int,
    provider_email: str,
    internship_id: str | int,
    internship_title: str,
    slot_start: str,
    slot_end: str,
    meeting_link: str,
) -> dict:
    event_id = f"evt-interview-reminder-{secrets.token_hex(4)}"
    payload = {
        "event": "interview.reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "interview_id": str(interview_id),
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "provider": {
                "id": str(provider_id),
                "email": provider_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "slot_start": slot_start,
            "slot_end": slot_end,
            "meeting_link": meeting_link,
        },
    }
    url = os.getenv("MAKE_INTERVIEW_REMINDER_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "interview.reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #10 — SELECTION NOTIFICATION
# ------------------------------------------------------------------------------
def emit_selection_notification_event(
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    start_date: str,
    end_date: str,
    provider_id: str | int,
    provider_name: str,
) -> dict:
    event_id = f"evt-selection-{secrets.token_hex(4)}"
    payload = {
        "event": "candidate.selected",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
                "start_date": start_date,
                "end_date": end_date,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
            },
        },
    }
    url = os.getenv("MAKE_SELECTION_NOTIFICATION_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "candidate.selected")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #11 — ONBOARDING WORKFLOW
# ------------------------------------------------------------------------------
def emit_onboarding_required_event(
    intern_id: str | int,
    application_id: str | int,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    start_date: str,
    end_date: str,
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
) -> dict:
    event_id = f"evt-onboarding-{secrets.token_hex(4)}"
    payload = {
        "event": "intern.onboarding_required",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "intern_id": str(intern_id),
            "application_id": str(application_id),
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
                "start_date": start_date,
                "end_date": end_date,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
        },
    }
    url = os.getenv("MAKE_ONBOARDING_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "intern.onboarding_required")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #12 — ONBOARDING REMINDER
# ------------------------------------------------------------------------------
def emit_onboarding_reminder_event(
    intern_id: str | int,
    candidate_name: str,
    candidate_email: str,
    internship_id: str | int,
    internship_title: str,
    onboarding_deadline: str,
    pending_items: list[str],
) -> dict:
    event_id = f"evt-onboarding-reminder-{secrets.token_hex(4)}"
    payload = {
        "event": "onboarding.reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "intern_id": str(intern_id),
            "candidate_name": candidate_name,
            "candidate_email": candidate_email,
            "internship_id": str(internship_id),
            "internship_title": internship_title,
            "onboarding_deadline": onboarding_deadline,
            "pending_items": pending_items,
        },
    }
    url = os.getenv("MAKE_ONBOARDING_REMINDER_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "onboarding.reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #13 — INTERNSHIP START WORKFLOW
# ------------------------------------------------------------------------------
def emit_internship_started_event(
    intern_id: str | int,
    internship_id: str | int,
    internship_title: str,
    candidate_id: str | int,
    candidate_name: str,
    candidate_email: str,
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    start_date: str,
) -> dict:
    event_id = f"evt-start-{secrets.token_hex(4)}"
    payload = {
        "event": "internship.started",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "intern_id": str(intern_id),
            "internship_id": str(internship_id),
            "internship_title": internship_title,
            "candidate": {
                "id": str(candidate_id),
                "name": candidate_name,
                "email": candidate_email,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "start_date": start_date,
        },
    }
    url = os.getenv("MAKE_INTERNSHIP_START_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "internship.started")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #14 — TASK DEADLINE REMINDER
# ------------------------------------------------------------------------------
def emit_task_deadline_reminder_event(
    task_id: str | int,
    intern_id: str | int,
    intern_name: str,
    intern_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    internship_id: str | int,
    internship_title: str,
    task_title: str,
    deadline: str,
    task_status: str = "in_progress",
) -> dict:
    event_id = f"evt-task-deadline-{secrets.token_hex(4)}"
    payload = {
        "event": "task.deadline_reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "task_id": str(task_id),
            "intern_id": str(intern_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "task": {
                "title": task_title,
                "deadline": deadline,
                "status": task_status,
            },
        },
    }
    url = os.getenv("MAKE_TASK_DEADLINE_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "task.deadline_reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #15 — TASK SUBMISSION NOTIFICATION
# ------------------------------------------------------------------------------
def emit_task_submitted_event(
    submission_id: str | int,
    task_id: str | int,
    intern_id: str | int,
    intern_name: str,
    intern_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    task_title: str,
    submitted_at: str,
    submission_url: str,
) -> dict:
    event_id = f"evt-task-submit-{secrets.token_hex(4)}"
    payload = {
        "event": "task.submitted",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "submission_id": str(submission_id),
            "task_id": str(task_id),
            "intern_id": str(intern_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "task": {
                "title": task_title,
            },
            "submitted_at": submitted_at,
            "submission_url": submission_url,
        },
    }
    url = os.getenv("MAKE_TASK_SUBMITTED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "task.submitted")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #16 — TASK REVIEW REMINDER
# ------------------------------------------------------------------------------
def emit_task_review_reminder_event(
    submission_id: str | int,
    task_id: str | int,
    intern_id: str | int,
    intern_name: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    task_title: str,
    submitted_at: str,
) -> dict:
    event_id = f"evt-task-review-{secrets.token_hex(4)}"
    payload = {
        "event": "task.review_reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "submission_id": str(submission_id),
            "task_id": str(task_id),
            "intern_id": str(intern_id),
            "intern_name": intern_name,
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "task_title": task_title,
            "submitted_at": submitted_at,
        },
    }
    url = os.getenv("MAKE_TASK_REVIEW_REMINDER_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "task.review_reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #17 — ATTENDANCE REMINDER
# ------------------------------------------------------------------------------
def emit_attendance_reminder_event(
    intern_id: str | int,
    internship_id: str | int,
    intern_name: str,
    intern_email: str,
    date: str,
    attendance_status: str = "missing",
) -> dict:
    event_id = f"evt-attendance-{secrets.token_hex(4)}"
    payload = {
        "event": "attendance.reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "intern_id": str(intern_id),
            "internship_id": str(internship_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "date": date,
            "attendance_status": attendance_status,
        },
    }
    url = os.getenv("MAKE_ATTENDANCE_REMINDER_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "attendance.reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #20 — WEEKLY REPORT NOTIFICATION
# ------------------------------------------------------------------------------
def emit_weekly_report_generated_event(
    report_data: dict,
    intern_id: str | int,
    intern_name: str,
    intern_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
    mentor_id: str | int | None = None,
    mentor_name: str | None = None,
    mentor_email: str | None = None,
    week_number: int = 1,
    report_url: str | None = None,
) -> dict:
    event_id = f"evt-weekly-report-{secrets.token_hex(4)}"
    report_id_str = str(report_data.get("id") or "REPORT-001")
    payload = {
        "event": "weekly_report.generated",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "report_id": report_id_str,
            "intern_id": str(intern_id),
            "internship_id": str(internship_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "mentor": {
                "id": str(mentor_id) if mentor_id else "MENTOR-001",
                "name": mentor_name or "Assigned Mentor",
                "email": mentor_email or provider_email,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
            "week_number": week_number,
            "report_url": report_url or f"/reports/{report_id_str}",
            "report": report_data,
        },
    }
    url = os.getenv("MAKE_WEEKLY_REPORT_NOTIFICATION_WEBHOOK_URL") or os.getenv("MAKE_WEEKLY_REPORT_READY_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "weekly_report.generated")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #22 — FEEDBACK NOTIFICATION
# ------------------------------------------------------------------------------
def emit_feedback_approved_event(
    feedback_id: str | int,
    intern_id: str | int,
    intern_name: str,
    intern_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    feedback_text: str,
    approved_at: str,
) -> dict:
    event_id = f"evt-feedback-{secrets.token_hex(4)}"
    payload = {
        "event": "feedback.approved",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "feedback_id": str(feedback_id),
            "intern_id": str(intern_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "feedback": {
                "text": feedback_text,
                "approved_at": approved_at,
            },
        },
    }
    url = os.getenv("MAKE_FEEDBACK_APPROVED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "feedback.approved")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #23 — EVALUATION REMINDER
# ------------------------------------------------------------------------------
def emit_evaluation_reminder_event(
    evaluation_id: str | int,
    intern_id: str | int,
    internship_id: str | int,
    intern_name: str,
    intern_email: str,
    mentor_id: str | int,
    mentor_name: str,
    mentor_email: str,
    deadline: str,
    evaluation_type: str = "final",
) -> dict:
    event_id = f"evt-evaluation-reminder-{secrets.token_hex(4)}"
    payload = {
        "event": "evaluation.reminder",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "evaluation_id": str(evaluation_id),
            "intern_id": str(intern_id),
            "internship_id": str(internship_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "mentor": {
                "id": str(mentor_id),
                "name": mentor_name,
                "email": mentor_email,
            },
            "evaluation_type": evaluation_type,
            "deadline": deadline,
        },
    }
    url = os.getenv("MAKE_EVALUATION_REMINDER_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "evaluation.reminder")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #25 — CERTIFICATE EMAIL
# ------------------------------------------------------------------------------
def emit_certificate_issued_event(
    certificate_id: str,
    intern_id: str | int,
    intern_name: str,
    intern_email: str,
    internship_id: str | int,
    internship_title: str,
    provider_id: str | int,
    provider_name: str,
    issue_date: str,
    verification_url: str,
    download_url: str,
) -> dict:
    event_id = f"evt-cert-{secrets.token_hex(4)}"
    payload = {
        "event": "certificate.issued",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "certificate_id": certificate_id,
            "intern": {
                "id": str(intern_id),
                "name": intern_name,
                "email": intern_email,
            },
            "internship": {
                "id": str(internship_id),
                "title": internship_title,
            },
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
            },
            "issue_date": issue_date,
            "verification_url": verification_url,
            "download_url": download_url,
            "certificate": {
                "certificate_id": certificate_id,
                "issue_date": issue_date,
                "verification_url": verification_url,
                "download_url": download_url,
            },
        },
    }
    url = os.getenv("MAKE_CERTIFICATE_EMAIL_WEBHOOK_URL") or os.getenv("MAKE_CERTIFICATE_ISSUED_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "certificate.issued")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #27 — INTERNSHIP COMPLETION WORKFLOW
# ------------------------------------------------------------------------------
def emit_completion_workflow_event(
    intern_id: str | int,
    internship_id: str | int,
    intern_name: str,
    intern_email: str,
    internship_title: str,
    start_date: str,
    end_date: str,
    final_evaluation_id: str | int,
    certificate_id: str,
    completion_status: str = "completed",
) -> dict:
    event_id = f"evt-completion-{secrets.token_hex(4)}"
    payload = {
        "event": "internship.completed",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "intern_id": str(intern_id),
            "internship_id": str(internship_id),
            "intern": {
                "name": intern_name,
                "email": intern_email,
            },
            "internship": {
                "title": internship_title,
                "start_date": start_date,
                "end_date": end_date,
            },
            "completion_status": completion_status,
            "final_evaluation_id": str(final_evaluation_id),
            "certificate_id": certificate_id,
        },
    }
    url = os.getenv("MAKE_COMPLETION_WORKFLOW_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "internship.completed")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #28 — PROVIDER NOTIFICATIONS
# ------------------------------------------------------------------------------
def emit_provider_notification_event(
    provider_id: str | int,
    provider_name: str,
    provider_email: str,
    notification_type: str,
    title: str,
    message: str,
    target_url: str,
) -> dict:
    event_id = f"evt-provider-notification-{secrets.token_hex(4)}"
    payload = {
        "event": "provider.notification",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "provider": {
                "id": str(provider_id),
                "name": provider_name,
                "email": provider_email,
            },
            "notification": {
                "type": notification_type,
                "title": title,
                "message": message,
                "url": target_url,
            },
        },
    }
    url = os.getenv("MAKE_PROVIDER_NOTIFICATION_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "provider.notification")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #29 — AUTOMATION FAILURE ALERT
# ------------------------------------------------------------------------------
def emit_automation_failure_event(
    automation_number: int,
    automation_name: str,
    source: str,
    error_code: str,
    error_message: str,
    retryable: bool,
    context: dict,
) -> dict:
    event_id = f"evt-failure-{secrets.token_hex(4)}"
    payload = {
        "event": "automation.failed",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "automation": {
                "number": automation_number,
                "name": automation_name,
            },
            "source": source,
            "error": {
                "code": error_code,
                "message": error_message,
                "retryable": retryable,
            },
            "context": context,
        },
    }
    url = os.getenv("MAKE_AUTOMATION_FAILURE_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "automation.failed")
    return payload


# ------------------------------------------------------------------------------
# AUTOMATION #30 — SCHEDULED CLEANUP / FOLLOW-UPS
# ------------------------------------------------------------------------------
def emit_scheduled_cleanup_event(
    job_type: str,
    run_id: str,
    actions: list[dict],
) -> dict:
    event_id = f"evt-cleanup-{secrets.token_hex(4)}"
    payload = {
        "event": "scheduled.cleanup",
        "event_id": event_id,
        "timestamp": _get_timestamp(),
        "data": {
            "job_type": job_type,
            "run_id": run_id,
            "actions": actions,
        },
    }
    url = os.getenv("MAKE_SCHEDULED_CLEANUP_WEBHOOK_URL")
    _dispatch_webhook(url, payload, "scheduled.cleanup")
    return payload
