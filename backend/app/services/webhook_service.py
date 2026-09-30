import os
import secrets
from datetime import datetime
import httpx

def emit_certificate_issued_event(
    certificate_id: str,
    intern_id: int,
    intern_name: str,
    intern_email: str,
    internship_id: int,
    internship_title: str,
    provider_id: int,
    provider_name: str,
    issue_date: str,
    verification_url: str,
    download_url: str,
) -> dict:
    """Emits the certificate.issued event for Make #25 automation.
    
    Returns the event payload dict regardless of whether the HTTP dispatch
    succeeded, ensuring Make.com failure never invalidates an issued certificate.
    """
    event_id = f"evt_cert_{secrets.token_hex(8)}"
    timestamp = datetime.utcnow().isoformat() + "Z"

    payload = {
        "event": "certificate.issued",
        "event_id": event_id,
        "timestamp": timestamp,
        "data": {
            "certificate_id": certificate_id,
            "intern": {
                "id": intern_id,
                "name": intern_name,
                "email": intern_email,
            },
            "internship": {
                "id": internship_id,
                "title": internship_title,
            },
            "provider": {
                "id": provider_id,
                "name": provider_name,
            },
            "certificate": {
                "certificate_id": certificate_id,
                "issue_date": issue_date,
                "verification_url": verification_url,
                "download_url": download_url,
            },
        },
    }

    webhook_url = os.getenv("MAKE_CERTIFICATE_ISSUED_WEBHOOK_URL")
    if webhook_url:
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(webhook_url, json=payload)
        except Exception as err:
            # Webhook dispatch failures are caught and logged so certificate persistence is not affected.
            print(f"[Webhook Warning] Failed to dispatch certificate.issued event to Make.com: {err}")

    return payload


def emit_weekly_report_generated_event(
    report_data: dict,
    intern_id: int,
    intern_name: str,
    intern_email: str,
    internship_id: int,
    internship_title: str,
    provider_id: int,
    provider_name: str,
    provider_email: str,
) -> dict:
    """Emits the weekly_report.generated event for Make #20 automation.
    
    Returns the event payload dict regardless of whether HTTP dispatch succeeded,
    ensuring Make.com failure never invalidates an already-persisted report.
    """
    event_id = f"evt_wk_{secrets.token_hex(8)}"
    timestamp = datetime.utcnow().isoformat() + "Z"

    payload = {
        "event": "weekly_report.generated",
        "event_id": event_id,
        "timestamp": timestamp,
        "data": {
            "report": report_data,
            "intern": {
                "id": intern_id,
                "name": intern_name,
                "email": intern_email,
            },
            "internship": {
                "id": internship_id,
                "title": internship_title,
            },
            "provider": {
                "id": provider_id,
                "name": provider_name,
                "email": provider_email,
            },
        },
    }

    webhook_url = os.getenv("MAKE_WEEKLY_REPORT_READY_WEBHOOK_URL")
    if webhook_url:
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(webhook_url, json=payload)
        except Exception as err:
            print(f"[Webhook Warning] Failed to dispatch weekly_report.generated event to Make.com: {err}")

    return payload

