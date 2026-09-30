import { request } from './publicExperience';

/* ============ AI Screening & Decisions ============ */

export async function recordProviderDecision(applicationId, decision, notes = '') {
  return request(`/applications/${applicationId}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, notes }),
  });
}

export async function getProviderDecision(applicationId) {
  return request(`/applications/${applicationId}/decision`);
}

/* ============ Assessments ============ */

export async function fetchQuestions(skillId = null) {
  const query = skillId ? `?skill_id=${skillId}` : '';
  const res = await request(`/assessments/questions${query}`);
  return res.items || [];
}

export async function createQuestion(payload) {
  return request('/assessments/questions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createAssessment(payload) {
  return request('/assessments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAssessments() {
  const res = await request('/assessments');
  return res.items || [];
}

/**
 * Provider view of assessment attempts for one of its applications.
 * Backend: GET /api/assessments/provider/intern/{application_id}/attempts
 */
export async function fetchProviderApplicationAttempts(applicationId) {
  const res = await request(`/assessments/provider/intern/${Number(applicationId)}/attempts`);
  return res.items || [];
}

export async function getAvailableAssessment(applicationId) {
  return request(`/assessments/available/${applicationId}`);
}

/**
 * Assessment detail including question count. Used for the pre-start
 * instructions screen; does not create or resume any attempt.
 */
export async function fetchAssessmentDetail(assessmentId) {
  return request(`/assessments/${Number(assessmentId)}`);
}

export async function startAssessmentAttempt(assessmentId, applicationId) {
  return request(`/assessments/${assessmentId}/start?application_id=${applicationId}`, {
    method: 'POST',
  });
}

export async function submitAssessmentAttempt(attemptId, responses) {
  return request(`/assessments/attempts/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ responses }),
  });
}

export async function fetchAssessmentAttemptResult(attemptId) {
  return request(`/assessments/attempts/${attemptId}`);
}

export async function fetchApplicationAssessmentResult(applicationId) {
  return request(`/assessments/results/application/${applicationId}`);
}

/* ============ Interviews ============ */

export async function scheduleInterview(payload) {
  return request('/interviews/schedule', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMyInterviews() {
  const res = await request('/interviews/mine');
  return res.items || [];
}

export async function fetchProviderInterviews() {
  const res = await request('/interviews/provider');
  return res.items || [];
}

export async function fetchApplicationInterview(applicationId) {
  return request(`/interviews/application/${applicationId}`);
}

export async function fetchEligibleCandidates(internshipId) {
  const res = await request(`/interviews/eligible-candidates?internship_id=${encodeURIComponent(internshipId)}`);
  return res.items || [];
}

export async function updateInterviewStatus(interviewId, status) {
  return request(`/interviews/${interviewId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function submitInterviewScorecard(interviewId, payload) {
  return request(`/interviews/${interviewId}/scorecard`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchInterviewScorecard(interviewId) {
  return request(`/interviews/${interviewId}/scorecard`);
}

/* ============ Mentorship Goals & Milestones ============ */

export async function createGoal(payload) {
  return request('/goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchAssignmentGoals(assignmentId) {
  const res = await request(`/goals/assignment/${assignmentId}`);
  return res.items || [];
}

export async function fetchMyGoals() {
  return request('/goals/me');
}

export async function addMilestone(goalId, payload) {
  return request(`/goals/${goalId}/milestones`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMilestoneStatus(milestoneId, status) {
  return request(`/goals/milestones/${milestoneId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

/* ============ Evidence & Final Evaluation ============ */

export async function recordMentorObservation(payload) {
  return request('/evidence/observations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMyEvidence() {
  const res = await request('/evidence/me');
  return res.items || [];
}

export async function fetchSkillGrowthTimeline(candidateId) {
  return request(`/evidence/growth/${candidateId}`);
}

export async function submitFinalEvaluation(payload) {
  return request('/evidence/final-evaluations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchFinalEvaluation(assignmentId) {
  return request(`/evidence/final-evaluations/assignment/${assignmentId}`);
}

/* ============ Outcomes, Skill Passport & Certificates ============ */

export async function completeInternshipOutcome(assignmentId) {
  return request(`/outcomes/complete/${assignmentId}`, { method: 'POST' });
}

export async function fetchMyOutcome() {
  return request('/outcomes/me');
}

export async function fetchMySkillPassport() {
  return request('/skill-passport/me');
}

export async function togglePassportVisibility(isPublic) {
  return request('/skill-passport/toggle-visibility', {
    method: 'POST',
    body: JSON.stringify({ is_public: isPublic }),
  });
}

export async function fetchPublicSkillPassport(passportCode) {
  return request(`/skill-passport/public/${passportCode}`);
}

export async function fetchMyCertificates() {
  const res = await request('/certificates/me');
  return res.items || [];
}

/**
 * Provider view of certificates issued for the provider's own internships.
 * Backend: GET /api/certificates/provider
 */
export async function fetchProviderCertificates() {
  const res = await request('/certificates/provider');
  return res.items || [];
}

export async function verifyCertificatePublic(certificateId) {
  return request(`/verify/${certificateId}`);
}

export async function downloadCertificateFile(certId, filename = null) {
  const { getSession } = await import('./publicExperience');
  const session = getSession('intern') || getSession('provider') || getSession();
  const token = session?.token;
  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  const fname = filename || `InternFlow_Certificate_${certId}.pdf`;

  const response = await fetch(`${API_BASE}/certificates/${encodeURIComponent(certId)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error('Could not download certificate PDF artifact.');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fname;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function viewCertificateFile(certId) {
  const { getSession } = await import('./publicExperience');
  const session = getSession('intern') || getSession('provider') || getSession();
  const token = session?.token;
  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  const response = await fetch(`${API_BASE}/certificates/${encodeURIComponent(certId)}/view`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error('Could not view certificate PDF artifact.');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/* ============ Weekly Progress Reports ============ */

export async function fetchMyWeeklyReports() {
  const res = await request('/progress/weekly-reports/me');
  return res.items || [];
}

export async function fetchAssignmentWeeklyReports(assignmentId) {
  const res = await request(`/progress/weekly-reports/assignment/${assignmentId}`);
  return res.items || [];
}

export async function fetchWeeklyReportDetail(reportId) {
  return request(`/progress/weekly-reports/${reportId}`);
}

export async function generateWeeklyReport(payload) {
  return request('/progress/weekly-report/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


