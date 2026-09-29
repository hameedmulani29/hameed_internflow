import json
import logging
import os
import re
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv('INTERNFLOW_GEMINI_API_KEY')
GEMINI_MODEL = os.getenv('INTERNFLOW_GEMINI_MODEL', 'gemini-2.0-flash')


class ResumeScreeningResult(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    skills_match: int = Field(ge=0, le=100)
    experience_match: int = Field(ge=0, le=100)
    education_match: int = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    summary: str = Field(min_length=10, max_length=2000)
    recommendation: str = Field(min_length=5, max_length=500)


def sanitize_resume_text(value: str | None) -> str:
    if value is None:
        raise ValueError('Resume text is required for screening.')
    text = value.strip()
    if not text:
        raise ValueError('Resume text is required for screening.')
    text = re.sub(r'\s+', ' ', text)
    if len(text) < 40:
        raise ValueError('Resume text is too short to screen accurately.')
    return text


def build_screening_prompt(resume_text: str, internship_title: str, internship_description: str, department: str | None = None) -> str:
    requirements = []
    if department:
        requirements.append(f"Department: {department}")
    requirements.append(f"Internship title: {internship_title}")
    requirements.append(f"Internship description: {internship_description}")
    requirement_block = '\n'.join(requirements)
    return f"""
You are screening a candidate against an internship opportunity.

Rules:
- Evaluate only the information present in the resume and the internship brief.
- Do not invent experience or credentials.
- Prefer explicit evidence from the resume.
- Base strength and gaps on actual resume content.
- Return valid JSON only.

Internship brief:
{requirement_block}

Resume text:
{resume_text}

Return a single JSON object with the following keys:
{{
  "overall_score": integer 0-100,
  "skills_match": integer 0-100,
  "experience_match": integer 0-100,
  "education_match": integer 0-100,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3"],
  "strengths": ["brief evidence-based strength"],
  "gaps": ["brief evidence-based gap"],
  "summary": "short evidence-based summary",
  "recommendation": "Proceed / Hold / Reject based on objective fit"
}}

Ensure the response is valid JSON with no trailing commentary.
""".strip()


def _extract_json_from_text(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith('```'):
        match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', cleaned, flags=re.DOTALL | re.IGNORECASE)
        if match:
            cleaned = match.group(1)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fall back to extracting the first object-like segment if Gemini wrapped the payload.
        match = re.search(r'\{.*\}', cleaned, flags=re.DOTALL)
        if not match:
            raise ValueError('Gemini returned malformed screening JSON.')
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise ValueError('Gemini returned malformed screening JSON.') from exc


def parse_screening_response(raw_text: str) -> dict[str, Any]:
    payload = _extract_json_from_text(raw_text)
    if not isinstance(payload, dict):
        raise ValueError('Gemini returned an invalid structured response.')
    try:
        validated = ResumeScreeningResult.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f'Gemini returned invalid screening data: {exc.errors()}') from exc
    return validated.model_dump()


def call_gemini_screening(resume_text: str, internship_title: str, internship_description: str, department: str | None = None) -> dict[str, Any]:
    api_key = GEMINI_API_KEY or os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('Gemini API key is not configured. Set INTERNFLOW_GEMINI_API_KEY or GEMINI_API_KEY.')

    prompt = build_screening_prompt(resume_text, internship_title, internship_description, department)
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {
            'temperature': 0.2,
        },
    }

    try:
        response = httpx.post(url, params={'key': api_key}, json=payload, timeout=30.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.exception('Gemini resume screening request failed.')
        raise RuntimeError('Resume screening service is temporarily unavailable.') from exc

    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError('Resume screening service returned an unreadable response.') from exc

    candidates = result.get('candidates') or []
    if not candidates:
        raise RuntimeError('Gemini returned no screening candidates.')

    parts = candidates[0].get('content', {}).get('parts', [])
    text_chunks = []
    for part in parts:
        if isinstance(part, dict) and 'text' in part:
            text_chunks.append(part['text'])
    if not text_chunks:
        raise RuntimeError('Gemini returned no usable screening output.')

    return parse_screening_response(''.join(text_chunks))


def run_resume_screening(resume_text: str | None, internship_title: str, internship_description: str, department: str | None = None) -> dict[str, Any]:
    cleaned_resume = sanitize_resume_text(resume_text)
    if not internship_title or not internship_description:
        raise ValueError('Internship metadata is required for screening.')
    return call_gemini_screening(cleaned_resume, internship_title, internship_description, department)
