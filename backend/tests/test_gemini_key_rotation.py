import os
import threading
import pytest
from unittest.mock import MagicMock, patch

from app.services.gemini_service import (
    GeminiKeyManager,
    GeminiProvider,
    GeminiQuotaExhaustedError,
    GeminiConfigurationError,
    is_quota_error,
    mask_key,
)
from app.applications.screening_service import call_gemini_screening
from app.interviews.question_generator import generate_interview_questions_ai
from app.services.weekly_report_service import call_gemini_weekly_report


def test_is_quota_error_detection():
    # 429 status code
    assert is_quota_error(429, "") is True
    assert is_quota_error(429, "rate limited") is True

    # Quota keywords in response text
    assert is_quota_error(400, "RESOURCE_EXHAUSTED: Rate limit exceeded") is True
    assert is_quota_error(500, "quota_exceeded: Daily quota reached") is True
    assert is_quota_error(200, "User_Rate_Limit_Exceeded") is True

    # Non-quota errors
    assert is_quota_error(400, "Invalid JSON body") is False
    assert is_quota_error(401, "API key not valid") is False
    assert is_quota_error(500, "Internal Server Error") is False


def test_mask_key_security():
    assert mask_key("AIzaSy1234567890ABCDEF") == "AIza...CDEF"
    assert mask_key("short") == "***"
    assert mask_key("") == "***"


def test_single_key_backward_compatibility(monkeypatch):
    for k in list(os.environ.keys()):
        if k.startswith("INTERNFLOW_GEMINI_API_KEY_"):
            monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY", "single_key_value_12345")

    km = GeminiKeyManager()
    assert km.key_count == 1
    assert km.has_keys() is True
    
    idx, name, val = km.get_active_key()
    assert idx == 0
    assert name == "INTERNFLOW_GEMINI_API_KEY"
    assert val == "single_key_value_12345"


def test_numbered_key_discovery_and_order(monkeypatch):
    monkeypatch.delenv("INTERNFLOW_GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_3", "key_three_val")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "key_one_val")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_2", "key_two_val")

    km = GeminiKeyManager()
    assert km.key_count == 3
    
    idx, name, val = km.get_active_key()
    assert idx == 0
    assert name == "INTERNFLOW_GEMINI_API_KEY_1"
    assert val == "key_one_val"


def test_sequential_rotation_on_quota(monkeypatch):
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "key_1")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_2", "key_2")

    km = GeminiKeyManager()
    provider = GeminiProvider(key_manager=km)

    responses = [
        # Call 1 with key 1 -> 429 Quota Exceeded
        MagicMock(status_code=429, text="Rate limit exceeded"),
        # Call 2 with key 2 -> 200 Success
        MagicMock(
            status_code=200,
            text='{"candidates": [{"content": {"parts": [{"text": "Success output"}]}}]}',
            json=lambda: {"candidates": [{"content": {"parts": [{"text": "Success output"}]}}]},
        ),
    ]

    def mock_post(*args, **kwargs):
        return responses.pop(0)

    with patch("httpx.Client.post", side_effect=mock_post):
        result = provider.generate_content("Test Prompt")
        assert result["candidates"][0]["content"]["parts"][0]["text"] == "Success output"

    # Active key should now be key 2 (index 1)
    idx, name, val = km.get_active_key()
    assert idx == 1
    assert name == "INTERNFLOW_GEMINI_API_KEY_2"


def test_all_keys_exhausted(monkeypatch):
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "key_1")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_2", "key_2")

    km = GeminiKeyManager()
    provider = GeminiProvider(key_manager=km)

    mock_429 = MagicMock(status_code=429, text="Rate limit exceeded")

    with patch("httpx.Client.post", return_value=mock_429):
        with pytest.raises(GeminiQuotaExhaustedError) as exc_info:
            provider.generate_content("Test Prompt")
        assert "exhausted" in str(exc_info.value).lower()


def test_non_quota_error_does_not_rotate(monkeypatch):
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "key_1")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_2", "key_2")

    km = GeminiKeyManager()
    provider = GeminiProvider(key_manager=km)

    mock_400 = MagicMock(status_code=400, text="Bad Request: Malformed JSON")

    with patch("httpx.Client.post", return_value=mock_400):
        with pytest.raises(RuntimeError) as exc_info:
            provider.generate_content("Malformed Prompt")
        assert "400" in str(exc_info.value)

    # Key manager should STILL be on key 1 (index 0)
    idx, name, _ = km.get_active_key()
    assert idx == 0
    assert name == "INTERNFLOW_GEMINI_API_KEY_1"


def test_auth_error_distinguished_from_quota(monkeypatch):
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "invalid_key_1")

    km = GeminiKeyManager()
    provider = GeminiProvider(key_manager=km)

    mock_401 = MagicMock(status_code=401, text="API key not valid")

    with patch("httpx.Client.post", return_value=mock_401):
        with pytest.raises(GeminiConfigurationError):
            provider.generate_content("Test Prompt")


def test_concurrent_requests_safety(monkeypatch):
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_1", "key_1")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_2", "key_2")
    monkeypatch.setenv("INTERNFLOW_GEMINI_API_KEY_3", "key_3")

    km = GeminiKeyManager()
    provider = GeminiProvider(key_manager=km)

    mock_429 = MagicMock(status_code=429, text="Rate limit exceeded")
    mock_200 = MagicMock(
        status_code=200,
        text='{"candidates": [{"content": {"parts": [{"text": "OK"}]}}]}',
        json=lambda: {"candidates": [{"content": {"parts": [{"text": "OK"}]}}]},
    )

    def mock_post(*args, **kwargs):
        # Rotate when key 1 is used
        if "key_1" in kwargs.get("params", {}).get("key", ""):
            return mock_429
        return mock_200

    errors = []

    def worker():
        try:
            res = provider.generate_content("Concurrent Prompt")
            assert res["candidates"][0]["content"]["parts"][0]["text"] == "OK"
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    with patch("httpx.Client.post", side_effect=mock_post):
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert len(errors) == 0


def test_services_integration_fallbacks(monkeypatch):
    # Unconfigure all keys
    monkeypatch.delenv("INTERNFLOW_GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("INTERNFLOW_GEMINI_API_KEY_1", raising=False)
    monkeypatch.delenv("INTERNFLOW_GEMINI_API_KEY_2", raising=False)

    from app.services.gemini_service import default_key_manager
    default_key_manager.reload_keys()

    # 1. Question Generator fallback when no keys
    questions = generate_interview_questions_ai(
        internship_title="Python Engineer",
        internship_description="Build FastAPI apps",
        skills=["Python", "REST API"],
    )
    assert len(questions) >= 1
    assert "question" in questions[0]

    # 2. Weekly Report fallback when no keys
    mock_data = {
        "intern": {"name": "Test Intern"},
        "mentor": {"name": "Test Mentor"},
        "provider": {"name": "Test Provider"},
        "internship": {"title": "Engineer"},
        "metrics": {"completed_tasks_count": 2, "total_hours": 15.0, "days_present": 3, "total_tasks": 5, "pending_tasks_count": 3, "submitted_tasks_count": 0, "completed_milestones_count": 1},
        "details": {"completed_tasks": ["Task 1"], "pending_tasks": ["Task 2"], "submitted_tasks": [], "completed_milestones": [], "feedback": [], "strengths": [], "observed_skills": []},
        "reporting_period": {"week_start": "2026-09-20", "week_end": "2026-09-26"},
    }
    report = call_gemini_weekly_report(mock_data)
    assert report["ai_status"] == "fallback"
    assert "Test Intern" in report["summary"]
