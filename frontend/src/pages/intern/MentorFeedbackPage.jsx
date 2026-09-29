import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  FileCheck2,
  GitPullRequest,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  FEEDBACK_TYPES,
  fetchFeedbackContext,
  submitMentorFeedback,
  markFeedbackAsRead,
} from '../../services/mentorFeedbackService';
import {
  fetchInternWorkspace,
  getAttendanceLogs,
  submitInternTask,
} from '../../services/internService';
import '../../styles/MentorFeedbackPage.css';

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0h 0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Mentor workspace for the intern: task deliverable submissions, attendance
 * history, and mentor feedback. Every section is backed by the real API —
 * there is no demo data and no localStorage persistence.
 */
export default function MentorFeedbackPage() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#tasks') return 'tasks';
      if (hash === '#standup') return 'standup';
      if (hash === '#reviews' || window.location.search.includes('tab=reviews')) return 'reviews';
    }
    return 'reviews';
  }); // 'tasks' | 'standup' | 'reviews'

  const [context, setContext] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [reviews, setReviews] = useState([]);
  // Review Filter ('all' | 'unread' | 'read')
  const [reviewFilter, setReviewFilter] = useState('all');

  const handleMarkReviewRead = async (reviewId) => {
    // Optimistically mark as read in local state
    setReviews((prev) =>
      prev.map((item) =>
        String(item.id) === String(reviewId) ? { ...item, is_read: true, read_at: new Date().toISOString() } : item
      )
    );
    try {
      await markFeedbackAsRead(reviewId);
    } catch (err) {
      console.error('Could not sync read status with server:', err);
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Deliverable submission form state (fields the backend actually accepts)
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [subSummary, setSubSummary] = useState('');
  const [subRepoUrl, setSubRepoUrl] = useState('');
  const [subDemoUrl, setSubDemoUrl] = useState('');
  const [subNotes, setSubNotes] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskSubError, setTaskSubError] = useState('');
  const [taskSubSuccess, setTaskSubSuccess] = useState(false);

  // Intern → mentor feedback form state (real POST /api/mentor-feedback)
  const [feedbackType, setFeedbackType] = useState('technical_guidance');
  const [rating, setRating] = useState(5);
  const [fbMessage, setFbMessage] = useState('');
  const [isSubmittingFb, setIsSubmittingFb] = useState(false);
  const [fbError, setFbError] = useState('');
  const [fbSuccess, setFbSuccess] = useState(null);

  const loadData = () => {
    setIsLoading(true);
    setLoadError('');

    Promise.all([
      fetchFeedbackContext().catch(() => null), // context enhances the header; workspace is the real source
      fetchInternWorkspace(),
      getAttendanceLogs().catch(() => ({ items: [] })),
    ])
      .then(([contextData, workspaceData, attendanceData]) => {
        setContext(contextData);
        setWorkspace(workspaceData);
        setAttendance(attendanceData?.items || []);
        setIsLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message || 'Could not load your mentorship workspace.');
        setIsLoading(false);
      });

    // Reviews load independently so a failure there doesn't block the page.
    import('../../services/mentorFeedbackService').then(({ fetchMyMentorFeedback }) =>
      fetchMyMentorFeedback()
        .then((data) => setReviews(data?.items || []))
        .catch(() => setReviews([])),
    );
  };

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, []);

  const tasks = workspace?.tasks || [];
  const submittableTasks = tasks.filter((task) => !task.submission);

  const loadWorkspaceRefresh = () => {
    fetchInternWorkspace()
      .then((data) => setWorkspace(data))
      .catch(() => {});
  };

  // Deliverable submission → POST /api/interns/tasks/{id}/submit
  const handleTaskSubmit = (e) => {
    e.preventDefault();
    if (!selectedTaskId || !subSummary.trim() || isSubmittingTask) return;

    setIsSubmittingTask(true);
    setTaskSubError('');
    submitInternTask(Number(selectedTaskId), {
      content: subSummary,
      repo_url: subRepoUrl,
      demo_url: subDemoUrl,
      notes: subNotes,
    })
      .then(() => {
        setTaskSubSuccess(true);
        setSubSummary('');
        setSubRepoUrl('');
        setSubDemoUrl('');
        setSubNotes('');
        setSelectedTaskId('');
        loadWorkspaceRefresh();
        setTimeout(() => setTaskSubSuccess(false), 4000);
      })
      .catch((err) => {
        setTaskSubError(err.message || 'Task submission failed. Please try again.');
      })
      .finally(() => setIsSubmittingTask(false));
  };

  // Intern → mentor feedback → POST /api/mentor-feedback
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (fbMessage.trim().length < 20 || isSubmittingFb) return;

    setIsSubmittingFb(true);
    setFbError('');
    try {
      const result = await submitMentorFeedback({ feedbackType, rating, message: fbMessage });
      setFbSuccess(result);
      setFbMessage('');
      setTimeout(() => setFbSuccess(null), 5000);
    } catch (err) {
      setFbError(err.message || 'Feedback could not be submitted. Please try again.');
    } finally {
      setIsSubmittingFb(false);
    }
  };

  if (isLoading) {
    return (
      <div className="intern-page-container mfb-page">
        <section className="glass-card mfb-state-card" role="status">
          <span className="mfb-spinner" />
          <p>Loading mentorship workspace...</p>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="intern-page-container mfb-page">
        <section className="glass-card mfb-state-card mfb-state-error" role="alert">
          <AlertCircle size={32} />
          <h2>Could not load your mentorship workspace</h2>
          <p>{loadError}</p>
          <button type="button" className="btn btn-primary glass-btn-primary" onClick={loadData}>
            Try Again
          </button>
        </section>
      </div>
    );
  }

  const workspaceMentor = workspace?.mentor || context?.mentor || null;
  const mentor = workspaceMentor
    ? {
        name: workspaceMentor.name,
        email: workspaceMentor.email || context?.mentor?.email || '',
        department: workspace?.internship?.department || context?.internship?.department || 'Software Engineering',
      }
    : null;
  const internshipTitle = workspace?.internship?.title || context?.internship?.title || null;

  return (
    <div className="intern-page-container mfb-page">
      {/* Hero Welcome & Mentor Header */}
      <section className="intern-glass-hero animate-fade-in mfb-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <UserCheck size={14} />
            <span>Mentor Workspace</span>
          </div>
          <h1 className="hero-title">
            Mentor Guidance & <span className="highlight-text">Task Submissions</span>
          </h1>
          <p className="hero-subtitle">
            Submit deliverables to your mentor, review your logged hours, and read the feedback your mentor has shared with you.
          </p>
        </div>
      </section>

      {/* Assigned Mentor Info Card */}
      <section className="glass-card mfb-mentor-card animate-fade-in" aria-label="Assigned mentor profile">
        <div className="mfb-mentor-row">
          <div className="mfb-mentor-avatar">
            <UserCheck size={24} />
          </div>
          {mentor ? (
            <div className="mfb-mentor-info">
              <span className="mfb-mentor-label">Assigned Program Mentor</span>
              <div className="mfb-mentor-title-group">
                <strong>{mentor.name}</strong>
                {internshipTitle && <span className="badge badge-primary">{internshipTitle}</span>}
              </div>
              <p className="mfb-mentor-meta">
                <span><Briefcase size={13} /> {mentor.department}</span>
                {mentor.email && <span>{mentor.email}</span>}
              </p>
            </div>
          ) : (
            <div className="mfb-mentor-info">
              <span className="mfb-mentor-label">Assigned Program Mentor</span>
              <div className="mfb-mentor-title-group">
                <strong>No mentor assigned yet</strong>
              </div>
              <p className="mfb-mentor-meta">
                <span>Once your internship starts and a mentor is assigned, their details and your tasks will appear here.</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Main Tab Navigation Header */}
      <div className="mfb-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tasks'}
          className={`mfb-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <FileCheck2 size={16} />
          <span>Task Deliverables</span>
          <span className="tab-badge">{tasks.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'standup'}
          className={`mfb-tab-btn ${activeTab === 'standup' ? 'active' : ''}`}
          onClick={() => setActiveTab('standup')}
        >
          <CalendarCheck size={16} />
          <span>Work Hours</span>
          <span className="tab-badge">{attendance.length}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reviews'}
          className={`mfb-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          <ShieldCheck size={16} />
          <span>Mentor Reviews</span>
          <span className="tab-badge" style={reviews.some((r) => !r.is_read) ? { background: '#ef4444', color: '#fff' } : {}}>
            {reviews.length} {reviews.some((r) => !r.is_read) ? `(${reviews.filter((r) => !r.is_read).length} new)` : ''}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: TASK DELIVERABLE SUBMISSIONS (real /api/interns/tasks endpoints) */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <div className="mfb-tab-content animate-fade-in">
          {!mentor ? (
            <div className="glass-card mfb-state-card">
              <UserCheck size={32} />
              <h3>No mentor assigned yet</h3>
              <p>Tasks assigned by your mentor will appear here once your internship begins.</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="glass-card mfb-state-card">
              <FileCheck2 size={32} />
              <h3>No tasks assigned yet</h3>
              <p>{mentor.name} has not assigned any deliverables yet. When they do, each task will appear here with its requirements.</p>
            </div>
          ) : (
            <>
              {/* Active Assigned Mentor Tasks Selector */}
              <div className="glass-card mfb-card-section">
                <div className="section-title-row">
                  <div>
                    <h3>Assigned Tasks from Mentor</h3>
                    <p>Tasks assigned to you that require deliverable submissions</p>
                  </div>
                  <span className="badge badge-subtle">{submittableTasks.length} awaiting submission</span>
                </div>

                <div className="mfb-assigned-tasks-grid">
                  {tasks.map((task) => {
                    const isSubmitted = Boolean(task.submission);
                    return (
                      <div
                        key={task.id}
                        className={`mfb-task-selector-card ${Number(selectedTaskId) === task.id ? 'selected' : ''} ${isSubmitted ? 'disabled' : ''}`}
                        onClick={() => { if (!isSubmitted) setSelectedTaskId(String(task.id)); }}
                        role="button"
                        tabIndex={isSubmitted ? -1 : 0}
                        onKeyDown={(e) => { if (!isSubmitted && (e.key === 'Enter' || e.key === ' ')) setSelectedTaskId(String(task.id)); }}
                        aria-disabled={isSubmitted}
                      >
                        <div className="task-card-top">
                          <span className={`priority-pill priority-${task.priority}`}>{task.priority} Priority</span>
                          {task.due_date && <span className="due-date"><Clock size={12} /> Due {formatDate(task.due_date)}</span>}
                        </div>
                        <h4 className="task-title">{task.title}</h4>
                        <p className="task-desc">{task.description}</p>
                        <div className="task-card-bottom">
                          <span className={`status-pill status-${task.status}`}>{task.status.replace('_', ' ')}</span>
                          {isSubmitted ? (
                            <span className="badge badge-success-subtle">
                              <CheckCircle2 size={12} /> Submitted {task.submission.submitted_at ? formatDate(task.submission.submitted_at) : ''}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-xs btn-subtle"
                              onClick={(e) => { e.stopPropagation(); setSelectedTaskId(String(task.id)); }}
                            >
                              Select to Submit
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Deliverable Submission Form */}
              {submittableTasks.length > 0 ? (
                <form className="glass-card mfb-form" onSubmit={handleTaskSubmit}>
                  <div className="form-header-row">
                    <div>
                      <h3>Submit Deliverable to Mentor</h3>
                      <p>Share your work with repository links and implementation notes</p>
                    </div>
                    {taskSubSuccess && (
                      <span className="badge badge-success animate-fade-in">
                        <CheckCircle2 size={14} /> Submission Sent to Mentor
                      </span>
                    )}
                  </div>

                  <div className="mfb-field-grid">
                    <div className="mfb-field full-width">
                      <label htmlFor="task-select">Selected Task <span className="req">*</span></label>
                      <select
                        id="task-select"
                        className="mfb-input"
                        value={selectedTaskId}
                        onChange={(e) => setSelectedTaskId(e.target.value)}
                        required
                      >
                        <option value="" disabled>Choose a task…</option>
                        {submittableTasks.map((task) => (
                          <option key={task.id} value={String(task.id)}>
                            [{task.priority.toUpperCase()}] {task.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mfb-field full-width">
                      <label htmlFor="sub-summary">Summary of Completed Work <span className="req">*</span></label>
                      <input
                        id="sub-summary"
                        type="text"
                        className="mfb-input"
                        placeholder="e.g. Completed the pytest smoke suite with full happy-path coverage"
                        value={subSummary}
                        onChange={(e) => setSubSummary(e.target.value)}
                        required
                        minLength={10}
                      />
                    </div>

                    <div className="mfb-field">
                      <label htmlFor="sub-repo">GitHub / PR URL</label>
                      <div className="input-icon-wrapper">
                        <GitPullRequest size={16} className="input-icon" />
                        <input
                          id="sub-repo"
                          type="url"
                          className="mfb-input icon-padded"
                          placeholder="https://github.com/org/repo/pull/12"
                          value={subRepoUrl}
                          onChange={(e) => setSubRepoUrl(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="mfb-field">
                      <label htmlFor="sub-demo">Live Demo / Deliverable URL</label>
                      <div className="input-icon-wrapper">
                        <ExternalLink size={16} className="input-icon" />
                        <input
                          id="sub-demo"
                          type="url"
                          className="mfb-input icon-padded"
                          placeholder="https://staging-demo.com"
                          value={subDemoUrl}
                          onChange={(e) => setSubDemoUrl(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="mfb-field full-width">
                      <label htmlFor="sub-notes">Implementation Notes & Context</label>
                      <textarea
                        id="sub-notes"
                        rows={4}
                        className="mfb-textarea"
                        placeholder="Explain architectural decisions, API payloads, tests, or documentation included in this deliverable..."
                        value={subNotes}
                        onChange={(e) => setSubNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  {taskSubError && (
                    <p className="mfb-form-error" role="alert">
                      <AlertCircle size={14} /> {taskSubError}
                    </p>
                  )}

                  <div className="form-action-row">
                    <button
                      type="submit"
                      className="btn btn-primary glass-btn-primary"
                      disabled={isSubmittingTask || !selectedTaskId || !subSummary.trim()}
                    >
                      <Send size={16} />
                      <span>{isSubmittingTask ? 'Submitting Deliverable...' : 'Submit Deliverable to Mentor'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="glass-card mfb-state-card">
                  <CheckCircle2 size={32} />
                  <h3>All deliverables submitted</h3>
                  <p>Every assigned task has a submission. {mentor.name} will review them and assign the next deliverable.</p>
                </div>
              )}

              {/* Past Submissions (from live task data) */}
              {tasks.some((task) => task.submission) && (
                <div className="glass-card mfb-card-section">
                  <div className="section-title-row">
                    <h3>Submission History & Mentor Review Status</h3>
                    <span className="badge badge-outline">{tasks.filter((t) => t.submission).length} Submitted</span>
                  </div>

                  <div className="mfb-submissions-list">
                    {tasks.filter((task) => task.submission).map((task) => (
                      <div key={task.id} className="mfb-submission-item">
                        <div className="sub-icon">
                          <Code2 size={20} />
                        </div>
                        <div className="sub-details">
                          <div className="sub-header-row">
                            <h4>{task.title}</h4>
                            <span className={`status-pill status-${task.submission.status}`}>
                              {task.submission.status === 'pending' ? 'Awaiting mentor review' : task.submission.status}
                            </span>
                          </div>
                          <p className="sub-summary">{task.submission.content}</p>
                          <div className="sub-meta-row">
                            <span className="sub-meta-item"><Clock size={12} /> Submitted {task.submission.submitted_at ? formatDate(task.submission.submitted_at) : ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WORK HOURS (read-only view of real attendance records) */}
      {/* ========================================================================= */}
      {activeTab === 'standup' && (
        <div className="mfb-tab-content animate-fade-in">
          <div className="glass-card mfb-card-section">
            <div className="section-title-row">
              <div>
                <h3>Logged Work Hours</h3>
                <p>Your attendance records, exactly as stored by the backend</p>
              </div>
              <span className="badge badge-outline">{attendance.length} records</span>
            </div>

            {attendance.length === 0 ? (
              <div className="mfb-state-card" style={{ background: 'transparent', boxShadow: 'none' }}>
                <CalendarCheck size={32} />
                <h3>No attendance records yet</h3>
                <p>Check in from your dashboard to start tracking daily work hours.</p>
                <a className="btn btn-outline btn-sm" href="/intern/dashboard">Open Dashboard</a>
              </div>
            ) : (
              <div className="mfb-daily-list">
                {attendance.slice(0, 14).map((entry) => (
                  <div key={entry.id} className="mfb-daily-card">
                    <div className="daily-card-header">
                      <span className="daily-date"><CalendarCheck size={14} /> {entry.checked_in_at ? formatDate(entry.checked_in_at) : '—'}</span>
                      <span className={`badge ${entry.status === 'checked_in' ? 'badge-primary' : 'badge-success'}`}>
                        {entry.status === 'checked_in' ? 'Currently working' : 'Checked out'}
                      </span>
                    </div>
                    <p className="daily-meta">
                      <span><Clock size={13} /> In: {entry.checked_in_at ? new Date(entry.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                      <span><Clock size={13} /> Out: {entry.checked_out_at ? new Date(entry.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                      <span><strong>{formatMinutes(entry.work_minutes)}</strong> logged</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MENTOR REVIEWS (real GET /api/interns/me/feedback) */}
      {/* ========================================================================= */}
      {activeTab === 'reviews' && (
        <div className="mfb-tab-content animate-fade-in">
          {/* Sub-section A: Submit Feedback to Mentor */}
          <form className="glass-card mfb-form" onSubmit={handleFeedbackSubmit}>
            <div className="form-header-row">
              <div>
                <h3>Share Mentorship Feedback</h3>
                <p>{mentor ? `Provide direct feedback to ${mentor.name} on guidance quality, code reviews, and communication` : 'Your feedback goes to your assigned mentor'}</p>
              </div>
              {fbSuccess && (
                <span className="badge badge-success animate-fade-in">
                  <CheckCircle2 size={14} /> Feedback sent to {fbSuccess.mentor_name}
                </span>
              )}
            </div>

            {!mentor ? (
              <p className="mfb-form-error" role="alert">
                <AlertCircle size={14} /> You need an assigned mentor before feedback can be submitted.
              </p>
            ) : (
              <>
                <fieldset className="mfb-fieldset">
                  <legend>Feedback Category</legend>
                  <div className="mfb-type-grid">
                    {FEEDBACK_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`mfb-type-pill ${feedbackType === t.id ? 'is-selected' : ''}`}
                        onClick={() => setFeedbackType(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="mfb-field">
                  <label className="mfb-field-label">Mentorship Rating (optional)</label>
                  <div className="mfb-rating">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={`mfb-star ${val <= rating ? 'is-active' : ''}`}
                        onClick={() => setRating(val)}
                        aria-label={`${val} star${val > 1 ? 's' : ''}`}
                      >
                        <span>{val}</span>
                      </button>
                    ))}
                    <span className="mfb-rating-clear">{rating} / 5</span>
                  </div>
                </div>

                <div className="mfb-field">
                  <label htmlFor="fb-message">Feedback Notes <span className="req">* (min 20 chars)</span></label>
                  <textarea
                    id="fb-message"
                    rows={4}
                    className="mfb-textarea"
                    placeholder="Share thoughts, appreciation, or areas where your mentor can assist you further..."
                    value={fbMessage}
                    onChange={(e) => setFbMessage(e.target.value)}
                    required
                    minLength={20}
                  />
                </div>

                {fbError && (
                  <p className="mfb-form-error" role="alert">
                    <AlertCircle size={14} /> {fbError}
                  </p>
                )}

                <div className="form-action-row">
                  <button
                    type="submit"
                    className="btn btn-primary glass-btn-primary"
                    disabled={isSubmittingFb || fbMessage.trim().length < 20}
                  >
                    <Send size={16} />
                    <span>{isSubmittingFb ? 'Sending Feedback...' : 'Send Feedback to Mentor'}</span>
                  </button>
                </div>
              </>
            )}
          </form>

          {/* Sub-section B: Feedback received from mentor (real data) */}
          <div className="glass-card mfb-card-section">
            <div className="section-title-row">
              <div>
                <h3>Reviews & Guidance from Your Mentor</h3>
                <p>Read feedback shared by your mentor on your code reviews, strengths, and next steps</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn btn-xs ${reviewFilter === 'all' ? 'btn-primary' : 'btn-subtle'}`}
                  onClick={() => setReviewFilter('all')}
                >
                  All ({reviews.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${reviewFilter === 'unread' ? 'btn-primary' : 'btn-subtle'}`}
                  onClick={() => setReviewFilter('unread')}
                >
                  Unread ({reviews.filter((r) => !r.is_read).length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs ${reviewFilter === 'read' ? 'btn-primary' : 'btn-subtle'}`}
                  onClick={() => setReviewFilter('read')}
                >
                  Read ({reviews.filter((r) => r.is_read).length})
                </button>
              </div>
            </div>

            {reviews.length === 0 ? (
              <div className="mfb-state-card" style={{ background: 'transparent', boxShadow: 'none' }}>
                <ShieldCheck size={32} />
                <h3>No mentor reviews yet</h3>
                <p>When your mentor shares feedback on your work — code reviews, strengths, and next steps — it will appear here.</p>
              </div>
            ) : (
              <div className="mfb-directives-list">
                {reviews
                  .filter((item) => {
                    if (reviewFilter === 'unread') return !item.is_read;
                    if (reviewFilter === 'read') return Boolean(item.is_read);
                    return true;
                  })
                  .map((item) => {
                    const isUnread = !item.is_read;
                    return (
                      <div key={item.id} className={`mfb-directive-card ${isUnread ? 'is-unread-card' : ''}`}>
                        <div className="directive-header">
                          <div className="directive-title-group">
                            <ShieldCheck size={20} className={isUnread ? 'icon-amber' : 'icon-mint'} />
                            <div>
                              <h4>
                                {item.task_title || 'Mentorship Review'}{' '}
                                {isUnread ? (
                                  <span className="badge badge-warning" style={{ fontSize: '0.65rem', marginLeft: '0.4rem' }}>
                                    UNREAD
                                  </span>
                                ) : (
                                  <span className="badge badge-subtle" style={{ fontSize: '0.65rem', marginLeft: '0.4rem' }}>
                                    READ
                                  </span>
                                )}
                              </h4>
                              <span className="directive-meta">
                                From {item.mentor_name || item.mentor || 'Mentor'} on {formatDate(item.created_at)}
                              </span>
                            </div>
                          </div>
                          {isUnread && (
                            <button
                              type="button"
                              className="btn btn-xs btn-outline"
                              onClick={() => handleMarkReviewRead(item.id)}
                            >
                              <CheckCircle2 size={12} />
                              <span>Mark as Read</span>
                            </button>
                          )}
                        </div>

                        <p className="directive-text">"{item.feedback || item.message}"</p>

                        {item.strengths && (
                          <div className="directive-box box-improvements">
                            <strong>Strengths noted:</strong> {item.strengths}
                          </div>
                        )}

                        {(item.improvements || item.areas_for_improvement) && (
                          <div className="directive-box box-improvements">
                            <strong>Areas for improvement:</strong> {item.improvements || item.areas_for_improvement}
                          </div>
                        )}

                        {item.next_steps && (
                          <div className="directive-box box-nextsteps">
                            <strong>Actionable next steps:</strong> {item.next_steps}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
