import pytest
from app.services.webhook_service import emit_resume_screening_requested_event


def test_resume_screening_requested_event_payload_schema(monkeypatch):
    captured_payloads = []

    def mock_dispatch(url, payload, event_label):
        captured_payloads.append((url, payload, event_label))
        return True

    monkeypatch.setenv("MAKE_RESUME_SCREENING_WEBHOOK_URL", "https://hook.eu1.make.com/mock_resume_screening_test")
    monkeypatch.setattr("app.services.webhook_service._dispatch_webhook", mock_dispatch)

    payload = emit_resume_screening_requested_event(
        application_id=42,
        candidate_name="Jane Doe",
        internship_title="AI / ML Engineer Intern",
        internship_description="Build vector search and LLM pipelines.",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        preferred_skills=["Docker", "Redis"],
        required_qualifications=["BS Computer Science"],
        preferred_qualifications=["Prior internship experience"],
        resume_file_url=None,
        extracted_resume_text="Experienced Python backend engineer with FastAPI and SQL skills.",
    )

    assert payload["application_id"] == "42"
    assert payload["candidate_name"] == "Jane Doe"
    assert payload["internship"]["title"] == "AI / ML Engineer Intern"
    assert payload["internship"]["description"] == "Build vector search and LLM pipelines."
    assert payload["internship"]["required_skills"] == ["Python", "FastAPI", "PostgreSQL"]
    assert payload["internship"]["preferred_skills"] == ["Docker", "Redis"]
    assert payload["internship"]["required_qualifications"] == ["BS Computer Science"]
    assert payload["internship"]["preferred_qualifications"] == ["Prior internship experience"]
    assert payload["resume_file_url"] is None
    assert "Python backend engineer" in payload["extracted_resume_text"]

    assert len(captured_payloads) == 1
    url, dispatched_payload, label = captured_payloads[0]
    assert url == "https://hook.eu1.make.com/mock_resume_screening_test"
    assert label == "resume.screening_requested"
    assert dispatched_payload == payload


def test_resume_screening_requested_event_unconfigured_degradation(monkeypatch):
    monkeypatch.delenv("MAKE_RESUME_SCREENING_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("MAKE_RESUME_WEBHOOK_URL", raising=False)

    payload = emit_resume_screening_requested_event(
        application_id=42,
        candidate_name="Jane Doe",
        internship_title="Backend Intern",
        internship_description="API design",
        extracted_resume_text="Backend skills",
    )

    # Event payload is constructed cleanly without throwing errors when webhook is unconfigured
    assert payload["application_id"] == "42"
