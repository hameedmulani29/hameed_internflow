/**
 * Intern Role Data & State Service
 *
 * Every function here talks to the real FastAPI backend — there is no
 * localStorage persistence, no mock catalog, and no fake fallback state.
 * When the backend is unreachable or returns an error, the promise rejects
 * and callers render proper loading / error / empty states.
 *
 * Backend contracts used:
 *   GET    /api/internships                        → live published internship catalog
 *   GET    /api/interns/me/workspace               → mentor, internship, tasks, task_summary
 *   GET    /api/interns/tasks[?status=]            → assigned task list
 *   POST   /api/interns/tasks/{id}/submit          → create task submission
 *   PATCH  /api/interns/tasks/{id}/status          → move task through allowed transitions
 *   POST   /api/attendance/check-in | check-out    → daily attendance
 *   GET    /api/attendance/today | /logs           → attendance records
 *   GET    /api/applications/mine[/{id}]           → intern's own applications + live status
 *   POST   /api/applications/{id}/screen           → provider-triggered AI screening
 */

import { request } from './publicExperience';

/* ============ Internships (live catalog) ============ */

export function formatCreatedTime(rawDate) {
  if (!rawDate) return 'Just now';
  let dateStr = String(rawDate).trim();
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    dateStr = dateStr.replace(' ', 'T') + 'Z';
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return String(rawDate);

  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}h ago`;
  }
  if (diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatBackendInternship(item) {
  if (!item) return null;
  const rawCreated = item.created_at || item.createdAt;
  return {
    id: String(item.id),
    company: item.company || item.provider_name || 'Verified Provider',
    title: item.title,
    description: item.description,
    department: item.department,
    workMode: item.work_mode || item.workMode || 'Remote',
    duration: item.duration,
    stipend: item.stipend,
    location: item.location || item.work_mode || 'Remote',
    openings: item.openings || 1,
    deadline: item.deadline || 'Open until filled',
    status: item.status,
    createdAt: rawCreated,
    formattedCreatedAt: formatCreatedTime(rawCreated),
    // Required skills come attached from the backend (internship_skills join).
    // Render only real published skills — never invent any.
    skills: Array.isArray(item.skills) ? item.skills : [],
  };
}

export async function fetchLiveInternships() {
  const res = await request('/internships');
  const items = Array.isArray(res?.items) ? res.items : [];
  return items.map(formatBackendInternship).filter(Boolean);
}

/* ============ My applications (authoritative backend state) ============ */

export async function fetchMyApplications() {
  const res = await request('/applications/mine');
  return Array.isArray(res?.items) ? res.items : [];
}

export async function fetchMyApplication(applicationId) {
  // Route URLs use an "app-<id>" presentation prefix; the backend expects the raw integer.
  const rawId = String(applicationId).replace(/^app-/, '');
  return request(`/applications/mine/${rawId}`);
}

/* ============ Intern workspace / tasks ============ */

export async function getMyWorkspace() {
  return request('/interns/me/workspace');
}

export async function getMyTasks(status = '') {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await request(`/interns/tasks${params}`);
  return result.items || [];
}

export async function submitTask(taskId, payload = {}) {
  const content = payload.content || payload.message || '';
  if (!content.trim()) {
    throw new Error('Please write a brief summary of the work you completed.');
  }

  return request(`/interns/tasks/${taskId}/submit`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      repo_url: payload.repo_url || null,
      demo_url: payload.demo_url || null,
      notes: payload.notes || null,
    }),
  });
}

export async function updateTaskStatus(taskId, status) {
  return request(`/interns/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchInternWorkspace() {
  return getMyWorkspace();
}

export async function fetchInternTasks(status = '') {
  return getMyTasks(status);
}

export async function submitInternTask(taskId, payload = {}) {
  return submitTask(taskId, payload);
}

export async function updateInternTaskStatus(taskId, status) {
  return updateTaskStatus(taskId, status);
}

/* ============ Attendance ============ */

export async function checkIn(notes = '') {
  return request('/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify({ notes: notes || null }),
  });
}

export async function checkOut(notes = '') {
  return request('/attendance/check-out', {
    method: 'POST',
    body: JSON.stringify({ notes: notes || null }),
  });
}

export async function checkInInternAttendance(notes = '') {
  return checkIn(notes);
}

export async function checkOutInternAttendance(notes = '') {
  return checkOut(notes);
}

export async function getTodayAttendance() {
  return request('/attendance/today');
}

export async function getAttendanceLogs() {
  return request('/attendance/logs');
}

export async function fetchInternAttendanceToday() {
  return getTodayAttendance();
}

/* ============ Provider: AI screening ============ */

/** Trigger AI screening for an application; resolves with the full screening result. */
export async function screenApplication(applicationId) {
  return request(`/applications/${applicationId}/screen`, { method: 'POST' });
}

/** Fetch an existing screening result for an application (provider only). */
export async function fetchScreeningResult(applicationId) {
  return request(`/applications/${applicationId}/screening`);
}

/** Provider-wide AI screening queue with real statuses and scores. */
export async function fetchScreeningQueue() {
  const res = await request('/applications/screening-queue');
  return res.items || [];
}
