import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck,
  GraduationCap,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Play,
  Radio,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react';
import {
  fetchInternWorkspace,
  updateInternTaskStatus,
} from '../../services/internService';
import { fetchMyGoals } from '../../services/phase20Service';
import { subscribeToInternEvents } from '../../services/realtimeService';
import { fetchMyWeeklyReports } from '../../services/phase20Service';
import TaskSubmitModal from '../../components/intern/TaskSubmitModal';

/**
 * InternInternshipWorkspacePage — /intern/internship/:internshipId
 *
 * A single coherent answer to: "What internship am I doing, what am I
 * expected to build, who is my mentor, what am I working on now, what comes
 * next, and how am I progressing?"
 *
 * Data comes exclusively from real backend endpoints:
 *   GET /api/interns/me/workspace  → internship, mentor (authorized fields),
 *                                    assignment, tasks, task_summary
 *   GET /api/goals/me              → learning goals + milestone progress
 *   GET /api/progress/weekly-reports/me → latest weekly report
 *   WS  /api/ws/intern             → live events (task assigned/started/
 *                                    submitted/completed, reviews, feedback)
 *
 * Honest states: no plan-status enum, DoD checklist fields, or task
 * dependencies exist in the backend yet — the page renders explicit
 * "planned, not connected" states and the DoD embedded in the internship
 * description is surfaced verbatim. Backend gaps are documented in the final
 * report; nothing is mocked.
 */

const STATUS_LABELS = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  archived: 'Archived',
  active: 'Active',
  completed: 'Completed',
};

const TASK_STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'In Review',
  completed: 'Completed',
  changes_requested: 'Changes Requested',
};

function TaskCard({ task, isOverdue, onOpenDetails, onStart }) {
  const priorityColor = task.priority === 'high' ? '#dc2626' : task.priority === 'low' ? '#64748b' : '#0284c7';
  return (
    <div style={{ border: isOverdue ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(226, 232, 240, 0.9)', borderRadius: '14px', padding: '1rem', background: isOverdue ? 'rgba(254, 242, 242, 0.85)' : 'rgba(255, 255, 255, 0.85)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#0f172a', fontWeight: 700 }}>{task.title}</h4>
            {isOverdue && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>OVERDUE</span>}
          </div>
          <p style={{ margin: '0.2rem 0 0', color: '#475569', fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</p>
        </div>
        <span className="badge badge-primary" style={{ textTransform: 'capitalize' }}>{TASK_STATUS_LABELS[task.status] || task.status}</span>
      </div>

      {task.mentor_feedback && task.status === 'changes_requested' && (
        <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', fontSize: '0.82rem', color: '#c2410c', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
          <MessageSquare size={14} style={{ marginTop: 2 }} />
          <span>{task.mentor_feedback.feedback}</span>
        </div>
      )}

      <div className="card-meta-tags" style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {task.master_task_title && <span className="tag-pill">Milestone: {task.master_task_title}</span>}
        <span className="tag-pill" style={{ color: isOverdue ? '#dc2626' : 'inherit' }}>Due: {task.due_date || 'Flexible'}</span>
        <span className="tag-pill" style={{ color: priorityColor, fontWeight: 600 }}>Priority: {task.priority || 'Normal'}</span>
        {task.estimated_hours != null && <span className="tag-pill">Est: {task.estimated_hours}h</span>}
      </div>

      <div className="card-footer-actions" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn-subtle btn-xs" onClick={onOpenDetails}>Details</button>
        {(task.status === 'assigned' || task.status === 'changes_requested') && onStart && (
          <button className="btn btn-primary btn-xs" onClick={onStart}>
            <Play size={12} /> Start Task
          </button>
        )}
      </div>
    </div>
  );
}

function TaskDetailCard({ task, onClose, onStart, onSubmitOpen }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(8, 12, 24, 0.75)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 99999, padding: '1rem' }} onClick={onClose} role="dialog" aria-modal="true" aria-label={`Task details: ${task.title}`}>
      <div className="glass-card animate-fade-in" style={{ width: 'min(620px, calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem', gap: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7', fontWeight: 700 }}>
              {task.project_title ? `Project: ${task.project_title}` : 'Task'}
            </span>
            <h3 style={{ margin: '0.2rem 0', fontSize: '1.2rem', color: '#0f172a' }}>{task.title}</h3>
            {task.master_task_title && <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>Milestone: {task.master_task_title}</p>}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer' }} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', padding: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.78rem', marginBottom: '0.9rem' }}>
          <div><span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>Status</span><strong style={{ textTransform: 'capitalize' }}>{TASK_STATUS_LABELS[task.status] || task.status}</strong></div>
          <div><span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>Priority</span><strong style={{ textTransform: 'capitalize' }}>{task.priority || 'Normal'}</strong></div>
          <div><span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>Deadline</span><strong>{task.due_date || 'Flexible'}</strong></div>
          <div><span style={{ color: '#64748b', display: 'block', fontSize: '0.68rem' }}>Est. effort</span><strong>{task.estimated_hours ? `${task.estimated_hours}h` : 'N/A'}</strong></div>
        </div>

        <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.88rem' }}>What this involves</h4>
        <p style={{ margin: '0 0 0.9rem', color: '#334155', fontSize: '0.86rem', whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '8px' }}>{task.description || 'No description provided.'}</p>

        {task.mentor_feedback && (
          <div style={{ border: '1px solid #c7d2fe', background: '#eef2ff', padding: '0.8rem', borderRadius: '10px', marginBottom: '0.9rem' }}>
            <strong style={{ fontSize: '0.85rem', color: '#3730a3' }}>Mentor feedback</strong>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.83rem', color: '#1e1b4b', whiteSpace: 'pre-wrap' }}>{task.mentor_feedback.feedback}</p>
          </div>
        )}

        {task.submission && (
          <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '0.8rem', borderRadius: '10px', marginBottom: '0.9rem' }}>
            <strong style={{ fontSize: '0.85rem', color: '#166534' }}>Your submission</strong>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#14532d', whiteSpace: 'pre-wrap' }}>{task.submission.content}</p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
          {(task.status === 'assigned' || task.status === 'changes_requested') && (
            <button className="btn btn-primary btn-sm" onClick={onStart}>Start Task</button>
          )}
          {(task.status === 'in_progress' || task.status === 'assigned' || task.status === 'changes_requested') && (
            <button className="btn btn-outline btn-sm" onClick={onSubmitOpen}>Submit Work</button>
          )}
          <button className="btn btn-subtle btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function InternInternshipWorkspacePage({ onNavigate }) {
  const [workspace, setWorkspace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [goalsData, setGoalsData] = useState(null);
  const [weeklyReport, setWeeklyReport] = useState(null);
  const [selectedDetailTask, setSelectedDetailTask] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitTaskId, setSubmitTaskId] = useState('');
  const [liveEvents, setLiveEvents] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting'); // connecting | live | offline

  const loadWorkspace = async () => {
    try {
      const result = await fetchInternWorkspace();
      setWorkspace(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(error.message || 'Could not load your internship workspace.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGoals = async () => {
    try {
      const res = await fetchMyGoals();
      setGoalsData(res);
    } catch {
      setGoalsData(null);
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

  useEffect(() => {
    Promise.resolve().then(() => {
      loadWorkspace();
      loadGoals();
      loadWeeklyReport();
    });

    const unsubscribe = subscribeToInternEvents({
      onConnect: () => setConnectionState('live'),
      onDisconnect: () => setConnectionState((prev) => (prev === 'offline' ? prev : 'connecting')),
      onReconnect: () => {
        // Resync affected state after the connection comes back — the only
        // full refetch we do, on reconnect, per the realtime contract.
        loadWorkspace();
        loadGoals();
      },
      onEvent: (event) => {
        const type = event?.type || '';
        if (!type) return;
        setLiveEvents((prev) => [event, ...prev].slice(0, 8));

        // Targeted state updates — no blind refetch of everything (§14).
        if (type === 'task.assigned') {
          loadWorkspace();
          loadGoals();
        } else if (type === 'task.started' || type === 'task.status_changed' || type === 'task.submitted' || type === 'task.resubmitted' || type === 'task.completed' || type === 'task.changes_requested') {
          setWorkspace((prev) => {
            if (!prev) return prev;
            const tasks = (prev.tasks || []).map((task) => (
              event.task_id && Number(task.id) === Number(event.task_id)
                ? { ...task, status: event.status || task.status }
                : task
            ));
            const summary = { ...prev.task_summary };
            const oldTask = (prev.tasks || []).find((task) => Number(task.id) === Number(event.task_id));
            if (oldTask && event.status && summary[oldTask.status] != null) {
              summary[oldTask.status] -= 1;
              summary[event.status] = (summary[event.status] || 0) + 1;
            }
            return { ...prev, tasks, task_summary: summary };
          });
        } else if (type === 'feedback.created') {
          loadWorkspace();
        }
      },
    });
    return unsubscribe;
  }, []);

  const tasks = workspace?.tasks || [];
  const internship = workspace?.internship || null;
  const mentor = workspace?.mentor || null;
  const goalsProgress = goalsData?.progress || null;
  const hasMilestones = (goalsData?.goals || []).some((g) => (g.milestones || []).length > 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const activeTasks = tasks.filter((t) => ['assigned', 'in_progress', 'changes_requested'].includes(t.status));
  const overdueTasks = activeTasks.filter((t) => t.due_date && t.due_date < todayStr);
  const todayTasks = activeTasks.filter((t) => !overdueTasks.includes(t) && (!t.start_date || t.start_date <= todayStr));
  const upcomingTasks = activeTasks
    .filter((t) => t.start_date && t.start_date > todayStr)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
  const inReviewTasks = tasks.filter((t) => t.status === 'submitted');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  // Overall progress: mentor review completions / total assigned tasks.
  const overallProgress = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  // Milestone progress: authoritative backend values from /api/goals/me.
  const milestoneProgress = goalsProgress && goalsProgress.total_milestones > 0
    ? Math.round((goalsProgress.milestones_completed / goalsProgress.total_milestones) * 100)
    : null;

  // Definition of Done: the backend has no dedicated checklist fields yet, so
  // providers append a "Definition of Done:" section to the internship
  // description. Surface those real lines verbatim; if absent, say so honestly.
  const definitionOfDone = useMemo(() => {
    const desc = internship?.description || '';
    const idx = desc.indexOf('Definition of Done');
    if (idx === -1) return null;
    return desc
      .slice(idx)
      .split('\n')
      .map((line) => line.replace(/^[-*•]\s*/, '').replace(/^Definition of Done:?\s*/i, '').trim())
      .filter(Boolean);
  }, [internship?.description]);
  const cleanDescription = useMemo(() => {
    const desc = internship?.description || '';
    const idx = desc.indexOf('Definition of Done');
    return idx === -1 ? desc : desc.slice(0, idx).trim();
  }, [internship?.description]);

  const currentMilestoneTask = overdueTasks[0] || todayTasks[0] || upcomingTasks[0] || activeTasks[0] || null;
  const nextDeadlineTask = [...activeTasks]
    .filter((t) => t.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;

  const handleStartTask = async (taskId) => {
    try {
      await updateInternTaskStatus(taskId, 'in_progress');
      setWorkspace((prev) => prev
        ? {
          ...prev,
          tasks: prev.tasks.map((task) => (task.id === taskId ? { ...task, status: 'in_progress' } : task)),
          task_summary: {
            ...prev.task_summary,
            assigned: (prev.task_summary.assigned || 0) - (prev.tasks.find((t) => t.id === taskId)?.status === 'assigned' ? 1 : 0),
            in_progress: (prev.task_summary.in_progress || 0) + (prev.tasks.find((t) => t.id === taskId)?.status === 'assigned' ? 1 : 0),
          },
        }
        : prev);
      setSelectedDetailTask(null);
    } catch {
      await loadWorkspace();
    }
  };

  const handleSubmitted = () => {
    // The intern's own submit also emits a WS event, but apply the local
    // change immediately for instant feedback; the socket event is a no-op.
    loadWorkspace();
  };

  if (isLoading) {
    return (
      <div className="intern-dashboard-page animate-fade-in" style={{ padding: '2rem 1rem' }}>
        <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
          <p className="card-desc-snippet">Loading your internship workspace…</p>
        </div>
      </div>
    );
  }

  if (loadError && !workspace) {
    return (
      <div className="intern-dashboard-page animate-fade-in" style={{ padding: '2rem 1rem' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertTriangle size={32} style={{ color: '#dc2626', marginBottom: '0.5rem' }} />
          <h3 style={{ margin: '0 0 0.4rem', color: '#0f172a' }}>Couldn&apos;t load your workspace</h3>
          <p style={{ color: '#64748b', marginBottom: '1rem' }}>{loadError}</p>
          <button className="btn btn-primary btn-sm" onClick={() => { setIsLoading(true); loadWorkspace(); }}>Try again</button>
        </div>
      </div>
    );
  }

  if (!internship) {
    return (
      <div className="intern-dashboard-page animate-fade-in" style={{ padding: '2rem 1rem' }}>
        <div className="glass-card empty-state-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <GraduationCap size={40} className="text-cyan" style={{ marginBottom: '0.5rem' }} />
          <h3 style={{ margin: '0 0 0.4rem', color: '#0f172a' }}>No internship assigned yet</h3>
          <p style={{ color: '#64748b', maxWidth: '420px', margin: '0 auto 1.2rem' }}>
            Your internship workspace appears here once you are selected and assigned a mentor.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate && onNavigate('/intern/explore')}>Explore internships</button>
        </div>
      </div>
    );
  }

  const internshipStatus = STATUS_LABELS[internship.status] || internship.status;

  return (
    <div className="intern-dashboard-page animate-fade-in">
      {/* Header */}
      <section className="dashboard-hero-banner glass-panel">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem', flexWrap: 'wrap', width: '100%' }}>
          <button
            className="btn btn-subtle btn-sm"
            onClick={() => onNavigate && onNavigate('/intern/dashboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, marginTop: 4 }}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>{internship.title}</h1>
              <span className={`tag-pill ${internship.status === 'published' ? 'stipend-pill' : ''}`}>{internshipStatus}</span>
            </div>
            <p style={{ margin: '0.25rem 0 0', color: '#475569', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              {internship.organization && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Building2 size={13} /> {internship.organization}</span>}
              {internship.department && <span>{internship.department}</span>}
              {internship.work_mode && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {internship.work_mode}</span>}
            </p>
          </div>
          <span
            title={connectionState === 'live' ? 'Live updates connected' : 'Reconnecting to live updates — data stays available'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: connectionState === 'live' ? '#16a34a' : '#d97706', border: '1px solid currentColor', borderRadius: '12px', padding: '2px 8px', flexShrink: 0 }}
            role="status"
          >
            <Radio size={11} /> {connectionState === 'live' ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </section>

      {/* Live event ribbon */}
      {liveEvents.length > 0 && (
        <div className="glass-card animate-fade-in" style={{ marginTop: '0.8rem', padding: '0.55rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#334155' }} role="status">
          <Sparkles size={13} className="text-cyan" style={{ flexShrink: 0 }} />
          <span><strong>Just now:</strong> {liveEvents[0].description || liveEvents[0].title}</span>
          {liveEvents.length > 1 && <span style={{ color: '#94a3b8' }}>+{liveEvents.length - 1} more update{liveEvents.length > 2 ? 's' : ''}</span>}
        </div>
      )}

      {/* Overview grid */}
      <section className="dashboard-section" style={{ marginTop: '1rem' }} aria-label="Internship overview">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
          {/* Basic info */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <BookOpen size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Internship details</strong>
            </div>
            <dl style={{ margin: 0, display: 'grid', gap: '0.3rem', fontSize: '0.8rem', color: '#334155' }}>
              {internship.duration && <div style={{ display: 'flex', gap: 6 }}><dt style={{ color: '#64748b', minWidth: 72 }}>Duration</dt><dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {internship.duration}</dd></div>}
              {internship.stipend && <div style={{ display: 'flex', gap: 6 }}><dt style={{ color: '#64748b', minWidth: 72 }}>Stipend</dt><dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Wallet size={12} /> {internship.stipend}</dd></div>}
              {internship.deadline && <div style={{ display: 'flex', gap: 6 }}><dt style={{ color: '#64748b', minWidth: 72 }}>Deadline</dt><dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {internship.deadline}</dd></div>}
              <div style={{ display: 'flex', gap: 6 }}><dt style={{ color: '#64748b', minWidth: 72 }}>Started</dt><dd style={{ margin: 0 }}>{workspace?.assignment?.created_at ? String(workspace.assignment.created_at).slice(0, 10) : '—'}</dd></div>
            </dl>
          </div>

          {/* Mentor */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <GraduationCap size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Your mentor</strong>
            </div>
            {mentor ? (
              <>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{mentor.name}</p>
                <p style={{ margin: '0.15rem 0 0.5rem', color: '#64748b', fontSize: '0.78rem' }}>Assigned by your provider — reach out for guidance on any task.</p>
                {mentor.email && (
                  <a className="btn btn-outline btn-xs" href={`mailto:${mentor.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={12} /> Email mentor
                  </a>
                )}
              </>
            ) : (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>A mentor will be assigned to you shortly.</p>
            )}
          </div>

          {/* Progress */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <Target size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Progress</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
              <span>Tasks completed</span>
              <strong>{overallProgress}%</strong>
            </div>
            <div style={{ height: 6, borderRadius: 6, background: '#e2e8f0', overflow: 'hidden', marginTop: 3 }} role="progressbar" aria-valuenow={overallProgress} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${overallProgress}%`, height: '100%', background: 'linear-gradient(90deg,#0ea5e9,#6366f1)' }} />
            </div>
            {milestoneProgress != null && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  <span>Milestones completed</span>
                  <strong>{milestoneProgress}%</strong>
                </div>
                <div style={{ height: 6, borderRadius: 6, background: '#e2e8f0', overflow: 'hidden', marginTop: 3 }} role="progressbar" aria-valuenow={milestoneProgress} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${milestoneProgress}%`, height: '100%', background: 'linear-gradient(90deg,#10b981,#0ea5e9)' }} />
                </div>
              </>
            )}
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
              {completedTasks.length} of {tasks.length} tasks completed · {inReviewTasks.length} in review
              {overdueTasks.length > 0 ? ` · ${overdueTasks.length} overdue` : ''}
            </p>
          </div>

          {/* Upcoming deadline */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
              <Calendar size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>Next deadline</strong>
            </div>
            {nextDeadlineTask ? (
              <>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>{nextDeadlineTask.title}</p>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: nextDeadlineTask.due_date < todayStr ? '#dc2626' : '#64748b' }}>
                  {nextDeadlineTask.due_date < todayStr ? 'Overdue — ' : 'Due '} {nextDeadlineTask.due_date}
                </p>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No dated deadlines right now.</p>
            )}
          </div>
        </div>
      </section>

      {/* Plan status banner — honest state */}
      <section style={{ marginTop: '1rem' }}>
        <div style={{ border: '1px solid #bae6fd', background: 'linear-gradient(135deg, rgba(224,242,254,0.6), rgba(245,250,255,0.5))', borderRadius: '14px', padding: '0.8rem 1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <ClipboardList size={17} style={{ color: '#0284c7', flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>Your work plan</strong>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
              {tasks.length > 0
                ? `Your mentor's plan for this internship is active — the tasks and milestones below are the approved breakdown. ${currentMilestoneTask?.master_task_title ? `Current milestone: ${currentMilestoneTask.master_task_title}.` : ''}`
                : 'Your internship has been assigned. The work plan is being prepared — tasks will appear here as your mentor activates them.'}
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
              AI-generated plan proposals (draft / awaiting approval states) are a planned backend feature — mentors currently review and activate each plan step themselves.
            </p>
          </div>
        </div>
      </section>

      {/* Today's Work */}
      <section className="dashboard-section" style={{ marginTop: '1.25rem' }} aria-label="Today's work">
        <div className="section-header" style={{ marginBottom: '0.8rem' }}>
          <div>
            <h2 className="section-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Target size={19} className="text-cyan" /> Today&apos;s Work
            </h2>
            <p className="section-subtitle">What to act on now — overdue first, then scheduled for today</p>
          </div>
        </div>

        {overdueTasks.length === 0 && todayTasks.length === 0 ? (
          <div className="glass-card empty-state-card" style={{ padding: '1.6rem', textAlign: 'center' }}>
            <CheckCircle2 size={30} style={{ color: '#16a34a', marginBottom: '0.4rem' }} />
            <h3 style={{ margin: '0 0 0.3rem', color: '#0f172a' }}>
              {activeTasks.length > 0 ? 'Nothing scheduled for today' : 'No active tasks yet'}
            </h3>
            <p style={{ color: '#64748b', margin: 0 }}>
              {activeTasks.length > 0
                ? 'Check upcoming work below, or submit progress on a task you have started.'
                : 'Your work plan is being prepared. New tasks from your mentor will appear here automatically — no refresh needed.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {overdueTasks.map((task) => (
              <TaskCard key={task.id} task={task} isOverdue onOpenDetails={() => setSelectedDetailTask(task)} onStart={() => handleStartTask(task.id)} />
            ))}
            {todayTasks.map((task) => (
              <TaskCard key={task.id} task={task} onOpenDetails={() => setSelectedDetailTask(task)} onStart={() => handleStartTask(task.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Roadmap + Definition of Done */}
      <section className="dashboard-section" style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.9rem' }} aria-label="Roadmap and expectations">
        {/* Roadmap */}
        <div className="glass-card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
            <ListChecks size={16} className="text-cyan" />
            <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Roadmap</strong>
          </div>

          {tasks.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.83rem', color: '#64748b' }}>
              The roadmap appears once your mentor activates the plan. You&apos;ll see milestones and tasks here without refreshing.
            </p>
          ) : (
            <>
              {/* Milestone rows derived from the real master_task groupings on tasks */}
              {(() => {
                const milestones = [];
                const seen = new Set();
                tasks.forEach((task) => {
                  const key = task.master_task_id || task.master_task_title || '_unassigned';
                  if (seen.has(key)) return;
                  seen.add(key);
                  const group = tasks.filter((t) => (t.master_task_id || t.master_task_title || '_unassigned') === key);
                  const done = group.filter((t) => t.status === 'completed').length;
                  milestones.push({
                    key,
                    title: task.master_task_title || 'General work',
                    projectTitle: task.project_title,
                    done,
                    total: group.length,
                    hasTasks: Boolean(task.master_task_id || task.master_task_title),
                  });
                });
                return (
                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {milestones.map((m, idx) => {
                      const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
                      const isCurrent = currentMilestoneTask && (currentMilestoneTask.master_task_id || currentMilestoneTask.master_task_title || '_unassigned') === m.key;
                      return (
                        <div key={m.key} style={{ border: isCurrent ? '1px solid #7dd3fc' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 0.8rem', background: isCurrent ? 'rgba(224,242,254,0.4)' : 'rgba(255,255,255,0.6)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.83rem', color: '#0f172a' }}>
                              {idx + 1}. {m.title}
                            </strong>
                            {isCurrent && <span style={{ background: '#e0f2fe', color: '#0284c7', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>CURRENT</span>}
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{m.done}/{m.total} tasks</span>
                          </div>
                          {m.projectTitle && <p style={{ margin: '0.1rem 0 0.25rem', fontSize: '0.72rem', color: '#94a3b8' }}>Project: {m.projectTitle}</p>}
                          <div style={{ height: 5, borderRadius: 5, background: '#e2e8f0', overflow: 'hidden', marginTop: 4 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.title} progress`}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16a34a' : 'linear-gradient(90deg,#0ea5e9,#6366f1)' }} />
                          </div>
                        </div>
                      );
                    })}
                    {!hasMilestones && (
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>
                        Tasks are not grouped into milestones yet — your mentor&apos;s roadmap breakdown is a planned backend feature.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div style={{ marginTop: '0.8rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.7rem' }}>
                <strong style={{ fontSize: '0.8rem', color: '#334155' }}>Upcoming work</strong>
                {upcomingTasks.length === 0 ? (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>No future-dated tasks scheduled.</p>
                ) : (
                  <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', fontSize: '0.78rem', color: '#475569', display: 'grid', gap: '0.2rem' }}>
                    {upcomingTasks.slice(0, 4).map((task) => (
                      <li key={task.id}>
                        {task.title} — starts {task.start_date}
                        {task.due_date ? `, due ${task.due_date}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Definition of Done + objectives */}
        <div style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
          <div className="glass-card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <CheckCircle2 size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Definition of Done</strong>
            </div>
            {definitionOfDone ? (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
                {definitionOfDone.map((item, idx) => (
                  <li key={idx} style={{ display: 'flex', gap: '0.45rem', fontSize: '0.83rem', color: '#334155', alignItems: 'flex-start' }}>
                    <span aria-hidden="true" style={{ color: '#0284c7', fontWeight: 700 }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                No acceptance criteria defined for this internship yet. Structured Definition-of-Done fields are a planned backend feature.
              </p>
            )}
            {cleanDescription && (
              <details style={{ marginTop: '0.7rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: '#0284c7' }}>About this internship</summary>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{cleanDescription}</p>
              </details>
            )}
          </div>

          {/* Learning goals & milestones (real /api/goals/me data) */}
          <div className="glass-card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <GraduationCap size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Learning milestones</strong>
            </div>
            {goalsProgress && (goalsProgress.total_milestones > 0 || goalsProgress.total_goals > 0) ? (
              <>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: '#334155' }}>
                  {goalsProgress.milestones_completed} of {goalsProgress.total_milestones} milestones completed
                  {goalsProgress.total_goals > 0 ? ` across ${goalsProgress.total_goals} learning goal${goalsProgress.total_goals > 1 ? 's' : ''}` : ''}
                </p>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {goalsData.goals.map((goal) => (
                    <details key={goal.id}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
                        {goal.title} {goal.status === 'completed' ? '✓' : ''}
                      </summary>
                      <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem', fontSize: '0.76rem', color: '#475569', display: 'grid', gap: '0.15rem' }}>
                        {(goal.milestones || []).map((m) => (
                          <li key={m.id} style={{ textDecoration: m.status === 'completed' ? 'line-through' : 'none', color: m.status === 'completed' ? '#16a34a' : '#475569' }}>
                            {m.title} {m.due_date ? `(due ${m.due_date})` : ''}
                          </li>
                        ))}
                        {(goal.milestones || []).length === 0 && <li>No milestones defined yet.</li>}
                      </ul>
                    </details>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                Your mentor hasn&apos;t set learning goals or milestones yet.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* All tasks + weekly report */}
      <section className="dashboard-section" style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.9rem' }} aria-label="All work and progress reports">
        <div className="glass-card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileCheck size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>All tasks</strong>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({tasks.length})</span>
            </div>
            <button
              className="btn btn-primary btn-xs"
              onClick={() => {
                setSubmitTaskId(activeTasks[0] ? String(activeTasks[0].id) : (tasks[0] ? String(tasks[0].id) : ''));
                setShowSubmitModal(true);
              }}
              disabled={tasks.length === 0}
            >
              Submit work
            </button>
          </div>

          {tasks.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.83rem', color: '#64748b' }}>No tasks assigned yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem', maxHeight: 420, overflowY: 'auto' }}>
              {tasks.map((task) => {
                const isOverdue = activeTasks.includes(task) && task.due_date && task.due_date < todayStr;
                return (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', border: '1px solid #eef2f7', borderRadius: '10px', background: '#fbfdff', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#0f172a', fontWeight: 600 }}>{task.title}</p>
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>
                        {task.master_task_title ? `${task.master_task_title} · ` : ''}Due: {task.due_date || 'Flexible'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      {isOverdue && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '0.62rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 700 }}>OVERDUE</span>}
                      <span className={`badge ${task.status === 'completed' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.68rem' }}>
                        {TASK_STATUS_LABELS[task.status] || task.status}
                      </span>
                      <button className="btn btn-subtle btn-xs" onClick={() => setSelectedDetailTask(task)}>Details</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: '0.9rem', alignContent: 'start' }}>
          {/* Weekly report */}
          <div className="glass-card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <Sparkles size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Weekly progress report</strong>
            </div>
            {weeklyReport ? (
              <>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#334155', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {weeklyReport.summary}
                </p>
                <span className="tag-pill" style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem' }}>
                  {weeklyReport.ai_status === 'fallback' ? 'Prepared summary' : 'AI-generated'} · {weeklyReport.week_start} → {weeklyReport.week_end}
                </span>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Your first weekly report appears here once generated.</p>
            )}
          </div>

          {/* Links to existing systems — no duplication */}
          <div className="glass-card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <MessageSquare size={16} className="text-cyan" />
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>Related</strong>
            </div>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => onNavigate && onNavigate('/intern/mentor-feedback')}>
                Mentor feedback <ArrowRight size={13} />
              </button>
              <button className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => onNavigate && onNavigate('/intern/dashboard')}>
                Attendance & daily check-in <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Modals */}
      {selectedDetailTask && (
        <TaskDetailCard
          task={selectedDetailTask}
          onClose={() => setSelectedDetailTask(null)}
          onStart={() => handleStartTask(selectedDetailTask.id)}
          onSubmitOpen={() => {
            setSubmitTaskId(String(selectedDetailTask.id));
            setSelectedDetailTask(null);
            setShowSubmitModal(true);
          }}
        />
      )}

      {showSubmitModal && (
        <TaskSubmitModal
          tasks={tasks}
          initialTaskId={submitTaskId}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}
