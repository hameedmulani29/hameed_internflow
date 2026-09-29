/**
 * Mentor Feedback & Mentorship Service (intern side)
 *
 * All functions talk to the real backend. There are no localStorage stores,
 * no demo constants, and no silent fallbacks: when a request fails, the
 * promise rejects and the page renders a proper error state.
 *
 * Backend contracts used:
 *   GET  /api/mentor-feedback/context   → intern's mentor + internship context
 *   POST /api/mentor-feedback           → intern → mentor feedback (intern's own mentor resolved server-side)
 *   GET  /api/mentor-feedback           → mentor: feedback addressed to them
 *   GET  /api/interns/me/feedback       → mentor → intern feedback about the authenticated intern
 */

import { request } from './publicExperience';

export const FEEDBACK_TYPES = [
  { id: 'general', label: 'General Experience' },
  { id: 'session', label: 'Mentorship Session' },
  { id: 'guidance', label: 'Career Guidance' },
  { id: 'communication', label: 'Communication' },
  { id: 'technical_guidance', label: 'Technical Guidance' },
  { id: 'other', label: 'Other' },
];

/** GET /api/mentor-feedback/context — intern's assigned mentor + internship. */
export function fetchFeedbackContext() {
  return request('/mentor-feedback/context');
}

/** POST /api/mentor-feedback — creates the feedback record for the intern's mentor. */
export function submitMentorFeedback({ feedbackType, rating, message }) {
  return request('/mentor-feedback', {
    method: 'POST',
    body: JSON.stringify({ feedback_type: feedbackType, rating: rating || null, message }),
  });
}

/** GET /api/mentor-feedback — feedback addressed to the authenticated mentor. */
export function fetchReceivedFeedback() {
  return request('/mentor-feedback');
}

/** GET /api/interns/me/feedback — mentor → intern feedback about the authenticated intern. */
export function fetchMyMentorFeedback() {
  return request('/interns/me/feedback');
}

/** GET /api/interns/me/feedback/unread-count — unread feedback count for authenticated intern. */
export function fetchUnreadFeedbackCount() {
  return request('/interns/me/feedback/unread-count');
}

/** GET /api/interns/me/feedback/unread — unread feedback entries for authenticated intern. */
export function fetchUnreadFeedback() {
  return request('/interns/me/feedback/unread');
}

/** PATCH /api/interns/me/feedback/{id}/read — marks a feedback entry as read. */
export function markFeedbackAsRead(feedbackId) {
  return request(`/interns/me/feedback/${feedbackId}/read`, {
    method: 'PATCH',
  });
}
