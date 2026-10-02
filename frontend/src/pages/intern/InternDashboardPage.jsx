import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Compass,
  FileCheck,
  GraduationCap,
  ArrowRight,
  Clock,
  Building2,
  CheckCircle2,
  MapPin,
  Calendar,
  AlertTriangle,
  FolderKanban,
  MessageSquare,
  Play,
  Radio,
  X,
  LifeBuoy,
  Target,
  Sparkles,
} from 'lucide-react';
import { getSession } from '../../services/publicExperience';
import {
  fetchLiveInternships,
  formatBackendInternship,
  fetchMyApplications,
  fetchInternWorkspace,
  fetchInternAttendanceToday,
  updateInternTaskStatus,
  checkInInternAttendance,
  checkOutInternAttendance,
} from '../../services/internService';
import { subscribeToInternships, subscribeToInternEvents } from '../../services/realtimeService';
import TaskSubmitModal from '../../components/intern/TaskSubmitModal';
import { fetchUnreadFeedback, markFeedbackAsRead, submitMentorFeedback } from '../../services/mentorFeedbackService';
import { fetchMyWeeklyReports } from '../../services/phase20Service';
import FeedbackNotificationModal from '../../components/intern/FeedbackNotificationModal';
import '../../styles/InternWorkspace.css';

function formatMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0h 0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/* Blocker categories (orchestrator): sent to the mentor through the real
   intern→mentor feedback channel until a dedicated backend entity exists. */
const BLOCKER_TYPES = [
  { id: 'technical_issue', label: 'Technical issue' },
  { id: 'requirement_unclear', label: 'Requirement unclear' },
  { id: 'dependency_blocked', label: 'Dependency blocked' },
  { id: 'environment_setup', label: 'Environment / setup issue' },
  { id: 'missing_access', label: 'Missing access' },
  { id: 'knowledge_gap', label: 'Knowledge gap' },
  { id: 'availability', label: 'Availability issue' },
  { id: 'other', label: 'Other' },
];

/* Presentation labels for the authoritative backend lifecycle states. */
const APP_STATUS_LABELS = {
  applied: 'Applied',
  screening: 'AI Screening',
  shortlisted: 'Shortlisted',
  assessment: 'Assessment',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Not Selected',
};

export default function InternDashboardPage({ onNavigate }) {
  const [session, setSession] = useState(null);
  const [internships, setInternships] = useState([]);
  const [isLoadingInternships, setIsLoadingInternships] = useState(true);
  const [applications, setApplications] = useState([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);
  const [workspace, setWorkspace] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);

  // Filter and Detail Modals
  const [filterCategory, setFilterCategory] = useState('all'); // 'all' | 'today' | 'upcoming' | 'overdue' | 'submitted' | 'completed'
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState('');
  const [wsConnection, setWsConnection] = useState('connecting');
  const [latestEvent, setLatestEvent] = useState(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState('');
  const [clockTick, setClockTick] = useState(() => Date.now());

  // Unread Feedback Popup State
  const [unreadFeedbackItems, setUnreadFeedbackItems] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Latest AI/prepared weekly progress report (real backend payload)
  const [weeklyReport, setWeeklyReport] = useState(null);

  // Blocker reporting (goes to the mentor via the intern→mentor feedback channel)
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [blockerDraft, setBlockerDraft] = useState({ type: 'technical_issue', details: '', affected: '' });
  const [blockerSubmitting, setBlockerSubmitting] = useState(false);
  const [blockerMessage, setBlockerMessage] = useState(null);

  const loadUnreadFeedback = async () => {
    try {
      const res = await fetchUnreadFeedback();
      const items = Array.isArray(res?.items) ? res.items : [];
      setUnreadFeedbackItems(items);
      if (items.length > 0) {
        setShowFeedbackModal(true);
      }
    } catch {
      setUnreadFeedbackItems([]);
      setShowFeedbackModal(false);
    }
  };

  const loadWorkspace = async () => {
    try {
      const result = await fetchInternWorkspace();
      setWorkspace(result);
      setTasks(result?.tasks || []);
      if (result?.tasks?.length) {
        setSubmitTaskId((current) => current || String(result.tasks[0].id));
      }
    } catch {
      setWorkspace(null);
      setTasks([]);
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  const loadAttendance = async () => {
    try {
      const result = await fetchInternAttendanceToday();
      setAttendanceItems(result?.items || []);
    } catch {
      setAttendanceItems([]);
    }
  };

  const loadWeeklyReport = async () => {
    try {
      const res = await fetchMyWeeklyReports();
      setWeeklyReport(res?.items?.[0] || null);
    } catch {
      setWeeklyReport(null);
    }
  };

  const loadApplications = async () => {
    try {
      const items = await fetchMyApplications();
      setApplications(Array.isArray(items) ? items : []);
    } catch {
      setApplications([]);
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const loadLiveInternships = async () => {
    try {
      const items = await fetchLiveInternships();
      setInternships(items);
    } catch {
      setInternships([]);
    } finally {
      setIsLoadingInternships(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      const sessionData = getSession();
      setSession(sessionData);
      loadWorkspace();
      loadAttendance();
      loadApplications();
      loadLiveInternships();
      loadUnreadFeedback();
      loadWeeklyReport();
    });

    const unsubscribe = subscribeToInternships({
      onInternshipPublished: (incoming) => {
        const formatted = formatBackendInternship(incoming);
        if (!formatted) return;

        setInternships((prev) => {
          const exists = prev.some((item) => String(item.id) === String(formatted.id));
          if (exists) {
            return prev.map((item) => (String(item.id) === String(formatted.id) ? { ...item, ...formatted } : item));
          }
          return [formatted, ...prev];
        });
      },
      onReconnect: () => {
        loadLiveInternships();
      },
    });

    // Intern realtime channel: mentor actions on this intern's work update
    // the dashboard without a manual refresh. Only structural events trigger
    // a refetch — status-only events are covered by local updates.
    const unsubscribeInternEvents = subscribeToInternEvents({
      onConnect: () => setWsConnection('live'),
      onDisconnect: () => setWsConnection((prev) => (prev === 'offline' ? prev : 'connecting')),
      onReconnect: () => {
        loadWorkspace();
        loadAttendance();
      },
      onEvent: (event) => {
        const type = event?.type || '';
        if (!type) return;
        setLatestEvent(event);
        if (type === 'task.assigned' || type === 'task.completed' || type === 'task.changes_requested') {
          loadWorkspace();
        }
        setLatestEvent(event);
      },
    });

    const timer = setInterval(() => setClockTick(Date.now()), 60000);
    return () => {
      unsubscribe();
      unsubscribeInternEvents();
      clearInterval(timer);
    };
  }, []);

  const userName = session?.user?.full_name || 'Intern Candidate';
  const primaryApp = applications[0] || null;
  const activeAttendance = attendanceItems.find((entry) => entry.status === 'checked_in') || null;
  const elapsedMinutes = activeAttendance
    ? Math.max(0, Math.round((clockTick - new Date(activeAttendance.checked_in_at).getTime()) / 60000))
    : 0;
  const todayWorkMinutes = attendanceItems.reduce((total, entry) => total + (entry.work_minutes || 0), 0) + elapsedMinutes;
  const attendanceStatus = activeAttendance ? 'checked_in' : 'checked_out';

  const handleAttendanceToggle = async () => {
    setAttendanceBusy(true);
    setAttendanceMessage('');
    try {
      const result = attendanceStatus === 'checked_in'
        ? await checkOutInternAttendance('Checked out after work session.')
        : await checkInInternAttendance('Checked in for the workday.');
      setAttendanceMessage(result.status === 'checked_in' ? 'Checked in successfully.' : 'Checked out successfully.');
      await loadAttendance();
    } catch (error) {
      setAttendanceMessage(error.message || 'Unable to update attendance right now.');
    } finally {
      setAttendanceBusy(false);
    }
  };

  const handleTaskSubmitted = () => {
    // TaskSubmitModal owns submission; refresh the workspace so counts,
    // filters, and the orchestration strip reflect the new state instantly.
    loadWorkspace();
  };

  const handleBlockerSubmit = async (event) => {
    event.preventDefault();
    if (blockerDraft.details.trim().length < 20) {
      setBlockerMessage({ tone: 'error', text: 'Please describe the blocker in at least 20 characters so your mentor can help effectively.' });
      return;
    }
    setBlockerSubmitting(true);
    setBlockerMessage(null);
    const taskObj = tasks.find((t) => String(t.id) === blockerDraft.affected);
    const typeLabel = BLOCKER_TYPES.find((bt) => bt.id === blockerDraft.type)?.label || 'Blocker';
    const lines = [
      `[Blocker] Type: ${typeLabel}`,
      taskObj ? `Affected task: ${taskObj.title} (task #${taskObj.id})` : 'Affected task: none specified',
      '',
      blockerDraft.details.trim(),
    ];
    try {
      await submitMentorFeedback({ feedbackType: 'other', rating: null, message: lines.join('\n') });
      setBlockerMessage({ tone: 'success', text: 'Blocker sent to your mentor — they will see it in their Intern Feedback queue.' });
      setBlockerDraft({ type: 'technical_issue', details: '', affected: '' });
      setTimeout(() => {
        setBlockerModalOpen(false);
        setBlockerMessage(null);
      }, 2400);
    } catch (error) {
      setBlockerMessage({ tone: 'error', text: error.message || 'Could not send the blocker report. Please try again.' });
    } finally {
      setBlockerSubmitting(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId, newStatus) => {
    try {
      await updateInternTaskStatus(taskId, newStatus);
      await loadWorkspace();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  // Date categorization & task grouping
  const todayStr = new Date().toISOString().split('T')[0];

  const activeTasks = tasks.filter((t) => ['assigned', 'in_progress', 'changes_requested'].includes(t.status));
  const overdueTasks = activeTasks.filter((t) => t.due_date && t.due_date < todayStr);
  const todayTasks = activeTasks.filter(
    (t) => !overdueTasks.includes(t) && (!t.start_date || t.start_date <= todayStr)
  );
  const upcomingTasks = activeTasks
    .filter((t) => t.start_date && t.start_date > todayStr)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const submittedTasks = tasks.filter((t) => t.status === 'submitted');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const changesRequestedTasks = tasks.filter((t) => t.status === 'changes_requested');
  const progressPercent = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const nextActionTask = overdueTasks[0] || todayTasks[0] || upcomingTasks[0] || activeTasks[0] || null;

  // Filtered task view
  let displayedTasks = tasks;
  if (filterCategory === 'today') displayedTasks = todayTasks;
  else if (filterCategory === 'overdue') displayedTasks = overdueTasks;
  else if (filterCategory === 'upcoming') displayedTasks = upcomingTasks;
  else if (filterCategory === 'submitted') displayedTasks = submittedTasks;
  else if (filterCategory === 'completed') displayedTasks = completedTasks;

  return (
    <div className="intern-dashboard-page animate-fade-in">
      {/* Header Banner */}
      <section className="dashboard-hero-banner glass-panel">
        <div className="hero-welcome-info">
          <div className="welcome-avatar-orb">
            <span>{userName.slice(0, 2).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="hero-greeting-title">Welcome back, {userName}! 👋</h1>
            <p className="hero-greeting-subtitle">
              {workspace?.internship?.title
                ? `Active Intern at ${workspace.internship.department || 'Engineering'} · Mentor: ${workspace.mentor?.name || 'Assigned'}`
                : isLoadingApplications
                ? 'Loading your application status…'
                : primaryApp
                ? `Application Status: ${APP_STATUS_LABELS[primaryApp.status] || primaryApp.status}`
                : 'Explore active internships and manage your daily deliverables.'}
            </p>
          </div>
        </div>

        {workspace && (
          <div className="hero-action-pills" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${attendanceStatus === 'checked_in' ? 'btn-success' : 'btn-primary'}`}
              onClick={handleAttendanceToggle}
              disabled={attendanceBusy}
            >
              <Clock size={14} />
              <span>{attendanceStatus === 'checked_in' ? 'Check Out' : 'Check In'}</span>
            </button>
            <span className="tag-pill" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
              Today: {formatMinutes(todayWorkMinutes)}
            </span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate && onNavigate('/intern/internship')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <GraduationCap size={14} />
              <span>Internship workspace</span>
            </button>
            <span
              title={wsConnection === 'live' ? 'Live updates connected' : 'Reconnecting to live updates — data stays available'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: wsConnection === 'live' ? '#16a34a' : '#d97706', border: '1px solid currentColor', borderRadius: '12px', padding: '3px 9px' }}
              role="status"
            >
              <Radio size={11} /> {wsConnection === 'live' ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
        )}
      </section>

      {attendanceMessage && (
        <div className="alert-banner info animate-fade-in" style={{ marginTop: '0.5rem' }}>
          <span>{attendanceMessage}</span>
        </div>
      )}

      {latestEvent && (
        <div className="alert-banner info animate-fade-in" style={{ marginTop: '0.5rem' }} role="status">
          <span><strong>Live update:</strong> {latestEvent.description || latestEvent.title}</span>
        </div>
      )}

      {/* Orchestration strip: what to do today, current milestone, blockers, weekly progress */}
      <section className="dashboard-section" style={{ marginTop: '1rem' }} aria-label="Today's focus">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <Target size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Today's Work</strong>
            </div>
            {isLoadingWorkspace ? (
              <p className="card-desc-snippet">Loading…</p>
            ) : todayTasks.length + overdueTasks.length > 0 ? (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>
                  <strong>{todayTasks.length + overdueTasks.length} task(s) to act on</strong>
                  {overdueTasks.length > 0 ? ` — ${overdueTasks.length} overdue` : ''}.
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Next: {(overdueTasks[0] || todayTasks[0])?.title}
                </p>
                <button
                  className="btn btn-primary btn-xs"
                  style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setFilterCategory(overdueTasks.length ? 'overdue' : 'today')}
                >
                  Start working <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>
                Nothing due today — check upcoming tasks or submit completed work.
              </p>
            )}
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <FolderKanban size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Current Milestone</strong>
            </div>
            {nextActionTask ? (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>
                  {nextActionTask.master_task_title || nextActionTask.project_title || 'First assigned task'}
                </p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  {nextActionTask.project_title ? `Project: ${nextActionTask.project_title}` : 'Part of your active project plan'}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>
                No active task — your mentor&apos;s plan will appear here.
              </p>
            )}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
                <span>Overall progress</span>
                <strong>{progressPercent}%</strong>
              </div>
              <div style={{ height: 6, borderRadius: 6, background: '#e2e8f0', overflow: 'hidden', marginTop: 3 }} role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg,#0ea5e9,#6366f1)' }} />
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1rem', borderColor: changesRequestedTasks.length ? 'rgba(234,88,12,0.45)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <AlertTriangle size={16} style={{ color: changesRequestedTasks.length ? '#ea580c' : '#64748b' }} />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Blockers</strong>
            </div>
            {changesRequestedTasks.length > 0 ? (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#9a3412' }}>
                  {changesRequestedTasks.length} task(s) need rework after mentor review.
                </p>
                <button className="btn btn-outline btn-xs" style={{ marginTop: '0.5rem' }} onClick={() => setFilterCategory('all')}>
                  Review changes
                </button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>No blockers on record.</p>
            )}
            <button
              className="btn btn-subtle btn-xs"
              style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setBlockerModalOpen(true)}
            >
              <LifeBuoy size={12} /> Report a blocker
            </button>
          </div>

          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <Sparkles size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Weekly Progress</strong>
            </div>
            {weeklyReport ? (
              <>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {weeklyReport.summary}
                </p>
                <span className="tag-pill" style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem' }}>
                  <Sparkles size={11} />
                  {weeklyReport.ai_status === 'fallback' ? 'Prepared summary' : 'AI-generated summary'} · {weeklyReport.week_start} → {weeklyReport.week_end}
                </span>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                Your first weekly progress report appears here once generated for your internship.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Main Execution Workspace & Tasks Section */}
      <section className="dashboard-section" style={{ marginTop: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div className="section-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className="section-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderKanban size={20} className="text-cyan" />
                Intern Execution Workspace
              </h2>
              <p className="section-subtitle">Your daily deliverables, upcoming workload, and mentor reviews</p>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: 'all', label: `All (${tasks.length})` },
                { id: 'today', label: `Today's (${todayTasks.length})` },
                { id: 'overdue', label: `Overdue (${overdueTasks.length})` },
                { id: 'upcoming', label: `Upcoming (${upcomingTasks.length})` },
                { id: 'submitted', label: `In Review (${submittedTasks.length})` },
                { id: 'completed', label: `Completed (${completedTasks.length})` },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`btn btn-xs ${filterCategory === f.id ? 'btn-primary' : 'btn-subtle'}`}
                  onClick={() => setFilterCategory(f.id)}
                  style={{ borderRadius: '20px', padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isLoadingWorkspace ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              <p className="card-desc-snippet">Loading your workspace & task schedule...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state-card" style={{ padding: '2rem', textAlign: 'center' }}>
              <Compass size={36} className="text-cyan" style={{ marginBottom: '0.5rem' }} />
              <h3>No tasks assigned yet</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Once your provider assigns a mentor and project, your daily chunks and task schedule will appear here.
              </p>
            </div>
          ) : filterCategory !== 'all' ? (
            /* Filtered View */
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {displayedTasks.length === 0 ? (
                <p className="card-desc-snippet" style={{ fontStyle: 'italic', padding: '1rem' }}>
                  No tasks matching the '{filterCategory}' filter.
                </p>
              ) : (
                displayedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpenDetails={() => setSelectedDetailTask(task)}
                    onStart={() => handleTaskStatusUpdate(task.id, 'in_progress')}
                    onSubmitWork={() => {
                      setSubmitTaskId(String(task.id));
                      setShowTaskModal(true);
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            /* Categorized Multi-Section View */
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {/* SECTION 0: START HERE — the orchestrated next action */}
              {nextActionTask && (
                <div style={{ border: '1px solid #bae6fd', background: 'linear-gradient(135deg, rgba(224,242,254,0.6), rgba(245,250,255,0.5))', borderRadius: '14px', padding: '0.9rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <Target size={17} style={{ color: '#0284c7' }} />
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>
                      Start here: {nextActionTask.title}
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>
                    {overdueTasks[0] ? 'Overdue — clear this first. ' : ''}
                    {nextActionTask.master_task_title ? `Part of ${nextActionTask.master_task_title}. ` : ''}
                    {nextActionTask.estimated_hours ? `Estimated ${nextActionTask.estimated_hours}h. ` : ''}
                    {nextActionTask.due_date ? `Due ${nextActionTask.due_date}.` : 'No fixed deadline.'}
                  </p>
                </div>
              )}

              {/* SECTION 1: OVERDUE TASKS (if any exist) */}
              {overdueTasks.length > 0 && (
                <div style={{ border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '14px', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <AlertTriangle size={18} style={{ color: '#dc2626' }} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#dc2626', fontWeight: 700 }}>Overdue Tasks ({overdueTasks.length})</h3>
                  </div>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {overdueTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isOverdue
                        onOpenDetails={() => setSelectedDetailTask(task)}
                        onStart={() => handleTaskStatusUpdate(task.id, 'in_progress')}
                        onSubmitWork={() => {
                          setSubmitTaskId(String(task.id));
                          setShowTaskModal(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 2: TODAY'S TASKS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Calendar size={18} style={{ color: '#0284c7' }} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>Today's Tasks ({todayTasks.length})</h3>
                </div>
                {todayTasks.length === 0 ? (
                  <p className="card-desc-snippet" style={{ fontStyle: 'italic', padding: '0.5rem' }}>
                    No active tasks scheduled for today. Check your upcoming tasks below.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {todayTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isToday
                        onOpenDetails={() => setSelectedDetailTask(task)}
                        onStart={() => handleTaskStatusUpdate(task.id, 'in_progress')}
                        onSubmitWork={() => {
                          setSubmitTaskId(String(task.id));
                          setShowTaskModal(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 3: UPCOMING TASKS */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Clock size={18} style={{ color: '#4f46e5' }} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>Upcoming Tasks ({upcomingTasks.length})</h3>
                </div>
                {upcomingTasks.length === 0 ? (
                  <p className="card-desc-snippet" style={{ fontStyle: 'italic', padding: '0.5rem' }}>
                    No upcoming tasks scheduled yet.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {upcomingTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onOpenDetails={() => setSelectedDetailTask(task)}
                        onStart={() => handleTaskStatusUpdate(task.id, 'in_progress')}
                        onSubmitWork={() => {
                          setSubmitTaskId(String(task.id));
                          setShowTaskModal(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 4: IN REVIEW / SUBMITTED */}
              {submittedTasks.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <FileCheck size={18} style={{ color: '#d97706' }} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>Awaiting Mentor Review ({submittedTasks.length})</h3>
                  </div>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {submittedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onOpenDetails={() => setSelectedDetailTask(task)}
                        onSubmitWork={() => {
                          setSubmitTaskId(String(task.id));
                          setShowTaskModal(true);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 5: COMPLETED TASKS */}
              {completedTasks.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>Completed Tasks ({completedTasks.length})</h3>
                  </div>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {completedTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onOpenDetails={() => setSelectedDetailTask(task)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* TASK DETAIL MODAL */}
      {selectedDetailTask && (
        <TaskDetailModal
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onStart={() => {
            handleTaskStatusUpdate(selectedDetailTask.id, 'in_progress');
            setSelectedDetailTask(null);
          }}
          onSubmitOpen={() => {
            setSubmitTaskId(String(selectedDetailTask.id));
            setShowTaskModal(true);
          }}
          onReportBlocker={() => {
            setSubmitTaskId(String(selectedDetailTask.id));
            setSelectedDetailTask(null);
            setBlockerDraft((current) => ({ ...current, affected: String(selectedDetailTask.id) }));
            setBlockerModalOpen(true);
          }}
        />
      )}

      {/* TASK SUBMISSION MODAL (shared component) */}
      {showTaskModal && (
        <TaskSubmitModal
          tasks={tasks}
          initialTaskId={submitTaskId}
          onClose={() => setShowTaskModal(false)}
          onSubmitted={handleTaskSubmitted}
        />
      )}

      {/* Live Internship Recommendations */}
      <section className="dashboard-section" style={{ marginTop: '2rem' }}>
        <div className="section-header">
          <div>
            <h2 className="section-title">Live Internship Openings</h2>
            <p className="section-subtitle">Published by verified providers on InternFlow right now</p>
          </div>
          <button className="btn btn-sm btn-outline" onClick={() => onNavigate('/intern/explore')}>
            <span>View All ({internships.length})</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {isLoadingInternships ? (
          <div className="internships-grid">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="glass-card internship-card">
                <div className="skeleton-line" style={{ width: '70%' }} />
                <div className="skeleton-line" style={{ width: '45%' }} />
                <div className="skeleton-line" style={{ width: '90%' }} />
              </div>
            ))}
          </div>
        ) : internships.length === 0 ? (
          <div className="glass-card empty-state-card animate-fade-in">
            <Compass size={40} className="empty-icon text-cyan" />
            <h3>No openings published yet</h3>
            <p>Providers publish internships here the moment they go live — check back soon.</p>
            <button className="btn btn-outline" onClick={() => onNavigate('/intern/explore')}>
              <Compass size={16} />
              <span>Open Discovery Hub</span>
            </button>
          </div>
        ) : (
          <div className="internships-grid">
            {internships.slice(0, 3).map((item) => (
              <div key={item.id} className="glass-card internship-card">
                <div className="card-top">
                  <div className="card-company-icon">
                    <Building2 size={20} />
                  </div>
                  {item.formattedCreatedAt && (
                    <span className="tag-pill" title={item.createdAt ? `Posted: ${item.createdAt}` : ''}>
                      <Calendar size={11} className="text-cyan" /> {item.formattedCreatedAt}
                    </span>
                  )}
                </div>

                <h3 className="card-job-title">{item.title}</h3>
                <p className="card-company-name">{item.company}</p>
                <p className="card-desc-snippet">{item.description}</p>

                <div className="card-meta-tags">
                  <span className="tag-pill">
                    <MapPin size={12} />
                    {item.workMode}
                  </span>
                  <span className="tag-pill">
                    <Clock size={12} />
                    {item.duration}
                  </span>
                  <span className="tag-pill stipend-pill">{item.stipend}</span>
                </div>

                {item.skills.length > 0 && (
                  <div className="card-skills-row">
                    {item.skills.map((skill) => (
                      <span key={skill} className="skill-chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                <div className="card-footer-actions">
                  <button
                    className="btn btn-outline btn-sm full-width"
                    onClick={() => onNavigate(`/intern/internships/${item.id}`)}
                  >
                    <span>View Details</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BLOCKER REPORT MODAL — routed to the mentor via the real intern→mentor feedback channel */}
      {blockerModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(8, 12, 24, 0.75)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 99999 }} onClick={() => setBlockerModalOpen(false)}>
          <div className="glass-card" style={{ width: 'min(560px, calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 20px 30px rgba(0,0,0,0.25)', borderRadius: '16px' }} onClick={(event) => event.stopPropagation()}>
            <div className="section-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="section-title" style={{ fontSize: '1.2rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <LifeBuoy size={18} className="text-cyan" /> Report a Blocker
                </h3>
                <p className="section-subtitle" style={{ color: '#64748b' }}>Your mentor is notified immediately and can help unblock you.</p>
              </div>
              <button type="button" onClick={() => setBlockerModalOpen(false)} style={{ background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {blockerMessage && (
              <div
                className="alert-banner"
                style={{
                  marginBottom: '0.9rem',
                  border: `1px solid ${blockerMessage.tone === 'success' ? '#16a34a' : '#dc2626'}`,
                  color: blockerMessage.tone === 'success' ? '#166534' : '#b91c1c',
                  background: blockerMessage.tone === 'success' ? '#f0fdf4' : '#fef2f2',
                  borderRadius: '10px',
                  padding: '0.6rem 0.9rem',
                  fontSize: '0.85rem',
                }}
                role={blockerMessage.tone === 'success' ? 'status' : 'alert'}
              >
                <span>{blockerMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleBlockerSubmit}>
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <label style={{ display: 'grid', gap: '0.3rem' }}>
                  <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>What kind of blocker? *</span>
                  <select value={blockerDraft.type} onChange={(event) => setBlockerDraft((current) => ({ ...current, type: event.target.value }))} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem' }}>
                    {BLOCKER_TYPES.map((bt) => (
                      <option key={bt.id} value={bt.id}>{bt.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: '0.3rem' }}>
                  <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Describe the blocker *</span>
                  <textarea
                    value={blockerDraft.details}
                    onChange={(event) => setBlockerDraft((current) => ({ ...current, details: event.target.value }))}
                    rows={4}
                    placeholder="What is blocked, what you already tried, and what you need to proceed."
                    style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem', resize: 'vertical' }}
                  />
                </label>

                {tasks.length > 0 && (
                  <label style={{ display: 'grid', gap: '0.3rem' }}>
                    <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Affected task (optional)</span>
                    <select value={blockerDraft.affected} onChange={(event) => setBlockerDraft((current) => ({ ...current, affected: event.target.value }))} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem' }}>
                      <option value="">Not task-specific</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={String(task.id)}>{task.title}</option>
                      ))}
                    </select>
                  </label>
                )}

                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                  Sent to your mentor as a structured report with the blocker type and affected task, visible in their Intern Feedback queue.
                </p>
              </div>

              <div className="card-footer-actions" style={{ marginTop: '1.1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-subtle btn-sm" onClick={() => setBlockerModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={blockerSubmitting}>
                  {blockerSubmitting ? 'Sending…' : 'Send to Mentor'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* UNREAD MENTOR FEEDBACK NOTIFICATION MODAL */}
      {showFeedbackModal && unreadFeedbackItems.length > 0 && (
        <FeedbackNotificationModal
          unreadItems={unreadFeedbackItems}
          onClose={() => setShowFeedbackModal(false)}
          onMarkRead={async (feedbackId) => {
            await markFeedbackAsRead(feedbackId);
            setUnreadFeedbackItems((prev) => prev.filter((item) => item.id !== feedbackId));
          }}
          onViewFeedback={() => {
            setShowFeedbackModal(false);
            if (onNavigate) {
              onNavigate('/intern/mentor-feedback');
            }
          }}
        />
      )}
    </div>
  );
}

function TaskCard({ task, isOverdue, isToday, onOpenDetails, onStart, onSubmitWork, onReportBlocker }) {
  const priorityColor = task.priority === 'high' ? '#dc2626' : task.priority === 'low' ? '#64748b' : '#0284c7';

  return (
    <div
      style={{
        border: isOverdue ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(226, 232, 240, 0.9)',
        borderRadius: '14px',
        padding: '1.1rem',
        background: isOverdue ? 'rgba(254, 242, 242, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.02rem', color: '#0f172a', fontWeight: 700 }}>{task.title}</h4>
            {isToday && <span style={{ background: '#e0f2fe', color: '#0284c7', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>TODAY</span>}
            {isOverdue && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>OVERDUE</span>}
          </div>
          <p style={{ margin: 0, color: '#475569', fontSize: '0.88rem', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {task.description}
          </p>
        </div>
        <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>
          {task.status === 'changes_requested' ? 'Changes Requested' : task.status}
        </span>
      </div>

      {/* DIRECT MENTOR FEEDBACK / CHANGES REQUESTED BOX ON TASK CARD */}
      {task.mentor_feedback && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '10px', background: task.status === 'changes_requested' ? '#fff7ed' : '#eef2ff', border: task.status === 'changes_requested' ? '1px solid #fed7aa' : '1px solid #c7d2fe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
            <MessageSquare size={14} style={{ color: task.status === 'changes_requested' ? '#ea580c' : '#4f46e5' }} />
            <strong style={{ fontSize: '0.82rem', color: task.status === 'changes_requested' ? '#c2410c' : '#3730a3' }}>
              {task.status === 'changes_requested' ? 'Changes Requested by Mentor' : 'Mentor Feedback'}
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#1e293b', fontStyle: 'italic', lineHeight: 1.4 }}>
            "{task.mentor_feedback.feedback}"
          </p>
          {task.mentor_feedback.strengths && (
            <div style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: '#15803d' }}>
              <strong>Strengths:</strong> {task.mentor_feedback.strengths}
            </div>
          )}
          {task.mentor_feedback.improvements && (
            <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: '#b91c1c' }}>
              <strong>Areas for Improvement:</strong> {task.mentor_feedback.improvements}
            </div>
          )}
          {task.mentor_feedback.next_steps && (
            <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: '#6d28d9' }}>
              <strong>Next Steps:</strong> {task.mentor_feedback.next_steps}
            </div>
          )}
        </div>
      )}

      {task.status === 'changes_requested' && !task.mentor_feedback && (
        <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={15} />
          <span><strong>Changes Requested:</strong> Your mentor requested updates on this task. Review details and resubmit updated work.</span>
        </div>
      )}

      <div className="card-meta-tags" style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {task.project_title && <span className="tag-pill" style={{ fontWeight: 600 }}>Project: {task.project_title}</span>}
        {task.master_task_title && <span className="tag-pill">Master: {task.master_task_title}</span>}
        {task.start_date && <span className="tag-pill">Start: {task.start_date}</span>}
        <span className="tag-pill" style={{ color: isOverdue ? '#dc2626' : 'inherit' }}>Due: {task.due_date || 'Flexible'}</span>
        <span className="tag-pill" style={{ color: priorityColor, fontWeight: 600 }}>Priority: {task.priority || 'Normal'}</span>
        {task.estimated_hours != null && <span className="tag-pill">Est: {task.estimated_hours}h</span>}
        {task.submission && (
          <span className="tag-pill" style={{ color: '#16a34a', fontWeight: 600 }}>
            <CheckCircle2 size={12} /> Submitted
          </span>
        )}
      </div>

      <div className="card-footer-actions" style={{ marginTop: '0.9rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-subtle btn-xs" onClick={onOpenDetails}>
          View Details & Feedback
        </button>

        {(task.status === 'assigned' || task.status === 'in_progress' || task.status === 'changes_requested') && onReportBlocker && (
          <button className="btn btn-outline btn-xs" onClick={onReportBlocker} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <LifeBuoy size={12} /> Report blocker
          </button>
        )}

        {(task.status === 'assigned' || task.status === 'changes_requested') && onStart && (
          <button className="btn btn-primary btn-xs" onClick={onStart}>
            <Play size={12} /> Start Task
          </button>
        )}

        {(task.status === 'in_progress' || task.status === 'assigned' || task.status === 'changes_requested') && onSubmitWork && (
          <button className="btn btn-outline btn-xs" onClick={onSubmitWork}>
            Submit Work
          </button>
        )}
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose, onStart, onSubmitOpen, onReportBlocker }) {
  const priorityColor = task.priority === 'high' ? '#dc2626' : task.priority === 'low' ? '#64748b' : '#0284c7';

  const modalHtml = (
    <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(8, 12, 24, 0.75)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 99999 }} onClick={onClose}>
      <div className="glass-card animate-fade-in" style={{ width: 'min(640px, calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 20px 30px rgba(0,0,0,0.25)', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div className="section-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7', fontWeight: 700 }}>
              {task.project_title ? `Project: ${task.project_title}` : 'Task Details'}
            </span>
            <h3 className="section-title" style={{ fontSize: '1.3rem', margin: '0.2rem 0', color: '#0f172a' }}>{task.title}</h3>
            {task.master_task_title && (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Master Task: {task.master_task_title}</p>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', padding: '0.85rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.8rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Status</span>
              <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{task.status.replace('_', ' ')}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '.7rem' }}>Priority</span>
              <strong style={{ color: priorityColor, textTransform: 'capitalize' }}>{task.priority || 'Normal'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '.7rem' }}>Timeline</span>
              <strong style={{ color: '#0f172a' }}>{task.start_date || 'Start'} → {task.due_date || 'Flexible'}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '.7rem' }}>Est. Hours</span>
              <strong style={{ color: '#0f172a' }}>{task.estimated_hours ? `${task.estimated_hours}h` : 'N/A'}</strong>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.9rem', color: '#0f172a', fontWeight: 700 }}>Description</h4>
            <p style={{ margin: 0, color: '#334155', fontSize: '0.88rem', whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>
              {task.description || 'No description provided for this task.'}
            </p>
          </div>

          {/* Mentor Feedback (if present) */}
          {task.mentor_feedback && (
            <div style={{ border: '1px solid #c7d2fe', background: '#eef2ff', padding: '0.9rem', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <MessageSquare size={16} style={{ color: '#4f46e5' }} />
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#3730a3', fontWeight: 700 }}>Mentor Feedback</h4>
              </div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#1e1b4b' }}>{task.mentor_feedback.feedback}</p>
              {task.mentor_feedback.strengths && (
                <div style={{ fontSize: '0.8rem', color: '#15803d' }}><strong>Strengths:</strong> {task.mentor_feedback.strengths}</div>
              )}
              {task.mentor_feedback.improvements && (
                <div style={{ fontSize: '0.8rem', color: '#1b1b9e' }}><strong>Improvements:</strong> {task.mentor_feedback.improvements}</div>
              )}
              {task.mentor_feedback.next_steps && (
                <div style={{ fontSize: '0.8rem', color: '#6d28d9' }}><strong>Next Steps:</strong> {task.mentor_feedback.next_steps}</div>
              )}
            </div>
          )}

          {/* Existing Submission */}
          {task.submission && (
            <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '0.9rem', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#166534', fontWeight: 700 }}>Submitted Deliverable</h4>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#14532d', whiteSpace: 'pre-wrap' }}>{task.submission.content}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {(task.status === 'assigned' || task.status === 'changes_requested') && (
              <button className="btn btn-primary btn-sm" onClick={onStart}>Start Task</button>
            )}
            {(task.status === 'in_progress' || task.status === 'assigned' || task.status === 'changes_requested') && (
              <button className="btn btn-outline btn-sm" onClick={() => { onClose(); onSubmitOpen(); }}>Submit Work</button>
            )}
            {(task.status !== 'completed') && onReportBlocker && (
              <button className="btn btn-subtle btn-sm" onClick={onReportBlocker} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <LifeBuoy size={12} /> Report blocker
              </button>
            )}
            <button className="btn btn-subtle btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalHtml, document.body) : modalHtml;
}
