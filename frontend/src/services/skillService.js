/**
 * Skills + Evidence service.
 *
 * Backend contracts used:
 *   GET  /api/skills                          → public skill catalog
 *   GET  /api/skills/match/{internship_id}    → intern's declared vs required (matched/potential gaps)
 *   PUT  /api/interns/me/skills               → replace intern's declared profile skills
 *   GET  /api/interns/me/skills               → intern's skills with sources
 *   GET  /api/mentor/interns/{id}/detail      → mentor's unified intern view
 *   POST /api/mentor/interns/{id}/observations → mentor records a skill observation
 *   GET  /api/applications/{id}/detail        → provider's unified application view
 */

import { request } from './publicExperience';

export const SKILL_SOURCES = {
  candidate_profile: 'Self-declared',
  resume: 'From resume',
  assessment: 'From assessment',
  project: 'From project',
  mentor_observation: 'Mentor-observed',
};

export const OBSERVATION_LEVELS = [
  { id: 'emerging', label: 'Emerging' },
  { id: 'developing', label: 'Developing' },
  { id: 'proficient', label: 'Proficient' },
  { id: 'strong', label: 'Strong' },
];

export function fetchSkillCatalog() {
  return request('/skills');
}

export function fetchMySkills() {
  return request('/interns/me/skills');
}

export function updateMySkills(skills) {
  return request('/interns/me/skills', {
    method: 'PUT',
    body: JSON.stringify({ skills }),
  });
}

export function fetchSkillMatch(internshipId) {
  return request(`/skills/match/${internshipId}`);
}

export function fetchMentorInternDetail(internId) {
  return request(`/mentor/interns/${internId}/detail`);
}

export function createSkillObservation(internId, { skill, level, note, taskId }) {
  return request(`/mentor/interns/${internId}/observations`, {
    method: 'POST',
    body: JSON.stringify({ intern_id: Number(internId), skill, level, note: note || null, task_id: taskId || null }),
  });
}

export function fetchApplicationDetail(applicationId) {
  return request(`/applications/${applicationId}/detail`);
}
