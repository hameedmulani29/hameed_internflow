/**
 * Auth + public-page service layer.
 * UI components call these functions only — swap the internals for real
 * backend calls (per docs/Architecture.md) without touching components.
 * No secrets live in this file; all calls hit the public API surface.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function request(path, options = {}) {
  let role = null;
  if (options.providerRole) {
    // Explicit override for provider calls that live under /api/mentor/*
    // (e.g. assignments) — the path-based inference below would otherwise
    // route them to the mentor session.
    role = 'provider';
  } else if ((path === '/interns' || path.startsWith('/interns/')) || path.startsWith('/applications/mine')) {
    // Exact match on the interns resource only — startsWith('/interns') also
    // matched '/internships' and wrongly attached the intern session to
    // provider internship requests.
    role = 'intern';
  } else if (path === '/mentor-feedback' || path.startsWith('/mentor-feedback/')) {
    // Shared resource used by BOTH roles (intern submits, mentor receives).
    // Resolve the caller from the current location BEFORE the generic
    // startsWith('/mentor') check, which would otherwise attach the mentor
    // session to intern submissions and fail with 401.
    const callerPath = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    role = callerPath.startsWith('/mentor') && !callerPath.startsWith('/mentor-feedback') ? 'mentor' : 'intern';
  } else if (path.startsWith('/mentor')) {
    role = 'mentor';
  } else if (path === '/applications' && options.method === 'POST') {
    role = 'intern';
  } else {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    if (currentPath.startsWith('/provider')) role = 'provider';
    else if (currentPath.startsWith('/intern') || currentPath === '/mentor-feedback') role = 'intern';
    else if (currentPath.startsWith('/mentor')) role = 'mentor';
  }

  const session = getSession(role);
  const token = session?.token;

  const fetchOptions = { ...options };
  delete fetchOptions.providerRole; // internal routing hint — never sent to the server
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Expired/invalid session: clear the dead session for this role and notify
    // the app so protected pages re-render to login instead of showing an
    // un-actionable error forever. 401 is only treated as expiry when a token
    // was actually attached.
    if (response.status === 401 && token) {
      const clearRole = role || undefined;
      try { clearSession(clearRole); } catch { /* storage unavailable */ }
      try { window.dispatchEvent(new Event('internflow_session_changed')); } catch { /* non-DOM */ }
    }
    throw new Error(body.detail || 'The request could not be completed.');
  }
  return body;
}

export function getSession(preferredRole = null) {
  try {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    let targetRole = preferredRole;
    if (!targetRole) {
      if (path.startsWith('/provider')) targetRole = 'provider';
      else if (path.startsWith('/intern') || path === '/mentor-feedback') targetRole = 'intern';
      else if (path.startsWith('/mentor')) targetRole = 'mentor';
    }

    if (targetRole) {
      const roleSession = JSON.parse(localStorage.getItem(`internflow_session_${targetRole}`) || 'null');
      if (roleSession?.token && roleSession?.user?.role === targetRole) {
        return roleSession;
      }
      const primarySession = JSON.parse(localStorage.getItem('internflow_session') || 'null');
      if (primarySession?.token && primarySession?.user?.role === targetRole) {
        return primarySession;
      }
      return null;
    }

    const primarySession = JSON.parse(localStorage.getItem('internflow_session') || 'null');
    if (primarySession?.token) return primarySession;

    for (const role of ['intern', 'provider', 'mentor']) {
      const s = JSON.parse(localStorage.getItem(`internflow_session_${role}`) || 'null');
      if (s?.token) return s;
    }

    return null;
  } catch {
    return null;
  }
}

export function clearSession(role = null) {
  if (role) {
    localStorage.removeItem(`internflow_session_${role}`);
  } else {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    if (path.startsWith('/provider')) localStorage.removeItem('internflow_session_provider');
    else if (path.startsWith('/intern') || path === '/mentor-feedback') localStorage.removeItem('internflow_session_intern');
    else if (path.startsWith('/mentor')) localStorage.removeItem('internflow_session_mentor');

    const current = getSession();
    if (current?.user?.role) {
      localStorage.removeItem(`internflow_session_${current.user.role}`);
    }
    localStorage.removeItem('internflow_session');
  }
  window.dispatchEvent(new Event('internflow_session_changed'));
}

function saveSession(session) {
  if (session && session.user && session.user.role) {
    localStorage.setItem(`internflow_session_${session.user.role}`, JSON.stringify(session));
  }
  localStorage.setItem('internflow_session', JSON.stringify(session));
  window.dispatchEvent(new Event('internflow_session_changed'));
  return session;
}

/* ============ Authentication ============ */

export async function login({ email, password }) {
  try {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(result);
    return { ok: true, role: result.user.role, token: result.token, user: result.user };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function signup({ role, fullName, email, password, organization }) {
  try {
    const result = await request('/auth/register', { method: 'POST', body: JSON.stringify({ role, full_name: fullName, email, password, organization: organization || null }) });
    return { ok: true, role: result.user.role, message: 'Account created successfully.' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function fetchInternships({ query = '', status = '' } = {}) {
  return request(`/internships?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`);
}

export async function createInternship(payload) {
  return request('/internships', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateInternshipStatus(internshipId, status) {
  return request(`/internships/${internshipId}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' });
}

export async function submitApplication(payload) {
  const bodyData = typeof payload === 'object' && payload !== null
    ? payload
    : { internship_id: Number(payload) };
  return request('/applications', { method: 'POST', body: JSON.stringify(bodyData) });
}

export async function fetchApplications() {
  return request('/applications');
}

export async function updateApplicationStatus(applicationId, status) {
  return request(`/applications/${applicationId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

/* ============ Mentor workspace ============ */

export async function fetchMentorDashboard() {
  return request('/mentor/dashboard');
}

export async function fetchMentorInterns() {
  return request('/mentor/interns');
}

/** Recent attendance for an assigned intern — mentor monitoring view (backend-authorized). */
export async function fetchMentorInternAttendance(internId) {
  return request(`/attendance/intern/${internId}`);
}

export async function fetchMentorTasks() {
  return request('/mentor/tasks');
}

export async function createMentorTask(payload) {
  return request('/mentor/tasks', { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchMentorSubmissions() {
  return request('/mentor/submissions');
}

export async function reviewMentorSubmission(submissionId, decision) {
  return request(`/mentor/submissions/${submissionId}?decision=${encodeURIComponent(decision)}`, { method: 'PATCH' });
}

export async function fetchMentorFeedback() {
  return request('/mentor/feedback');
}

export async function createMentorFeedback(payload) {
  return request('/mentor/feedback', { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchMentorEvaluations() {
  return request('/mentor/evaluations');
}

export async function createMentorEvaluation(payload) {
  return request('/mentor/evaluations', { method: 'POST', body: JSON.stringify(payload) });
}

/* ============ Internship discovery ============ */

export async function searchInternships({ query = '' } = {}) {
  try {
    const result = await request(`/internships?query=${encodeURIComponent(query)}`);
    const items = result && Array.isArray(result.items) ? result.items : [];
    const results = items.map((item) => ({
      ...item,
      company: item.organization || item.company || item.department,
      workMode: item.work_mode || item.workMode || 'Remote',
      skills: item.skills || [],
      category: item.category || (item.department?.toLowerCase().includes('ai') ? 'aiml' : item.department?.toLowerCase().includes('web') ? 'web' : item.department?.toLowerCase().includes('data') ? 'data' : item.department?.toLowerCase().includes('design') ? 'design' : item.department?.toLowerCase().includes('backend') ? 'backend' : 'all'),
    }));
    return { ok: true, results };
  } catch (error) {
    // Surface real API/network failures — the public explorer shows an error
    // state instead of silently substituting a fake catalog.
    return { ok: false, error: error?.message || 'Could not load internships right now.' };
  }
}

export async function fetchCertificatePreview() {
  // Replace with: GET /api/certificates/preview
  return { ok: true, certificate: CERTIFICATE_PREVIEW };
}

export async function verifyCertificate(certificateId) {
  const id = certificateId.trim();
  try {
    const res = await request(`/verify/${encodeURIComponent(id)}`);
    if (res && res.valid) {
      return {
        ok: true,
        record: {
          recipient: res.candidate_name,
          internship: res.internship_title,
          organization: res.provider_name,
          duration: 'Verified Program',
          issueDate: res.issue_date ? res.issue_date.split('T')[0] : '',
          certificateId: res.certificate_id,
          issuer: 'InternFlow Verified System',
          skills: res.verified_skills || [],
        },
      };
    }
  } catch {
    // Unknown IDs and network errors both fall through to the honest failure
    // state below — no offline demo records may verify as real certificates.
  }
  return { ok: false, error: 'No verified record found for this certificate ID.' };
}

export const EXPLORE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'aiml', label: 'AI / ML' },
  { id: 'web', label: 'Web Development' },
  { id: 'data', label: 'Data Science' },
  { id: 'backend', label: 'Backend' },
  { id: 'design', label: 'Design' },
  { id: 'remote', label: 'Remote' }
];

export const CERTIFICATE_PREVIEW = {
  recipient: 'Aisha Patel',
  title: 'AI & Data Engineering Intern',
  organization: 'Nexus Intelligence',
  duration: '6 Months',
  issueDate: 'August 28, 2026',
  certificateId: 'CERT-2026-00142'
};


