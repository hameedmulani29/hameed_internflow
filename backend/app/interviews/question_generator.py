import json
import logging
import os
import re
from typing import Any
import httpx
from pydantic import BaseModel, Field

from pydantic import BaseModel, Field
from app.services.gemini_service import default_gemini_provider, default_key_manager

logger = logging.getLogger(__name__)


class InterviewQuestionItem(BaseModel):
    category: str = Field(pattern='^(technical|behavioral|problem_solving|role_fit)$')
    question: str
    target_skill: str
    expected_key_points: list[str] = Field(default_factory=list)


class AIInterviewQuestionsResult(BaseModel):
    questions: list[InterviewQuestionItem] = Field(min_length=1)


def generate_interview_questions_ai(
    internship_title: str,
    internship_description: str,
    skills: list[str],
    candidate_resume_text: str | None = None
) -> list[dict[str, Any]]:
    skills_str = ", ".join(skills) if skills else "Software Engineering"

    prompt = f"""
You are an expert technical interviewer preparing tailored interview questions for an internship role.

Role title: {internship_title}
Role description: {internship_description}
Required skills: {skills_str}
Candidate resume summary: {candidate_resume_text[:1000] if candidate_resume_text else "Not provided"}

Generate 5 high-quality, practical interview questions (technical and behavioral) to assess candidate competence.

Return a single JSON object with a key "questions" containing a list of 5 objects:
{{
  "questions": [
    {{
      "category": "technical",
      "question": "Question text here",
      "target_skill": "skill_name",
      "expected_key_points": ["point 1", "point 2"]
    }}
  ]
}}
Ensure the response is valid JSON.
""".strip()

    if not default_key_manager.has_keys():
        # Fallback generator if API key is unconfigured
        return [
            {
                'category': 'technical',
                'question': f"How would you approach building a feature using {skills[0] if skills else 'Python'} in a REST API?",
                'target_skill': skills[0] if skills else 'Python',
                'expected_key_points': ['Modular code structure', 'Error handling', 'Clean API design'],
            },
            {
                'category': 'behavioral',
                'question': 'Describe a complex technical challenge you faced in a project and how you resolved it.',
                'target_skill': 'Problem Solving',
                'expected_key_points': ['Clear problem definition', 'Step-by-step debugging', 'Documenting solution'],
            },
            {
                'category': 'problem_solving',
                'question': 'How do you test edge cases and validate input data in server endpoints?',
                'target_skill': 'Quality Assurance',
                'expected_key_points': ['Input sanitization', 'Unit tests', 'Validation schemas'],
            },
        ]

    try:
        res_data = default_gemini_provider.generate_content(prompt, generation_config={'temperature': 0.3}, timeout=25.0)
        raw_text = res_data['candidates'][0]['content']['parts'][0]['text']

        cleaned = raw_text.strip()
        if cleaned.startswith('```'):
            m = re.search(r'```(?:json)?\s*(\{.*\})\s*```', cleaned, flags=re.DOTALL)
            if m:
                cleaned = m.group(1)
        parsed = json.loads(cleaned)
        validated = AIInterviewQuestionsResult.model_validate(parsed)
        return [q.model_dump() for q in validated.questions]
    except Exception as exc:
        logger.warning(f"AI interview question generation fallback activated: {exc}")
        return [
            {
                'category': 'technical',
                'question': f"Explain how you would design a RESTful service endpoint using {skills[0] if skills else 'Python'}.",
                'target_skill': skills[0] if skills else 'Python',
                'expected_key_points': ['Resource naming', 'HTTP verbs', 'Status code usage'],
            },
            {
                'category': 'behavioral',
                'question': 'Share an example of how you prioritize tasks when working on tight deadlines.',
                'target_skill': 'Time Management',
                'expected_key_points': ['Task decomposition', 'Communication with mentor', 'Milestone tracking'],
            },
        ]
