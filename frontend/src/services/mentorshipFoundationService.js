/**
 * Mentorship execution foundation service (Phase 1).
 *
 * Backend contracts used:
 *   POST /api/mentor/assignments                        → provider assigns mentor+intern to own internship
 *   GET  /api/mentor/assignments                        → provider's assignments (ownership-scoped server-side)
 *   GET  /api/mentor/assignments/mentors                → mentors available for assignment
 *   GET  /api/mentor/projects                           → mentor's projects (joined with internship titles)
 *   POST /api/mentor/projects                           → create project for an assigned internship
 *   GET  /api/mentor/projects/{id}                      → project + master tasks + chunks
 *   PATCH /api/mentor/projects/{id}                     → update project fields
 *   GET  /api/mentor/projects/{id}/tasks                → master tasks for a project
 *   POST /api/mentor/projects/{id}/tasks                → create master task (auto sequence)
 *   PATCH /api/mentor/projects/{id}/tasks/{taskId}      → update master task
 *   DELETE /api/mentor/projects/{id}/tasks/{taskId}     → delete master task + its chunks
 *   GET  /api/mentor/tasks/{taskId}/chunks              → chunks for a master task
 *   POST /api/mentor/tasks/{taskId}/chunks              → create chunk (auto sequence)
 *   PATCH /api/mentor/chunks/{chunkId}                  → update chunk
 *   DELETE /api/mentor/chunks/{chunkId}                 → delete chunk
 */

import { request } from './publicExperience';

// ============ Provider: mentor assignment ============

export function fetchAvailableMentors() {
  return request('/mentor/assignments/mentors', { providerRole: true });
}

export function fetchProviderAssignments() {
  return request('/mentor/assignments', { providerRole: true });
}

/**
 * Provider view of one intern assigned under the provider's own internships.
 * Backend: GET /api/mentor/assignments/mentees/{id}/detail (provider-scoped).
 */
export function fetchProviderMenteeDetail(internId) {
  return request(`/mentor/assignments/mentees/${Number(internId)}/detail`, { providerRole: true });
}

export function createMentorAssignment({ mentorId, internId, internshipId }) {
  return request('/mentor/assignments', {
    method: 'POST',
    providerRole: true,
    body: JSON.stringify({
      mentor_id: Number(mentorId),
      intern_id: Number(internId),
      internship_id: internshipId == null ? null : Number(internshipId),
    }),
  });
}

// ============ Mentor: projects ============

export function fetchMentorProjects() {
  return request('/mentor/projects');
}

export function createMentorProject(payload) {
  return request('/mentor/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchMentorProject(projectId) {
  return request(`/mentor/projects/${projectId}`);
}

export function updateMentorProject(projectId, patch) {
  return request(`/mentor/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ============ Mentor: master tasks ============

export function fetchMasterTasks(projectId) {
  return request(`/mentor/projects/${projectId}/tasks`);
}

export function createMasterTask(projectId, payload) {
  return request(`/mentor/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMasterTask(projectId, taskId, patch) {
  return request(`/mentor/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteMasterTask(projectId, taskId) {
  return request(`/mentor/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// ============ Mentor: project chunks ============

export function fetchChunks(taskId) {
  return request(`/mentor/tasks/${taskId}/chunks`);
}

export function createChunk(taskId, payload) {
  return request(`/mentor/tasks/${taskId}/chunks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateChunk(chunkId, patch) {
  return request(`/mentor/chunks/${chunkId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteChunk(chunkId) {
  return request(`/mentor/chunks/${chunkId}`, { method: 'DELETE' });
}

// ============ Mentor: distribution & scheduling engine (Phase 2) ============

export function previewDistribution(projectId, mode = 'workload_balanced') {
  return request(`/mentor/projects/${projectId}/distribute/preview`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export function executeDistribution(projectId, mode = 'workload_balanced') {
  return request(`/mentor/projects/${projectId}/distribute`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export function previewSchedule(projectId) {
  return request(`/mentor/projects/${projectId}/schedule/preview`, {
    method: 'POST',
  });
}

export function executeSchedule(projectId) {
  return request(`/mentor/projects/${projectId}/schedule`, {
    method: 'POST',
  });
}

// ============ Mentor: monitoring & activity feed (Phase 4) ============

export function fetchMentorActivity(limit = 20) {
  return request(`/mentor/activity?limit=${limit}`);
}

export function fetchProjectProgress(projectId) {
  return request(`/mentor/projects/${projectId}/progress`);
}

