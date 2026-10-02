import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  LifeBuoy,
  Mail,
  MessageSquare,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  fetchMentorEvaluations,
  fetchMentorInternAttendance,
} from '../../services/publicExperience';
import { fetchMentorInternDetail } from '../../services/skillService';
import { fetchReceivedFeedback } from '../../services/mentorFeedbackService';
import { fetchAssignmentWeeklyReports } from '../../services/phase20Service';
import {
  deriveInternState,
  PROGRESS_STATES,
  progressStateLabel,
} from '../../services/orchestrationService';

/**
 * MentorMonitoringView — Daily Status & Intern Monitoring workspace.
 *
 * Mentor-facing monitoring screen for §1–§12 of the monitoring spec:
 * a selector of assigned interns (server-authorized), a workload summary
 * strip, an attention queue, and a complete per-intern daily status view
 * (internship, today, progress, attendance, submissions, feedback,
 * blockers, AI insights — all real data).
 *
 * Data comes exclusively from existing mentor-scoped endpoints:
 *   GET /api/mentor/interns                    → selector + summary rollup
 *   GET /api/mentor/interns/{id}/detail        → tasks, submissions, feedback
 *   GET /api/attendance/intern/{id}            → recent attendance (new,
 *                                                mentor-scoped, no duplication)
 *   GET /api/mentor/submissions                → review decisions + deadlines
 *   GET /api/mentor-feedback                   → [Blocker] reports
 *   GET /api/progress/weekly-reports/assign…   → latest AI/prepared summary
 *   GET /api/mentor/evaluations                → upcoming evaluations
 *
 * No mock data. Blockers are the real [Blocker]-prefixed intern→mentor
 * feedback records; resolution status is a documented backend gap and is
 * never faked. Progress states are derived with visible evidence (never a
 * bare label); where an authoritative value is missing, the UI says so.
 */

const TASK_STATUS_LABELS = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'In Review',
  completed: 'Completed',
  changes_requested: 'Changes Requested',
};

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function StateChip({ state }) {
  const cls = {
    [PROGRESS_STATES.ON_TRACK]: 'on_track',
    [PROGRESS_STATES.AHEAD]: 'ahead',
    [PROGRESS_STATES.AT_RISK]: 'at_risk',
    [PROGRESS_STATES.BLOCKED]: 'blocked',
    [PROGRESS_STATES.INACTIVE]: 'inactive',
    [PROGRESS_STATES.COMPLETED]: 'completed',
  }[state] || 'on_track';
  return <span className={`orchestration-state orchestration-state-${cls}`}>{progressStateLabel(state)}</span>;
}

function SummaryTile({ label, value, tone }) {
  return (
    <div className={`orchestration-attention-row monitoring-summary-tile${tone ? ` tone-${tone}` : ''}`} style={{ alignItems: 'center', gap: '0.6rem' }}>
      <strong style={{ fontSize: '1.15rem', minWidth: 28 }}>{value}</strong>
      <span style={{ fontSize: '0.78rem', color: 'var(--provider-text-soft, #64748b)' }}>{label}</span>
    </div>
  );
}

function Section({ title, icon: Icon, children, aside }) {
  return (
    <div className="glass-card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {Icon && <Icon size={15} className="text-cyan" />}
          <strong style={{ fontSize: '0.88rem', color: 'var(--mentor-text, #0f172a)' }}>{title}</strong>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

function EvidenceList({ items }) {
  return (
    <ul className="orchestration-evidence" style={{ margin: '0.35rem 0 0' }}>
      {items.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export default function MentorMonitoringView({ interns = [], onNavigate, refreshKey = 0 }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [attendance, setAttendance] = useState({ items: [], loading: false, error: '' });
  const [blockers, setBlockers] = useState({ items: [], loading: true, error: '' });
  const [weekly, setWeekly] = useState(null);
  const [evaluations, setEvaluations] = useState([]);

  /* ---------------- Selector + selection ---------------- */

  const filteredInterns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return interns;
    return interns.filter((i) => `${i.full_name} ${i.internship_title || ''}`.toLowerCase().includes(q));
  }, [interns, search]);

  // Keep a valid selection without forcing navigation when the roster changes.
  // Deferred out of the effect body to avoid a cascading synchronous render.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedId((current) => {
        if (current && interns.some((i) => String(i.id) === String(current))) return current;
        return interns.length > 0 ? String(interns[0].id) : null;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [interns]);

  const selected = interns.find((i) => String(i.id) === String(selectedId)) || null;

  /* ---------------- Data loading (per selected intern) ---------------- */

  const loadBlockers = () => {
    setBlockers((prev) => ({ ...prev, loading: true }));
    fetchReceivedFeedback()
      .then((result) => setBlockers({ items: result.items || [], loading: false, error: '' }))
      .catch(() => setBlockers({ items: [], loading: false, error: 'Unable to load blocker reports.' }));
  };

  useEffect(() => {
    const timer = setTimeout(loadBlockers, 0);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      const resetTimer = setTimeout(() => setDetail(null), 0);
      return () => clearTimeout(resetTimer);
    }
    let active = true;
    const timer = setTimeout(() => {
      setDetailLoading(true);
      setDetailError('');
    }, 0);
    fetchMentorInternDetail(selectedId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((error) => {
        if (active) {
          setDetail(null);
          setDetailError(error?.message || 'Unable to load this intern.');
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    const clearTimer = setTimeout(() => setAttendance({ items: [], loading: true, error: '' }), 0);
    fetchMentorInternAttendance(selectedId)
      .then((result) => {
        if (active) setAttendance({ items: result.items || [], loading: false, error: '' });
      })
      .catch(() => {
        if (active) setAttendance({ items: [], loading: false, error: 'Attendance history is not available.' });
      });

    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [selectedId, refreshKey]);

  useEffect(() => {
    if (!selected || !selected.assignment_id) {
      const resetTimer = setTimeout(() => setWeekly(null), 0);
      return () => clearTimeout(resetTimer);
    }
    let active = true;
    fetchAssignmentWeeklyReports(selected.assignment_id)
      .then((result) => {
        if (active) setWeekly((result.items || [])[0] || null);
      })
      .catch(() => {
        if (active) setWeekly(null);
      });
    return () => {
      active = false;
    };
  }, [selected?.assignment_id]);

  useEffect(() => {
    fetchMentorEvaluations()
      .then((result) => setEvaluations(result.items || []))
      .catch(() => setEvaluations([]));
  }, []);

  /* ---------------- Derived per-intern status (real data only) ---------------- */

  const todayStr = new Date().toISOString().split('T')[0];

  const tasks = detail?.tasks || [];
  const activeTasks = tasks.filter((t) => ['assigned', 'in_progress', 'changes_requested'].includes(t.status));
  const overdueTasks = activeTasks.filter((t) => t.due_date && t.due_date < todayStr);
  const todayTasks = activeTasks.filter((t) => !overdueTasks.includes(t) && (!t.start_date || t.start_date <= todayStr));
  const submittedTasks = tasks.filter((t) => t.status === 'submitted');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const progressPercent = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  const internState = deriveInternState({
    taskCount: tasks.length || selected?.task_count || 0,
    completedTasks: completedTasks.length,
    tasks,
    lastActivity: selected?.last_activity,
  });

  const blockersForIntern = (blockers.items || []).filter(
    (b) => String(b.intern_id) === String(selectedId)
      || (b.intern_name && selected && b.intern_name === selected.full_name)
  );

  const submissions = detail?.submissions || [];
  const pendingReview = submissions.filter((s) => s.status === 'pending');
  const reviewed = submissions.filter((s) => s.status !== 'pending');
  const nextDeadlineTask = [...activeTasks].filter((t) => t.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0] || null;

  const latestAttendance = attendance.items[0] || null;
  const lastActivityLabel = latestAttendance?.checked_in_at
    ? `Last check-in ${formatDateTime(latestAttendance.checked_in_at)}`
    : selected?.last_activity
      ? `Last task activity ${formatDate(selected.last_activity)}`
      : 'No recorded activity yet';

  const currentMilestoneTask = overdueTasks[0] || todayTasks[0] || activeTasks[0] || null;

  /* AI insights: derived from real telemetry and clearly labeled as system
     analysis — the mentor stays the decision-maker. No fabricated scores. */
  const aiInsights = [];
  if (overdueTasks.length > 0) {
    aiInsights.push({
      text: `${selected?.full_name || 'This intern'} has ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: ${overdueTasks.map((t) => `“${t.title}”`).join(', ')}. Consider checking for blockers before re-assigning deadlines.`,
      action: 'Review overdue tasks and ask about obstacles.',
    });
  }
  if (blockersForIntern.length > 0) {
    aiInsights.push({
      text: `${blockersForIntern.length} blocker report${blockersForIntern.length > 1 ? 's' : ''} on record. The most recent is waiting for your response.`,
      action: 'Inspect the blocker below and respond via feedback.',
    });
  }
  if (submittedTasks.length > 0) {
    aiInsights.push({
      text: `${submittedTasks.length} submission${submittedTasks.length > 1 ? 's' : ''} awaiting your review — feedback loops stay fastest when reviews happen daily.`,
      action: 'Open Submissions to review.',
    });
  }
  if (aiInsights.length === 0 && completedTasks.length > 0 && overdueTasks.length === 0) {
    aiInsights.push({
      text: 'No exceptions detected — steady completion with nothing overdue.',
      action: 'Consider recognition or a stretch task.',
    });
  }

  /* ---------------- Roster summary (§2) ---------------- */

  const summary = useMemo(() => {
    const counts = { total: interns.length, on_track: 0, ahead: 0, at_risk: 0, blocked: 0, inactive: 0, completed: 0 };
    interns.forEach((intern) => {
      const { state } = deriveInternState({
        taskCount: intern.task_count || 0,
        completedTasks: intern.completed_tasks || 0,
        lastActivity: intern.last_activity,
      });
      if (counts[state] != null) counts[state] += 1;
      else counts.on_track += 1;
    });
    return counts;
  }, [interns]);

  /* ---------------- Attention queue (§11) ---------------- */

  const attention = useMemo(() => {
    const items = [];
    interns.forEach((intern) => {
      const { state, evidence } = deriveInternState({
        taskCount: intern.task_count || 0,
        completedTasks: intern.completed_tasks || 0,
        lastActivity: intern.last_activity,
      });
      if (state === PROGRESS_STATES.BLOCKED || state === PROGRESS_STATES.AT_RISK || state === PROGRESS_STATES.INACTIVE) {
        items.push({
          id: `state-${intern.id}`,
          severity: state === PROGRESS_STATES.BLOCKED ? 1 : 3,
          title: `${intern.full_name} — ${progressStateLabel(state)}`,
          evidence,
          action: () => setSelectedId(String(intern.id)),
          actionLabel: 'View status',
        });
      }
    });
    (blockers.items || []).slice(0, 5).forEach((b) => {
      if (!String(b.message || '').startsWith('[Blocker]')) return;
      items.push({
        id: `blocker-${b.id}`,
        severity: 1,
        title: `Blocker from ${b.intern_name}`,
        evidence: [formatDateTime(b.created_at), String(b.message || '').split('\n')[0].replace('[Blocker] ', '')],
        action: () => {
          const match = interns.find((i) => i.full_name === b.intern_name);
          if (match) setSelectedId(String(match.id));
        },
        actionLabel: 'Inspect',
      });
    });
    pendingReview.forEach((s) => {
      items.push({
        id: `review-${s.id}`,
        severity: 2,
        title: `Submission awaiting review — ${s.task_title || 'task'}`,
        evidence: [`Submitted ${formatDateTime(s.submitted_at)}`],
        action: () => onNavigate && onNavigate('/mentor/submissions'),
        actionLabel: 'Review',
      });
    });
    evaluations.filter((e) => e.status === 'draft').forEach((e) => {
      items.push({
        id: `eval-${e.id}`,
        severity: 4,
        title: `Evaluation draft for ${e.intern_name || 'intern'} pending`,
        evidence: [e.due_date ? `Due ${e.due_date}` : 'No due date'],
        action: () => onNavigate && onNavigate('/mentor/evaluations'),
        actionLabel: 'Open',
      });
    });
    return items.sort((a, b) => a.severity - b.severity);
  }, [interns, blockers.items, pendingReview, evaluations]);

  /* ---------------- Render ---------------- */

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: '0.9rem' }}>
      {/* Summary strip (§2) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.55rem' }}>
        <SummaryTile label="Total interns" value={summary.total} />
        <SummaryTile label="On track" value={summary.on_track} tone="ok" />
        <SummaryTile label="Ahead" value={summary.ahead} tone="ok" />
        <SummaryTile label="At risk" value={summary.at_risk} tone="warn" />
        <SummaryTile label="Blocked" value={summary.blocked} tone="bad" />
        <SummaryTile label="Inactive" value={summary.inactive} tone="warn" />
        <SummaryTile label="Pending reviews" value={pendingReview.length} tone="warn" />
      </div>

      <div style={{ display: 'grid', gap: '0.9rem', alignItems: 'start' }} className="monitoring-grid">
        {/* Selector column (§1, §3) */}
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem' }}>
              <Users size={15} className="text-cyan" />
              <strong style={{ fontSize: '0.88rem' }}>My Interns</strong>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>({filteredInterns.length})</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.4rem 0.6rem', background: '#f8fafc', marginBottom: '0.7rem' }}>
              <Search size={13} style={{ color: '#94a3b8' }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search intern…"
                style={{ border: 0, outline: 0, background: 'transparent', width: '100%', fontSize: '0.82rem' }}
                aria-label="Search interns"
              />
            </label>

            {filteredInterns.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                {interns.length === 0
                  ? 'No interns are assigned to you yet. When a provider assigns one, they appear here automatically.'
                  : 'No interns match that search.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gap: '0.35rem', maxHeight: 430, overflowY: 'auto' }} role="listbox" aria-label="Select an intern">
                {filteredInterns.map((intern) => {
                  const { state } = deriveInternState({
                    taskCount: intern.task_count || 0,
                    completedTasks: intern.completed_tasks || 0,
                    lastActivity: intern.last_activity,
                  });
                  const isSelected = String(intern.id) === String(selectedId);
                  return (
                    <button
                      key={intern.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => setSelectedId(String(intern.id))}
                      style={{
                        display: 'grid', gap: 2, textAlign: 'left', cursor: 'pointer',
                        border: isSelected ? '1px solid #7dd3fc' : '1px solid #eef2f7',
                        background: isSelected ? 'rgba(224,242,254,0.5)' : '#fbfdff',
                        borderRadius: '10px', padding: '0.55rem 0.7rem',
                      }}
                    >
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                        <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>{intern.full_name}</strong>
                        <StateChip state={state} />
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {intern.internship_title || 'No internship'} · {intern.completed_tasks || 0}/{intern.task_count || 0} tasks
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attention queue (§11) */}
          <div className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem' }}>
              <Activity size={15} style={{ color: '#d97706' }} />
              <strong style={{ fontSize: '0.88rem' }}>Requires attention</strong>
            </div>
            {attention.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Nothing needs your attention right now.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.45rem', maxHeight: 320, overflowY: 'auto' }}>
                {attention.slice(0, 10).map((item) => (
                  <div key={item.id} className="orchestration-attention-row">
                    <span className={`orchestration-sev orchestration-sev-${item.severity}`} aria-hidden="true">
                      {item.severity === 1 ? '!' : item.severity === 2 ? 'R' : '•'}
                    </span>
                    <div className="orchestration-attention-main">
                      <strong>{item.title}</strong>
                      {item.evidence.map((line) => (
                        <small key={line}>{line}</small>
                      ))}
                    </div>
                    <button type="button" className="orchestration-attention-action" onClick={item.action}>
                      {item.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected intern daily status (§4, §5, §6) */}
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {detailLoading ? (
            <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ margin: 0 }}>Loading daily status…</p>
            </div>
          ) : detailError ? (
            <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.7rem', color: '#dc2626' }}>{detailError}</p>
              <button type="button" className="provider-quiet-button" onClick={() => setSelectedId((v) => v)}>Retry</button>
            </div>
          ) : !selected ? (
            <div className="glass-card mentor-empty-state" style={{ padding: '2rem' }}>
              <Users size={28} />
              <strong>No intern selected</strong>
              <span>Select an intern from the list to see their daily status.</span>
            </div>
          ) : (
            <>
              {/* Daily status header (§5) */}
              <div className="glass-card" style={{ padding: '1rem', borderLeft: '4px solid #0ea5e9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Today&apos;s Status — {selected.full_name}</h3>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                      {selected.internship_title || 'No internship'} · {lastActivityLabel}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StateChip state={internState.state} />
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>System classification — not a score</p>
                  </div>
                </div>

                <EvidenceList items={internState.evidence} />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.7rem' }}>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.55rem 0.7rem' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Tasks</span>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{tasks.length} total</strong>
                    <span style={{ fontSize: '0.7rem', color: '#334155' }}>{completedTasks.length} done · {activeTasks.length} active</span>
                  </div>
                  <div style={{ background: overdueTasks.length ? '#fef2f2' : '#f8fafc', borderRadius: 10, padding: '0.55rem 0.7rem' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Overdue</span>
                    <strong style={{ display: 'block', fontSize: '1rem', color: overdueTasks.length ? '#dc2626' : 'inherit' }}>{overdueTasks.length}</strong>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '0.55rem 0.7rem' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Milestone</span>
                    <strong style={{ display: 'block', fontSize: '1rem' }}>
                      {currentMilestoneTask?.master_task_title || '—'}
                    </strong>
                  </div>
                  <div style={{ background: blockersForIntern.length ? '#fff7ed' : '#f8fafc', borderRadius: 10, padding: '0.55rem 0.7rem' }}>
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Blockers</span>
                    <strong style={{ display: 'block', fontSize: '1rem', color: blockersForIntern.length ? '#c2410c' : 'inherit' }}>{blockersForIntern.length}</strong>
                  </div>
                </div>
              </div>

              {/* Internship context */}
              <Section title="Internship" icon={Calendar}>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#334155' }}>
                  <strong>{selected.internship_title || 'No internship'}</strong>
                  {' · '}Mentor: you{' · '}Assigned {formatDate(selected.assigned_at)}
                  {nextDeadlineTask ? ` · Next deadline: ${nextDeadlineTask.title} (${nextDeadlineTask.due_date})` : ''}
                </p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Overall progress {progressPercent}% ({completedTasks.length}/{tasks.length} tasks completed, {activeTasks.length} remaining).
                  {weekly ? ` Latest weekly report: ${weekly.ai_status === 'fallback' ? 'prepared summary' : 'AI-generated'} (${formatDate(weekly.week_start)} → ${formatDate(weekly.week_end)}).` : ' No weekly report yet.'}
                </p>
              </Section>

              {/* Today's tasks */}
              <Section
                title={`Today (${todayTasks.length + overdueTasks.length} to act on)`}
                icon={CheckCircle2}
                aside={<button type="button" className="provider-quiet-button" onClick={() => onNavigate && onNavigate('/mentor/tasks')}>Manage tasks</button>}
              >
                {tasks.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No tasks assigned yet.</p>
                ) : overdueTasks.length + todayTasks.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Nothing due today. {activeTasks.length > 0 ? `${activeTasks.length} active task(s) in flight.` : ''}
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {[...overdueTasks, ...todayTasks].map((task) => (
                      <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.7rem', border: '1px solid #eef2f7', borderRadius: 10, background: '#fbfdff', flexWrap: 'wrap' }}>
                        <div>
                          <strong style={{ fontSize: '0.82rem', color: '#0f172a' }}>{task.title}</strong>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b' }}>
                            Due {task.due_date || 'Flexible'} · {TASK_STATUS_LABELS[task.status] || task.status}
                          </span>
                        </div>
                        <span className={`badge ${task.status === 'completed' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.68rem' }}>
                          {TASK_STATUS_LABELS[task.status] || task.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Attendance (existing system, mentor-authorized read) */}
              <Section title="Attendance" icon={Clock}>
                {attendance.loading ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Loading attendance…</p>
                ) : attendance.error ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{attendance.error}</p>
                ) : attendance.items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No attendance recorded yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
                    {attendance.items.slice(0, 7).map((entry) => (
                      <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#334155', borderBottom: '1px solid #f1f5f9', paddingBottom: 3 }}>
                        <span>{formatDateTime(entry.checked_in_at)}</span>
                        <span>
                          {entry.status === 'checked_in' ? 'Checked in' : `${Math.floor((entry.work_minutes || 0) / 60)}h ${(entry.work_minutes || 0) % 60}m`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Submissions */}
              <Section
                title="Submissions"
                icon={FileCheck2}
                aside={<button type="button" className="provider-quiet-button" onClick={() => onNavigate && onNavigate('/mentor/submissions')}>Review</button>}
              >
                {submissions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No submissions yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.4rem', maxHeight: 240, overflowY: 'auto' }}>
                    {submissions.slice(0, 6).map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem', border: '1px solid #eef2f7', borderRadius: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>{s.task_title || `Task #${s.task_id}`}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <small style={{ color: '#94a3b8' }}>{formatDateTime(s.submitted_at)}</small>
                          <span className={`badge ${s.status === 'pending' ? 'badge-primary' : s.status === 'approved' ? 'badge-success' : ''}`} style={{ fontSize: '0.66rem' }}>
                            {s.status === 'pending' ? 'Pending review' : s.status}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                  {pendingReview.length} pending · {reviewed.length} reviewed
                </p>
              </Section>

              {/* Feedback */}
              <Section
                title="Recent mentor feedback"
                icon={MessageSquare}
                aside={<button type="button" className="provider-quiet-button" onClick={() => onNavigate && onNavigate('/mentor/feedback')}>Give feedback</button>}
              >
                {(detail?.feedback || []).length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No feedback given yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.45rem', maxHeight: 220, overflowY: 'auto' }}>
                    {(detail?.feedback || []).slice(0, 4).map((f) => (
                      <div key={f.id} style={{ padding: '0.5rem 0.7rem', border: '1px solid #eef2f7', borderRadius: 10, background: '#fbfdff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.78rem', color: '#0f172a' }}>{f.task_title || 'General feedback'}</strong>
                          <small style={{ color: '#94a3b8' }}>{formatDateTime(f.created_at)}</small>
                        </div>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#334155' }}>{f.feedback}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Blockers */}
              <Section title="Blockers" icon={LifeBuoy}>
                {blockers.loading ? (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Loading blockers…</p>
                ) : blockersForIntern.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>No blocker reports from this intern.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
                    {blockersForIntern.map((b) => {
                      const lines = String(b.message || '').split('\n');
                      const typeLine = lines.find((l) => l.startsWith('[Blocker] Type:')) || '';
                      const taskLine = lines.find((l) => l.startsWith('Affected task:')) || '';
                      const details = lines.filter((l) => !l.startsWith('[Blocker]') && !l.startsWith('Affected task:') && l.trim()).join('\n');
                      return (
                        <div key={b.id} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 10, padding: '0.65rem 0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: '0.82rem', color: '#c2410c' }}>
                              {typeLine.replace('[Blocker] Type:', '').trim() || 'Blocker'}
                            </strong>
                            <span className="tag-pill" style={{ fontSize: '0.66rem' }}>Open — awaiting mentor action</span>
                          </div>
                          {taskLine && <p style={{ margin: '0.15rem 0 0', fontSize: '0.74rem', color: '#9a3412' }}>{taskLine}</p>}
                          {details && <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#7c2d12', whiteSpace: 'pre-wrap' }}>{details}</p>}
                          <small style={{ display: 'block', marginTop: '0.3rem', color: '#94a3b8', fontSize: '0.7rem' }}>Reported {formatDateTime(b.created_at)}</small>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* AI insights (§7) — clearly labeled, mentor decides */}
              {aiInsights.length > 0 && (
                <div className="orchestration-ai-note" style={{ padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.4rem' }}>
                    <Sparkles size={14} />
                    <strong style={{ fontSize: '0.85rem' }}>AI insight</strong>
                    <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>system-generated suggestion — your call</span>
                  </div>
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {aiInsights.map((insight, idx) => (
                      <div key={idx}>
                        <p style={{ margin: 0, fontSize: '0.8rem' }}>{insight.text}</p>
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.74rem', fontWeight: 600 }}>Suggested action: {insight.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact (backend-supported action) */}
              {detail?.intern?.email && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <a className="btn btn-outline btn-sm" href={`mailto:${detail.intern.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={13} /> Contact {selected.full_name}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
