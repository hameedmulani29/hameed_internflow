import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MessagesSquare,
  Plus,
  Search,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import MentorBackground from '../../components/mentor/MentorBackground';
import MentorProjectsPage from './MentorProjectsPage';
import MentorMonitoringView from './MentorMonitoringView';
import Pagination from '../../components/common/Pagination';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import SkillChip from '../../components/common/SkillChip';
import {
  clearSession,
  createMentorEvaluation,
  createMentorFeedback,
  createMentorTask,
  fetchMentorDashboard,
  fetchMentorEvaluations,
  fetchMentorFeedback,
  fetchMentorInterns,
  fetchMentorSubmissions,
  fetchMentorTasks,
  getSession,
  reviewMentorSubmission,
} from '../../services/publicExperience';
import { fetchMentorInternDetail, createSkillObservation, OBSERVATION_LEVELS } from '../../services/skillService';
import { fetchReceivedFeedback } from '../../services/mentorFeedbackService';
import { fetchAssignmentWeeklyReports } from '../../services/phase20Service';
import { subscribeToMentorMonitoring } from '../../services/realtimeService';
import { buildAttentionQueue, deriveInternState, deriveTaskInsights, progressStateLabel, summarizeProgressStates, PROGRESS_STATES } from '../../services/orchestrationService';

import '../../styles/ProviderDashboard.css';
import '../../styles/MentorWorkspace.css';
import '../../styles/Orchestration.css';

function formatActivityTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);
  if (isNaN(diffSec) || diffSec < 0) return 'Just now';
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hour${Math.floor(diffSec / 3600) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

const MENTOR_NAV = [
  ['Dashboard', '/mentor/dashboard', LayoutDashboard],
  ['Monitoring', '/mentor/monitoring', Activity],
  ['My Interns', '/mentor/interns', Users],
  ['Projects', '/mentor/projects', FolderKanban],
  ['Tasks', '/mentor/tasks', ClipboardList],
  ['Submissions', '/mentor/submissions', FileCheck2],
  ['Feedback', '/mentor/feedback', MessageSquare],
  ['Intern Feedback', '/mentor/intern-feedback', MessagesSquare],
  ['Evaluations', '/mentor/evaluations', CheckCircle2],
  ['Calendar', '/mentor/calendar', CalendarDays],
  ['Profile', '/mentor/profile', UserCheck],
];

const titles = {
  '/mentor/dashboard': ['Mentor Workspace', 'Here is what needs your guidance today.'],
  '/mentor/monitoring': ['Intern Monitoring', 'Daily status across every intern assigned to you.'],
  '/mentor/interns': ['My Interns', 'Track and guide your assigned learners.'],
  '/mentor/projects': ['Projects', 'Plan each internship as a project with master tasks and chunks.'],
  '/mentor/tasks': ['Task Management', 'Assign focused technical tasks and track delivery.'],
  '/mentor/submissions': ['Task Submissions', 'Review submitted code, designs, and reports.'],
  '/mentor/feedback': ['Feedback Center', 'Give interns actionable guidance to accelerate growth.'],
  '/mentor/intern-feedback': ['Intern Feedback', 'Hear what your interns say about the mentorship.'],
  '/mentor/evaluations': ['Progress Evaluations', 'Conduct formal performance reviews and score milestones.'],
  '/mentor/calendar': ['Schedule & Calendar', 'Upcoming 1-on-1 syncs, office hours, and review deadlines.'],
  '/mentor/profile': ['Mentor Profile', 'Manage your expertise, office hours, and notification settings.'],
};

// Fallback Mock Data for immediate production-readiness
function useMentorData(path) {
  const [state, setState] = useState({ data: null, loading: false, error: '' });

  useEffect(() => {
    let active = true;
    const loaders = {
      '/mentor/dashboard': fetchMentorDashboard,
      '/mentor/interns': fetchMentorInterns,
      '/mentor/tasks': fetchMentorTasks,
      '/mentor/submissions': fetchMentorSubmissions,
      '/mentor/feedback': fetchMentorFeedback,
      '/mentor/evaluations': fetchMentorEvaluations,
    };

    const loader = loaders[path];
    if (!loader) {
      // Defer out of the effect body to avoid a cascading synchronous render.
      Promise.resolve().then(() => {
        if (active) setState({ data: null, loading: false, error: '' });
      });
      return () => {
        active = false;
      };
    }

    loader()
      .then((data) => {
        if (active) setState({ data, loading: false, error: '' });
      })
      .catch((requestError) => {
        // Surface the failure — never mask a broken API with demo data.
        if (active) setState({ data: null, loading: false, error: requestError?.message || 'Unable to load this section. Please try again.' });
      });

    return () => {
      active = false;
    };
  }, [path]);

  return state;
}

function EmptyState({ title = 'No items found', message = 'When items are available, they will appear here.', action }) {
  return (
    <div className="mentor-empty-state">
      <Users size={28} />
      <strong>{title}</strong>
      <span>{message}</span>
      {action && <div style={{ marginTop: '10px' }}>{action}</div>}
    </div>
  );
}

function Metric({ label, value, icon: Icon, detail }) {
  return (
    <article className="mentor-metric">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="mentor-metric-icon">
          <Icon size={16} />
        </span>
        {detail && <span style={{ fontSize: '0.68rem', color: 'var(--provider-success)', fontWeight: 700 }}>{detail}</span>}
      </div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

/* Control-tower helpers: progress-state chips with evidence, never a bare label (§17). */
function ProgressStateChip({ state }) {
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

function AttentionRow({ item, onNavigate }) {
  const navigateFor = (kind) => {
    if (kind === 'review') return '/mentor/submissions';
    if (kind === 'evaluation') return '/mentor/evaluations';
    if (kind === 'stale_intern') return '/mentor/interns';
    return '/mentor/tasks';
  };
  return (
    <div className="orchestration-attention-row">
      <span className={`orchestration-sev orchestration-sev-${item.severity}`} aria-hidden="true">
        {item.severity === 1 ? '!' : item.severity === 2 ? 'R' : '•'}
      </span>
      <div className="orchestration-attention-main">
        <strong>{item.title}</strong>
        {item.evidence.map((line) => (
          <small key={line}>{line}</small>
        ))}
      </div>
      <button type="button" className="orchestration-attention-action" onClick={() => onNavigate(navigateFor(item.kind))}>
        {item.actionLabel} <ArrowRight size={12} />
      </button>
    </div>
  );
}

function Dashboard({ data, internFeedback, onNavigate, activityFeed = [], mentorTasks = [] }) {
  const internsList = data?.interns || [];
  const pendingReviews = data?.pending_reviews || [];
  const projectsSummary = data?.projects_summary || [];
  const recentActivity = activityFeed.length ? activityFeed : (data?.recent_activity || []);
  const pendingEvaluations = data?.pending_evaluations || [];

  const metrics = data?.metrics || {
    assigned_interns: internsList.length,
    pending_reviews: pendingReviews.filter((r) => r.status === 'pending').length,
    active_projects: projectsSummary.length,
    overall_progress: 0,
    feedback_entries: 0,
    upcoming_evaluations: 0,
  };

  /* Orchestration layer: progress states + Requires-Attention queue derived from
     real dashboard data (system states with evidence — prompt §17/§18). The
     authoritative AI monitoring service is a documented backend gap. */
  const attentionItems = buildAttentionQueue({
    tasks: mentorTasks,
    pendingReviews,
    evaluations: pendingEvaluations,
    interns: internsList,
  });
  const tasksByIntern = {};
  internsList.forEach((intern) => {
    tasksByIntern[intern.id] = mentorTasks.filter((t) => t.intern_id === intern.id);
  });
  const stateSummary = summarizeProgressStates(internsList, tasksByIntern);
  const attentionCount = attentionItems.length;

  return (
    <>
      <div className="mentor-metric-grid">
        <Metric label="Assigned Interns" value={metrics.assigned_interns} icon={Users} detail="Active" />
        <Metric label="Pending Reviews" value={metrics.pending_reviews} icon={FileCheck2} detail={metrics.pending_reviews > 0 ? `${metrics.pending_reviews} Action Required` : 'Up to date'} />
        <Metric label="Active Projects" value={metrics.active_projects || projectsSummary.length} icon={FolderKanban} detail="In Execution" />
        <Metric label="Overall Delivery" value={`${metrics.overall_progress || 0}%`} icon={CheckCircle2} detail="Completed" />
      </div>

      {/* Control tower: progress-state rollup + Requires Attention queue */}
      <section className="mentor-panel" aria-label="Requires attention">
        <div className="mentor-panel-heading">
          <div>
            <span>Requires Attention</span>
            <small>System-detected exceptions across your interns — review, understand, decide</small>
          </div>
          <span className="orchestration-state orchestration-state-info" style={{ alignSelf: 'center' }}>
            {attentionCount === 0 ? 'All clear' : `${attentionCount} item${attentionCount > 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="orchestration-state-strip" role="list" aria-label="Progress states">
          {[
            PROGRESS_STATES.ON_TRACK,
            PROGRESS_STATES.AHEAD,
            PROGRESS_STATES.AT_RISK,
            PROGRESS_STATES.BLOCKED,
            PROGRESS_STATES.INACTIVE,
            PROGRESS_STATES.COMPLETED,
          ].map((stateKey) => (
            <span role="listitem" key={stateKey} className={`orchestration-state orchestration-state-${stateKey}`}>
              {progressStateLabel(stateKey)}: <strong>{stateSummary.counts[stateKey] || 0}</strong>
            </span>
          ))}
        </div>

        {attentionItems.length === 0 ? (
          <EmptyState title="Nothing Requires Attention" message="No overdue tasks, pending reviews, or inactive interns detected. The orchestrator flags exceptions here automatically." />
        ) : (
          attentionItems.slice(0, 8).map((item) => (
            <AttentionRow key={item.id} item={item} onNavigate={onNavigate} />
          ))
        )}
      </section>

      <div className="mentor-content-grid">
        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Pending Reviews [{pendingReviews.length}]</span>
              <small>Task submissions awaiting code or document review</small>
            </div>
            <button type="button" onClick={() => onNavigate('/mentor/submissions')}>
              View All Submissions <ArrowRight size={13} />
            </button>
          </div>

          {pendingReviews.length ? (
            pendingReviews.map((item) => (
              <div className="mentor-attention" key={item.id}>
                <span className="mentor-attention-icon">
                  <FileCheck2 size={16} />
                </span>
                <div>
                  <strong>{item.intern_name}</strong>
                  <p>{item.title}</p>
                  <small>Submitted {formatActivityTime(item.submitted_at)}</small>
                </div>
                <button type="button" onClick={() => onNavigate('/mentor/submissions')}>
                  Review Now <ArrowRight size={12} />
                </button>
              </div>
            ))
          ) : (
            <EmptyState title="No Pending Reviews" message="All submitted tasks have been reviewed." />
          )}
        </section>

        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Assigned Interns Progress</span>
              <small>Overview of active learner task completion</small>
            </div>
            <button type="button" onClick={() => onNavigate('/mentor/interns')}>
              View All Interns <ArrowRight size={13} />
            </button>
          </div>

          <div className="mentor-intern-list">
            {internsList.slice(0, 4).map((intern) => {
              const completion = intern.progress_percent !== undefined
                ? intern.progress_percent
                : (intern.task_count ? Math.round((intern.completed_tasks / intern.task_count) * 100) : 0);
              const derived = deriveInternState({
                taskCount: intern.task_count || 0,
                completedTasks: intern.completed_tasks || 0,
                tasks: mentorTasks.filter((t) => t.intern_id === intern.id),
                lastActivity: intern.last_activity,
              });
              return (
                <article className="mentor-intern-card" key={intern.id}>
                  <div className="mentor-avatar">
                    {intern.full_name
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="mentor-intern-main">
                    <div className="mentor-row-heading">
                      <strong>{intern.full_name}</strong>
                      <ProgressStateChip state={derived.state} />
                    </div>
                    <p>{intern.completed_tasks || 0} of {intern.task_count || 0} tasks completed</p>
                    <div className="mentor-progress-label">
                      <span>Task Completion</span>
                      <strong>{completion}%</strong>
                    </div>
                    <div className="mentor-progress">
                      <span style={{ width: `${Math.min(100, Math.max(0, completion))}%` }} />
                    </div>
                  </div>
                  <button
                    className="mentor-icon-action"
                    type="button"
                    onClick={() => onNavigate(`/mentor/interns/${intern.id}`)}
                    aria-label={`View ${intern.full_name}`}
                  >
                    <ArrowRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mentor-content-grid">
        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Real-Time Activity Feed</span>
              <small>Live stream of task status changes, submissions, and reviews</small>
            </div>
          </div>

          <div className="mentor-activity-feed">
            {recentActivity.length ? (
              recentActivity.slice(0, 5).map((act) => (
                <div className="mentor-activity-item" key={act.id || act.activity_id}>
                  <div className="mentor-activity-icon">
                    <Zap size={15} />
                  </div>
                  <div className="mentor-activity-main">
                    <strong>{act.title}</strong>
                    <p>{act.description}</p>
                    <small>{formatActivityTime(act.created_at || act.timestamp)}</small>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No Recent Activity" message="Work activity events will appear here in real-time." />
            )}
          </div>
        </section>

        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Active Projects Progress</span>
              <small>Execution tasks completion by project</small>
            </div>
            <button type="button" onClick={() => onNavigate('/mentor/projects')}>
              Manage Projects <ArrowRight size={13} />
            </button>
          </div>

          <div className="mentor-intern-list">
            {projectsSummary.length ? (
              projectsSummary.slice(0, 4).map((proj) => (
                <div className="mentor-intern-card" key={proj.id}>
                  <div className="mentor-avatar" style={{ background: 'rgba(79, 70, 229, 0.1)', color: 'var(--mentor-accent)' }}>
                    <FolderKanban size={16} />
                  </div>
                  <div className="mentor-intern-main">
                    <div className="mentor-row-heading">
                      <strong>{proj.title}</strong>
                      <span className={`mentor-status ${proj.status}`}>
                        {proj.status}
                      </span>
                    </div>
                    <p>{proj.internship_title || 'Project'} • {proj.completed_tasks || 0}/{proj.total_tasks || 0} tasks completed</p>
                    <div className="mentor-progress-label">
                      <span>Project Progress</span>
                      <strong>{proj.progress_percent}%</strong>
                    </div>
                    <div className="mentor-progress">
                      <span style={{ width: `${Math.min(100, Math.max(0, proj.progress_percent))}%` }} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No Projects Created" message="Create projects to track execution progress." />
            )}
          </div>
        </section>
      </div>

      <section className="mentor-panel">
        <div className="mentor-panel-heading">
          <div>
            <span>Recent Intern Feedback</span>
            <small>What your interns say about the mentorship experience</small>
          </div>
          <button type="button" onClick={() => onNavigate('/mentor/intern-feedback')}>
            View All Intern Feedback <ArrowRight size={13} />
          </button>
        </div>

        {internFeedback?.error ? (
          <p className="mentor-error">We couldn&apos;t load intern feedback right now.</p>
        ) : internFeedback?.loading ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--provider-text-muted)' }}>Loading intern feedback...</p>
        ) : internFeedback?.items?.length ? (
          internFeedback.items.slice(0, 3).map((item) => (
            <div className="mentor-feedback-row" key={item.id}>
              <div>
                <strong>
                  {item.intern_name} • {INTERN_FEEDBACK_TYPE_LABELS[item.feedback_type] || 'Feedback'}
                </strong>
                <p style={{ margin: '2px 0' }}>{item.message}</p>
                <small>
                  Submitted {formatFeedbackDate(item.created_at)}
                  {item.internship_title ? ` • ${item.internship_title}` : ''}
                </small>
              </div>
              {item.rating ? (
                <strong style={{ color: '#d97706', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{item.rating}/5</strong>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState
            title="No Intern Feedback Yet"
            message="No mentor feedback has been submitted yet. When your interns share feedback, it will appear here."
          />
        )}
      </section>
    </>
  );
}

function InternsPage({ items = [], onNavigate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const internsList = items;

  const filtered = internsList.filter((intern) => {
    const q = search.toLowerCase().trim();
    const matchesQ = !q || intern.full_name.toLowerCase().includes(q) || intern.email.toLowerCase().includes(q);
    const matchesS = !statusFilter || intern.status === statusFilter;
    return matchesQ && matchesS;
  });

  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    // Reset to page 1 when filters change (deferred to avoid a cascading synchronous render).
    Promise.resolve().then(() => setCurrentPage(1));
  }, [search, statusFilter]);

  return (
    <div>
      <div className="provider-workspace-toolbar" style={{ marginBottom: '18px' }}>
        <div className="provider-search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search interns by name, email, or program..."
          />
        </div>

        <select className="provider-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <section className="mentor-panel">
        {internsList.length === 0 && !search && !statusFilter && (
          <div
            className="floating-info-popup animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(56, 189, 248, 0.15)',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '20px',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
                flexShrink: 0,
              }}
            >
              <Users size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: '#f8fafc' }}>
                No Interns Assigned Yet
              </h4>
              <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#94a3b8' }}>
                You have not been assigned any interns till now. Intern assignments are managed by your program provider.
              </p>
            </div>
          </div>
        )}
        {paginated.length === 0 ? (
          <EmptyState
            title="No Interns Assigned"
            message={
              internsList.length === 0
                ? "You have not been assigned any interns till now."
                : "No assigned interns match your search parameters."
            }
          />
        ) : (
          <>
            <div className="mentor-intern-list">
              {paginated.map((intern) => {
                const completion = intern.task_count
                  ? Math.round((intern.completed_tasks / intern.task_count) * 100)
                  : 0;
                const derived = deriveInternState({
                  taskCount: intern.task_count || 0,
                  completedTasks: intern.completed_tasks || 0,
                  lastActivity: intern.last_activity,
                });
                return (
                  <article className="mentor-intern-card" key={intern.id}>
                    <div className="mentor-avatar">
                      {intern.full_name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="mentor-intern-main">
                      <div className="mentor-row-heading">
                        <strong>{intern.full_name}</strong>
                        <ProgressStateChip state={derived.state} />
                      </div>
                      <p>{intern.email}{intern.internship_title ? ` • ${intern.internship_title}` : ''}</p>
                      <div className="mentor-progress-label">
                        <span>Task Completion ({intern.completed_tasks} / {intern.task_count} completed)</span>
                        <strong>{completion}%</strong>
                      </div>
                      <div className="mentor-progress">
                        <span style={{ width: `${completion}%` }} />
                      </div>
                      <details className="orchestration-evidence">
                        <summary>Why this state?</summary>
                        <ul>
                          {derived.evidence.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </details>
                    </div>
                    <button
                      className="mentor-primary-button"
                      type="button"
                      style={{ height: '34px', minHeight: '34px', fontSize: '0.72rem' }}
                      onClick={() => onNavigate(`/mentor/interns/${intern.id}`)}
                    >
                      View Profile <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })}
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10]}
            />
          </>
        )}
      </section>
    </div>
  );
}

function InternDetailPage({ internId, onNavigate, onRecorded }) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [weeklyReports, setWeeklyReports] = useState(null);
  const [blockers, setBlockers] = useState(null);

  // Observation form
  const [obsSkill, setObsSkill] = useState('');
  const [obsLevel, setObsLevel] = useState('developing');
  const [obsNote, setObsNote] = useState('');
  const [obsTaskId, setObsTaskId] = useState('');
  const [isSavingObs, setIsSavingObs] = useState(false);
  const [obsMessage, setObsMessage] = useState(null); // {tone, text}

  const loadDetail = () => {
    if (!internId) {
      setError('No intern selected.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setWeeklyReports(null);
    setBlockers(null);
    fetchMentorInternDetail(internId)
      .then(async (data) => {
        setDetail(data);
        setError('');
        // Orchestration evidence: AI/prepared weekly reports + blocker reports
        // the intern filed through the mentor-feedback channel.
        const assignmentId = data.assignment?.id || null;
        const [weeklyRes, feedbackRes] = await Promise.all([
          assignmentId
            ? fetchAssignmentWeeklyReports(assignmentId).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] }),
          fetchReceivedFeedback().catch(() => ({ items: [] })),
        ]);
        setWeeklyReports(weeklyRes.items || []);
        const internName = data.intern?.full_name || '';
        setBlockers(
          (feedbackRes.items || []).filter(
            (item) => item.intern_name === internName && String(item.message || '').startsWith('[Blocker]'),
          ),
        );
      })
      .catch((requestError) => setError(requestError?.message || 'Unable to load this intern.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadDetail);
  }, [internId]);

  if (isLoading) {
    return (
      <div className="mentor-panel">
        <p className="provider-body-copy">Loading intern profile...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mentor-panel">
        <div className="mentor-panel-heading">
          <div>
            <span>Intern profile</span>
            <small>Unavailable</small>
          </div>
          <button className="mentor-back-link" type="button" onClick={() => onNavigate('/mentor/interns')}>
            <ArrowLeft size={14} /> Back to My Interns
          </button>
        </div>
        <p className="mentor-error">{error || 'This intern could not be loaded.'}</p>
        <button type="button" className="provider-quiet-button" onClick={loadDetail}>Retry</button>
      </div>
    );
  }

  const name = detail.intern.full_name;
  const taskCount = detail.tasks.length;
  const completedCount = detail.tasks.filter((t) => t.status === 'completed').length;
  const pendingSubmissions = detail.submissions.filter((s) => s.status === 'pending').length;
  const derived = deriveInternState({
    taskCount,
    completedTasks: completedCount,
    tasks: detail.tasks,
    lastActivity: null,
  });

  const handleRecordObservation = async (e) => {
    e.preventDefault();
    if (!obsSkill.trim() || isSavingObs) return;
    setIsSavingObs(true);
    setObsMessage(null);
    try {
      await createSkillObservation(internId, {
        skill: obsSkill,
        level: obsLevel,
        note: obsNote,
        taskId: obsTaskId ? Number(obsTaskId) : null,
      });
      setObsMessage({ tone: 'success', text: `Observation saved — ${obsSkill.trim()} (${obsLevel}). The intern can now see this skill as mentor-observed.` });
      setObsSkill('');
      setObsNote('');
      setObsTaskId('');
      setObsLevel('developing');
      loadDetail();
      if (onRecorded) onRecorded();
    } catch (requestError) {
      setObsMessage({ tone: 'error', text: requestError?.message || 'Could not save the observation.' });
    } finally {
      setIsSavingObs(false);
    }
  };

  return (
    <>
      <div className="mentor-detail-top">
        <div>
          <button className="mentor-back-link" type="button" onClick={() => onNavigate('/mentor/interns')}>
            <ArrowLeft size={14} /> Back to My Interns
          </button>
          <h2>{name}</h2>
          <p>{detail.intern.email}{detail.assignment?.internship_title ? ` • ${detail.assignment.internship_title}` : ''}</p>
        </div>
        {detail.assignment && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className="mentor-status active">{detail.assignment.status?.replace('_', ' ')}</span>
            <ProgressStateChip state={derived.state} />
            <details className="orchestration-evidence">
              <summary>Why this state?</summary>
              <ul>
                {derived.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>

      <div className="mentor-metric-grid">
        <Metric label="Assigned Tasks" value={taskCount} icon={ClipboardList} />
        <Metric label="Completed Tasks" value={completedCount} icon={CheckCircle2} />
        <Metric label="Pending Reviews" value={pendingSubmissions} icon={FileCheck2} />
        <Metric label="Feedback Given" value={detail.feedback.length} icon={MessageSquare} />
      </div>

      {/* Blocker reports the intern filed (structured [Blocker] reports via intern→mentor feedback) */}
      <section className="mentor-panel" style={{ borderColor: blockers?.length ? 'rgba(234,88,12,0.5)' : undefined }}>
        <div className="mentor-panel-heading">
          <div>
            <span>Blocker Reports</span>
            <small>Reported by the intern through “Report a blocker” — help them unblock first</small>
          </div>
          {blockers?.length ? <span className="orchestration-state orchestration-state-blocked">{blockers.length} open</span> : null}
        </div>
        {blockers === null ? (
          <p className="provider-body-copy" style={{ fontSize: '0.8rem' }}>Loading blocker reports…</p>
        ) : blockers.length === 0 ? (
          <EmptyState title="No Blocker Reports" message="Nothing is currently blocking this intern." />
        ) : (
          blockers.map((blocker) => {
            const [, typeLine] = String(blocker.message).split('\n');
            const body = String(blocker.message).split('\n').slice(2).join('\n').trim();
            return (
              <div className="orchestration-attention-row" key={blocker.id}>
                <span className="orchestration-sev orchestration-sev-1" aria-hidden="true">!</span>
                <div className="orchestration-attention-main">
                  <strong>{typeLine ? typeLine.replace('Type: ', '') : 'Blocker'}</strong>
                  <small>{blocker.created_at ? new Date(blocker.created_at).toLocaleString() : ''}</small>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>{body}</p>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* AI / prepared weekly progress reports — real backend payloads, labeled by source */}
      <section className="mentor-panel">
        <div className="mentor-panel-heading">
          <div>
            <span>Weekly Progress Reports</span>
            <small>Generated by the InternFlow AI engine from real tasks, attendance, and feedback data</small>
          </div>
        </div>
        {weeklyReports === null ? (
          <p className="provider-body-copy" style={{ fontSize: '0.8rem' }}>Loading weekly reports…</p>
        ) : weeklyReports.length === 0 ? (
          <EmptyState
            title="No Weekly Reports Yet"
            message="Weekly progress reports are generated automatically for active internships; the first one will appear here."
          />
        ) : (
          weeklyReports.slice(0, 4).map((report) => (
            <div className="orchestration-attention-row" key={report.id} style={{ alignItems: 'flex-start' }}>
              <span className="orchestration-sev orchestration-sev-4" aria-hidden="true">✦</span>
              <div className="orchestration-attention-main">
                <strong>
                  Week {report.week_start} → {report.week_end}
                  <span className="orchestration-ai-note" style={{ marginLeft: 8 }}>
                    {report.ai_status === 'fallback' ? 'AI summary unavailable — structured data summary' : 'AI-generated'} · Needs mentor review
                  </span>
                </strong>
                <p style={{ margin: '4px 0', fontSize: '0.82rem' }}>{report.summary}</p>
                {(report.mentor_attention_items || []).length > 0 && (
                  <small style={{ display: 'block', color: '#9a3412', fontWeight: 600 }}>
                    Attention: {report.mentor_attention_items.join('; ')}
                  </small>
                )}
                {(report.challenges || []).length > 0 && (
                  <small style={{ display: 'block' }}>Challenges: {report.challenges.join('; ')}</small>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <div className="mentor-content-grid">
        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Tasks & Submissions</span>
              <small>Live task status with submission state</small>
            </div>
            <button type="button" onClick={() => onNavigate('/mentor/tasks')}>
              Assign New Task <Plus size={13} />
            </button>
          </div>

          {detail.tasks.length === 0 ? (
            <EmptyState
              title="No tasks assigned yet"
              message={`Assign the first deliverable to ${name.split(' ')[0]} from the Tasks page.`}
            />
          ) : (
            <div className="mentor-task-list">
              {detail.tasks.map((task) => (
                <div className="mentor-task-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.description}{task.due_date ? ` • Due ${task.due_date}` : ''}</small>
                    {task.submission_status && (
                      <small style={{ display: 'block', marginTop: 2, fontWeight: 700 }}>
                        Submission: {task.submission_status === 'pending' ? 'awaiting your review' : task.submission_status}
                      </small>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {deriveTaskInsights(task).isOverdue && (
                      <span className="orchestration-state orchestration-state-at_risk">Overdue</span>
                    )}
                    <span className={`mentor-status ${task.status}`}>{task.status?.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mentor-panel-heading" style={{ marginTop: '16px' }}>
            <div>
              <span>Skills on record</span>
              <small>Self-declared and evidence-backed</small>
            </div>
          </div>
          {(detail.skills || []).length === 0 ? (
            <p className="provider-body-copy" style={{ fontSize: '0.82rem', opacity: 0.7 }}>
              No skills recorded yet — record an observation below.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {detail.skills.map((s) => (
                <SkillChip
                  key={s.id}
                  name={s.name}
                  variant={s.source === 'mentor_observation' ? 'observed' : 'declared'}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Record Skill Observation</span>
              <small>What you observed {name.split(' ')[0]} doing — saved as evidence on their profile</small>
            </div>
          </div>

          {obsMessage && (
            <div
              className={`provider-status-pill ${obsMessage.tone === 'success' ? 'success' : 'warning'}`}
              style={{ marginBottom: '12px', display: 'inline-flex', padding: '6px 12px' }}
              role={obsMessage.tone === 'success' ? 'status' : 'alert'}
            >
              {obsMessage.tone === 'success' ? <CheckCircle2 size={14} style={{ marginRight: '6px' }} /> : <Zap size={14} style={{ marginRight: '6px' }} />}
              {obsMessage.text}
            </div>
          )}

          <form onSubmit={handleRecordObservation} style={{ display: 'grid', gap: '10px' }}>
            <label style={{ fontSize: '0.8rem' }}>
              Skill observed *
              <input
                type="text"
                value={obsSkill}
                onChange={(e) => setObsSkill(e.target.value)}
                placeholder="e.g. Python, REST API design, pytest"
                required
                minLength={2}
                maxLength={60}
                className="provider-select"
                style={{ width: '100%', marginTop: '4px' }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Level
              <select
                value={obsLevel}
                onChange={(e) => setObsLevel(e.target.value)}
                className="provider-select"
                style={{ width: '100%', marginTop: '4px' }}
              >
                {OBSERVATION_LEVELS.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                ))}
              </select>
            </label>
            {(detail.tasks.length > 0) && (
              <label style={{ fontSize: '0.8rem' }}>
                Related task (optional)
                <select
                  value={obsTaskId}
                  onChange={(e) => setObsTaskId(e.target.value)}
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  <option value="">No specific task</option>
                  {detail.tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ fontSize: '0.8rem' }}>
              What did you observe?
              <textarea
                rows={3}
                value={obsNote}
                onChange={(e) => setObsNote(e.target.value)}
                placeholder="Concrete evidence: what they built, how they debugged, code quality observed..."
                className="provider-select"
                style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
                maxLength={2000}
              />
            </label>
            <button className="mentor-primary-button" type="submit" disabled={isSavingObs || !obsSkill.trim()}>
              <ShieldCheck size={15} /> {isSavingObs ? 'Saving observation…' : 'Save Observation'}
            </button>
          </form>

          <div className="mentor-panel-heading" style={{ marginTop: '18px' }}>
            <div>
              <span>Feedback history</span>
              <small>Everything you have shared with this intern</small>
            </div>
          </div>
          {detail.feedback.length === 0 ? (
            <p className="provider-body-copy" style={{ fontSize: '0.82rem', opacity: 0.7 }}>
              No feedback given yet — use the Feedback page to send structured guidance.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {detail.feedback.slice(0, 4).map((fb) => (
                <div key={fb.id} style={{ padding: '10px 12px', border: '1px solid var(--provider-border)', borderRadius: '10px' }}>
                  <strong style={{ fontSize: '0.82rem' }}>{fb.task_title || 'General feedback'}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#334155' }}>"{fb.feedback}"</p>
                  <small style={{ color: '#64748b' }}>{fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}</small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function TasksPage({ data = [], interns = [], onCreated }) {
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const taskList = data;
  const internList = interns;

  const filtered = taskList.filter((t) => {
    const q = search.toLowerCase().trim();
    const matchesQ = !q || t.title.toLowerCase().includes(q) || (t.intern_name && t.intern_name.toLowerCase().includes(q));
    const matchesS = !statusFilter || t.status === statusFilter;
    return matchesQ && matchesS;
  });

  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await createMentorTask({ ...form, intern_id: Number(form.intern_id) });
      setFormOpen(false);
      onCreated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mentor-page-action" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div className="provider-workspace-toolbar" style={{ margin: 0 }}>
          <div className="provider-search-field">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks by title or intern..." />
          </div>
          <select className="provider-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Task Statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Submitted</option>
            <option value="completed">Completed</option>
            <option value="changes_requested">Changes Requested</option>
          </select>
        </div>

        <button className="mentor-primary-button" type="button" onClick={() => setFormOpen((val) => !val)}>
          <Plus size={16} /> Assign New Task
        </button>
      </div>

      {formOpen && (
        <form className="mentor-panel mentor-form animate-fade-in" onSubmit={submit}>
          <label>
            Select Assigned Intern *
            <select name="intern_id" required>
              <option value="">Select intern</option>
              {internList.map((intern) => (
                <option value={intern.id} key={intern.id}>
                  {intern.full_name} ({intern.program || 'Engineering'})
                </option>
              ))}
            </select>
          </label>
          <label>
            Task Title *
            <input name="title" required placeholder="e.g. Implement JWT Authentication middleware" />
          </label>
          <label className="wide">
            Description & Clear Guidance *
            <textarea name="description" required rows="3" placeholder="Explain requirements, deliverables, and pull request guidelines..." />
          </label>
          <label>
            Due Date
            <input name="due_date" type="date" />
          </label>
          <label>
            Priority Level
            <select name="priority" defaultValue="normal">
              <option value="low">Low Priority</option>
              <option value="normal">Normal Priority</option>
              <option value="high">High Priority</option>
            </select>
          </label>
          {error && <p className="mentor-error">{error}</p>}
          <div className="wide" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="provider-quiet-button" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button className="mentor-primary-button" disabled={saving} type="submit">
              {saving ? 'Assigning Task...' : 'Assign Task'}
            </button>
          </div>
        </form>
      )}

      <section className="mentor-panel">
        {paginated.length ? (
          <>
            <div className="mentor-task-list">
              {paginated.map((task) => (
                <div className="mentor-task-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      Assigned to: <strong>{task.intern_name || 'Maya Sharma'}</strong> • Due: {task.due_date || 'Oct 15, 2026'} • Priority: {task.priority || 'normal'}
                    </small>
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--provider-text-soft)' }}>{task.description}</p>
                  </div>
                  <span className={`mentor-status ${task.status}`}>{task.status?.replace('_', ' ')}</span>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10]}
            />
          </>
        ) : (
          <EmptyState title="No Tasks Found" message="No assigned tasks match your active filters." />
        )}
      </section>
    </>
  );
}

function SubmissionsPage({ data = [], onUpdated }) {
  const [error, setError] = useState('');
  const [modal, setModal] = useState({ open: false, id: null, decision: '' });
  const [search, setSearch] = useState('');

  const submissionList = data;

  const filtered = submissionList.filter(
    (s) => !search || s.intern_name?.toLowerCase().includes(search.toLowerCase()) || s.title?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDecision = async () => {
    setError('');
    try {
      await reviewMentorSubmission(modal.id, modal.decision);
      setModal({ open: false, id: null, decision: '' });
      onUpdated();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <>
      <div className="provider-workspace-toolbar" style={{ marginBottom: '18px' }}>
        <div className="provider-search-field">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search submissions by intern or task..." />
        </div>
      </div>

      <p className="orchestration-ai-note" style={{ marginBottom: '14px' }}>
        AI pre-review of submissions is not available yet — review every deliverable yourself. Your Approve / Request Changes decision is always the final human decision.
      </p>

      <section className="mentor-panel">
        {error && <p className="mentor-error">{error}</p>}
        {filtered.length ? (
          filtered.map((item) => (
            <div className="mentor-task-row" key={item.id} style={{ alignItems: 'flex-start', padding: '14px 0' }}>
              <div>
                <strong>
                  {item.intern_name} • {item.title}
                </strong>
                <small>Submitted: {item.submitted_at}</small>
                <div style={{ marginTop: '8px', padding: '10px 14px', background: '#fff', border: '1px solid var(--provider-border)', borderRadius: '8px', fontSize: '0.82rem' }}>
                  {item.content}
                </div>
              </div>
              <div className="mentor-row-actions">
                <button type="button" onClick={() => setModal({ open: true, id: item.id, decision: 'approved' })}>
                  <CheckCircle2 size={15} /> Approve
                </button>
                <button
                  type="button"
                  style={{ color: '#d97706' }}
                  onClick={() => setModal({ open: true, id: item.id, decision: 'changes_requested' })}
                >
                  <XCircle size={15} /> Request Changes
                </button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No Submissions Queue" message="There are currently no task submissions waiting for review." />
        )}

        <ConfirmationModal
          isOpen={modal.open}
          onClose={() => setModal({ open: false, id: null, decision: '' })}
          onConfirm={handleDecision}
          title={modal.decision === 'approved' ? 'Approve Task Submission' : 'Request Changes'}
          message={`Are you sure you want to mark this submission as ${
            modal.decision === 'approved' ? 'Approved' : 'Changes Requested'
          }?`}
          confirmLabel={modal.decision === 'approved' ? 'Approve' : 'Request Changes'}
          tone={modal.decision === 'approved' ? 'info' : 'warning'}
        />
      </section>
    </>
  );
}

function FeedbackPage({ data = [], interns = [], onCreated }) {
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const feedbackList = data;
  const internList = interns;

  const filtered = feedbackList.filter(
    (f) => !search || f.intern_name?.toLowerCase().includes(search.toLowerCase()) || f.feedback?.toLowerCase().includes(search.toLowerCase())
  );

  const submit = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError('');
    setSubmitting(true);
    const form = Object.fromEntries(new FormData(formEl));
    try {
      await createMentorFeedback({
        ...form,
        intern_id: Number(form.intern_id),
        task_id: form.task_id ? Number(form.task_id) : null,
      });
      formEl.reset();
      setToast('Feedback submitted successfully.');
      setTimeout(() => setToast(''), 3000);
      if (onCreated) onCreated();
    } catch (requestError) {
      setError(requestError.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <form className="mentor-panel mentor-form animate-fade-in" onSubmit={submit}>
        <div className="wide">
          <h2 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--mentor-text)' }}>Submit Structuring Guidance & Feedback</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--provider-text-muted)' }}>
            Provide clear, actionable feedback to help interns improve deliverable quality.
            An AI feedback draft assistant is planned but not connected yet — everything you write here is your own.
          </p>
        </div>

        {toast && (
          <div className="wide provider-status-pill success" style={{ display: 'inline-flex' }}>
            <CheckCircle2 size={14} style={{ marginRight: '4px' }} /> {toast}
          </div>
        )}

        <label>
          Select Intern *
          <select name="intern_id" required>
            <option value="">Select assigned intern</option>
            {internList.map((intern) => (
              <option value={intern.id} key={intern.id}>
                {intern.full_name} ({intern.program || 'Engineering'})
              </option>
            ))}
          </select>
        </label>

        <label className="wide">
          Core Feedback Message *
          <textarea name="feedback" required rows="3" placeholder="What key guidance should the intern focus on?" />
        </label>

        <label>
          Observed Strengths
          <textarea name="strengths" rows="2" placeholder="e.g. Clean code structure, good test coverage" />
        </label>

        <label>
          Areas for Improvement
          <textarea name="improvements" rows="2" placeholder="e.g. Add JSDoc comments, optimize database queries" />
        </label>

        <label className="wide">
          Recommended Next Steps
          <textarea name="next_steps" rows="2" placeholder="Actionable steps for next sprint..." />
        </label>

        {error && <p className="mentor-error wide">{error}</p>}

        <button className="mentor-primary-button wide" type="submit" disabled={submitting}>
          <MessageSquare size={15} /> {submitting ? 'Submitting...' : 'Submit Feedback Entry'}
        </button>
      </form>

      <div className="provider-workspace-toolbar" style={{ margin: '20px 0 14px' }}>
        <div className="provider-search-field">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search feedback history..." />
        </div>
      </div>

      <section className="mentor-panel">
        <div className="mentor-panel-heading">
          <span>Feedback History</span>
        </div>

        {filtered.length ? (
          filtered.map((item) => (
            <div className="mentor-feedback-row" key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--provider-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{item.intern_name}</strong>
                <small>{item.created_at}</small>
              </div>
              <p style={{ margin: '6px 0', fontSize: '0.84rem' }}>{item.feedback}</p>
              {item.strengths && (
                <div style={{ marginTop: '4px', fontSize: '0.74rem', color: 'var(--provider-success)' }}>
                  <strong>Strengths:</strong> {item.strengths}
                </div>
              )}
            </div>
          ))
        ) : (
          <EmptyState title="No Feedback Entries" message="No feedback history recorded yet." />
        )}
      </section>
    </>
  );
}

const INTERN_FEEDBACK_TYPE_LABELS = {
  general: 'General Feedback',
  session: 'Session Feedback',
  guidance: 'Guidance',
  communication: 'Communication',
  technical_guidance: 'Technical Guidance',
  other: 'Other',
};

function formatFeedbackDate(value) {
  if (!value) return '';
  const parsed = new Date(String(value).includes('T') ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * InternFeedbackPage — feedback submitted BY interns ABOUT their mentorship.
 * Server-scoped: the API only ever returns records addressed to the authenticated mentor.
 */
function InternFeedbackPage({ data, onRetry }) {
  const [search, setSearch] = useState('');

  const feedbackList = data.items || [];
  const filtered = feedbackList.filter((item) => {
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      item.intern_name?.toLowerCase().includes(query) ||
      item.message?.toLowerCase().includes(query) ||
      (item.internship_title || '').toLowerCase().includes(query)
    );
  });

  return (
    <>
      <div className="provider-workspace-toolbar" style={{ marginBottom: '18px' }}>
        <div className="provider-search-field">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search intern feedback by name, program, or message..."
          />
        </div>
      </div>

      <section className="mentor-panel">
        <div className="mentor-panel-heading">
          <div>
            <span>Feedback From Your Interns</span>
            <small>Submitted by interns about their mentorship experience</small>
          </div>
        </div>

        {data.error ? (
          <>
            <p className="mentor-error">We couldn&apos;t load intern feedback right now. Please try again.</p>
            <button className="provider-quiet-button" type="button" onClick={onRetry}>
              Retry
            </button>
          </>
        ) : data.loading ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--provider-text-muted)' }}>Loading intern feedback...</p>
        ) : filtered.length ? (
          filtered.map((item) => (
            <article
              className="mentor-feedback-row"
              key={item.id}
              style={{ padding: '14px 0', borderBottom: '1px solid var(--provider-border)' }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <div className="mentor-avatar">
                  {(item.intern_name || 'IF')
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <strong>{item.intern_name}</strong>
                <span className="mentor-status">{INTERN_FEEDBACK_TYPE_LABELS[item.feedback_type] || 'Feedback'}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--provider-text-muted)' }}>
                  Submitted {formatFeedbackDate(item.created_at)}
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--mentor-text)' }}>
                {item.message}
              </p>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                {item.rating ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#d97706',
                      fontWeight: 800,
                      fontSize: '0.74rem',
                    }}
                  >
                    <Star size={13} /> {item.rating}/5 rating
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--provider-text-muted)' }}>No rating provided</span>
                )}
                {item.internship_title && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.72rem',
                      color: 'var(--provider-text-muted)',
                    }}
                  >
                    <GraduationCap size={12} /> {item.internship_title}
                  </span>
                )}
                <span className="mentor-status">{item.status?.replace('_', ' ') || 'submitted'}</span>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="No Intern Feedback Yet"
            message="No mentor feedback has been submitted yet. When your assigned interns share feedback about their mentorship, it will appear here."
          />
        )}
      </section>
    </>
  );
}

function EvaluationsPage({ data = [], interns = [], onCreated }) {
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');

  const evaluationList = data;
  const internList = interns;

  const filtered = evaluationList.filter(
    (e) => !search || e.intern_name?.toLowerCase().includes(search.toLowerCase()) || e.summary?.toLowerCase().includes(search.toLowerCase())
  );

  const submit = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = Object.fromEntries(new FormData(formEl));
    try {
      await createMentorEvaluation({
        ...form,
        intern_id: Number(form.intern_id),
        score: form.score ? Number(form.score) : null,
      });
      formEl.reset();
      setToast('Evaluation recorded successfully.');
      setTimeout(() => setToast(''), 3000);
      if (onCreated) onCreated();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <form className="mentor-panel mentor-form animate-fade-in" onSubmit={submit}>
        <div className="wide">
          <h2 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--mentor-text)' }}>Submit Formal Progress Review</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--provider-text-muted)' }}>
            Score milestone completion and submit progress evaluations for program records.
          </p>
        </div>

        {toast && (
          <div className="wide provider-status-pill success" style={{ display: 'inline-flex' }}>
            <CheckCircle2 size={14} style={{ marginRight: '4px' }} /> {toast}
          </div>
        )}

        <label>
          Select Intern *
          <select name="intern_id" required>
            <option value="">Select assigned intern</option>
            {internList.map((intern) => (
              <option value={intern.id} key={intern.id}>
                {intern.full_name} ({intern.program || 'Engineering'})
              </option>
            ))}
          </select>
        </label>

        <label>
          Overall Performance Score (0 – 100%)
          <input name="score" type="number" min="0" max="100" defaultValue="88" placeholder="e.g. 88" />
        </label>

        <label className="wide">
          Performance Summary & Evaluation Notes *
          <textarea name="summary" required rows="3" placeholder="Provide a summary of intern progress and technical growth..." />
        </label>

        <label>
          Target Review Date
          <input name="due_date" type="date" />
        </label>

        <button className="mentor-primary-button wide" type="submit">
          <CheckCircle2 size={15} /> Record Evaluation
        </button>
      </form>

      <div className="provider-workspace-toolbar" style={{ margin: '20px 0 14px' }}>
        <div className="provider-search-field">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search evaluations..." />
        </div>
      </div>

      <section className="mentor-panel">
        <div className="mentor-panel-heading">
          <span>Evaluation Records</span>
        </div>

        {filtered.length ? (
          filtered.map((item) => (
            <div className="mentor-task-row" key={item.id}>
              <div>
                <strong>{item.intern_name}</strong>
                <small>{item.summary}</small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {item.score && <strong style={{ color: 'var(--mentor-accent)', fontSize: '1.1rem' }}>{item.score}%</strong>}
                <span className={`mentor-status ${item.status?.toLowerCase()}`}>{item.status}</span>
              </div>
            </div>
          ))
        ) : (
          <EmptyState title="No Evaluation Records" message="No formal evaluations found." />
        )}
      </section>
    </>
  );
}

function CalendarPage() {
  // The backend has no calendar/scheduling engine yet. Per product rules this
  // page is an honest upcoming-capability state, not a fake booking UI.
  return (
    <>
      <div className="mentor-page-action" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--provider-text-soft)' }}>
          1-on-1 syncs, code review slots, and office hours scheduling.
        </p>
      </div>
      <EmptyState
        title="Calendar scheduling is not available yet"
        message="The backend has no calendar booking engine yet, so no sessions can be booked here. Until then, coordinate session times with your interns directly — their contact details are on the Interns page."
      />
    </>
  );
}

function MentorProfilePage() {
  const session = getSession();
  const user = session?.user || {};

  // The backend has no mentor profile-update endpoint yet, so this page shows
  // the real account record read-only instead of pretending to save edits.
  return (
    <div className="mentor-panel mentor-form animate-fade-in">
      <div className="wide">
        <h2 style={{ margin: '0 0 6px', fontSize: '1rem', color: 'var(--mentor-text)' }}>Mentor Profile</h2>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--provider-text-muted)' }}>
          Your account details as registered with InternFlow. Profile editing is not available yet —
          contact your provider if these details need to change.
        </p>
      </div>

      <label>
        Full Name
        <input value={user.full_name || '—'} readOnly />
      </label>

      <label>
        Email Address
        <input value={user.email || '—'} readOnly />
      </label>

      <label>
        Role
        <input value="Mentor" readOnly />
      </label>

      <label>
        Organization
        <input value={user.organization || '—'} readOnly />
      </label>

      <div className="wide provider-status-pill muted" style={{ display: 'inline-flex' }}>
        Domain expertise, bio, and office-hours editing: not available yet.
      </div>
    </div>
  );
}

export default function MentorWorkspacePage(props) {
  // '/mentor' is the workspace root — render the dashboard, not a blank shell.
  const path = props.path === '/mentor' ? '/mentor/dashboard' : props.path;
  const onNavigate = props.onNavigate;
  const session = getSession();
  const [refresh, setRefresh] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data, error } = useMentorData(path);
  const [interns, setInterns] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('offline');
  const [liveActivities, setLiveActivities] = useState([]);

  useEffect(() => {
    fetchMentorInterns()
      .then((result) => setInterns(result.items || []))
      .catch(() => setInterns([]));
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeToMentorMonitoring({
      onConnect: () => setConnectionStatus('connected'),
      onDisconnect: () => setConnectionStatus('reconnecting'),
      onReconnect: () => {
        setConnectionStatus('connected');
        setRefresh((val) => val + 1);
      },
      onEvent: (event) => {
        if (event) {
          setLiveActivities((prev) => [
            event,
            ...prev.filter((item) => (item.id || item.activity_id) !== (event.id || event.activity_id)),
          ]);
        }
        setRefresh((val) => val + 1);
      },
    });

    return () => unsubscribe();
  }, []);

  // Intern → mentor feedback: fetched for the dedicated page and the dashboard preview.
  // While refetching, the previous list stays visible (no flicker); first mount shows the loading state.
  const [internFeedback, setInternFeedback] = useState({ items: [], loading: true, error: '' });
  const [mentorTasks, setMentorTasks] = useState([]);

  useEffect(() => {
    let active = true;
    fetchMentorTasks()
      .then((result) => {
        if (active) setMentorTasks(result.items || []);
      })
      .catch(() => {
        if (active) setMentorTasks([]);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const isRelevantPath = path === '/mentor/intern-feedback' || path === '/mentor/dashboard';
    if (!isRelevantPath) return undefined;
    let active = true;
    fetchReceivedFeedback()
      .then((result) => {
        if (active) setInternFeedback({ items: result.items || [], loading: false, error: '' });
      })
      .catch(() => {
        if (active) {
          setInternFeedback({ items: [], loading: false, error: 'Unable to load intern feedback.' });
        }
      });
    return () => {
      active = false;
    };
  }, [path, refresh]);

  const title = titles[path] || titles['/mentor/dashboard'];
  const isInternDetail = path.startsWith('/mentor/interns/');
  const detailInternId = isInternDetail ? path.split('/').pop() : null;

  const reload = () => setRefresh((val) => val + 1);

  const logout = () => {
    clearSession();
    onNavigate('/login');
  };

  return (
    <div className="provider-app-shell mentor-app-shell">
      <MentorBackground />

      <aside className={`provider-workspace-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div>
          <a
            className="provider-brand"
            href="/mentor/dashboard"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/mentor/dashboard');
            }}
          >
            <img src={logoUrl} alt="InternFlow logo" className="provider-logo-img" />
            <span className="provider-brand-text">InternFlow</span>
          </a>

          <nav className="provider-nav" aria-label="Mentor navigation">
            {MENTOR_NAV.map(([label, itemPath, Icon]) => {
              const isActive = path === itemPath || (itemPath !== '/mentor/dashboard' && path.startsWith(itemPath));
              return (
                <button
                  className={`provider-nav-item ${isActive ? 'is-active' : ''}`}
                  type="button"
                  key={itemPath}
                  title={label}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate(itemPath);
                  }}
                >
                  <span className="provider-nav-icon">
                    <Icon size={18} />
                  </span>
                  <span className="provider-nav-label">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="provider-sidebar-footer">
          <button className="provider-nav-item" type="button" title="Logout" onClick={logout}>
            <span className="provider-nav-icon">
              <LogOut size={18} />
            </span>
            <span className="provider-nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="provider-workspace-main mentor-main">
        <header className="provider-workspace-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="provider-icon-button mobile-menu-toggle"
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="provider-search-field">
              <Search size={16} />
              <input placeholder="Search Mentor workspace..." />
            </div>
          </div>

          <div className="provider-topbar-actions">
            <button className="provider-icon-button" type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button
              type="button"
              className="mentor-profile"
              onClick={() => onNavigate('/mentor/profile')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="View Mentor Profile"
            >
              <span className="provider-profile-avatar">
                {session?.user?.full_name?.split(' ').map((p) => p[0]).join('').slice(0, 2) || 'PM'}
              </span>
              <span>{session?.user?.full_name || 'Priya Menon (Mentor)'}</span>
            </button>
          </div>
        </header>

        <div className="mentor-heading">
          <div>
            <p className="provider-eyebrow">{isInternDetail ? 'Learner Detail' : title[0]}</p>
            <h1>{isInternDetail ? 'Learner Profile & Delivery' : title[1]}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="mentor-live-status-pill">
              {connectionStatus === 'connected' && (
                <span className="pill-live"><span className="dot dot-green" /> Live</span>
              )}
              {connectionStatus === 'reconnecting' && (
                <span className="pill-reconnecting"><span className="dot dot-amber" /> Reconnecting...</span>
              )}
              {connectionStatus === 'offline' && (
                <span className="pill-offline"><span className="dot dot-gray" /> Offline</span>
              )}
            </div>
            <span className="mentor-role-badge">
              <UserCheck size={14} /> Mentor Workspace
            </span>
          </div>
        </div>

        {error ? (
          <section className="mentor-panel">
            <p className="mentor-error">{error}</p>
            <button type="button" className="provider-quiet-button" onClick={reload}>
              Retry
            </button>
          </section>
        ) : (
          <>
            {isInternDetail && <InternDetailPage internId={detailInternId} onNavigate={onNavigate} />}
            {!isInternDetail && path === '/mentor/dashboard' && (
              <Dashboard data={data || {}} internFeedback={internFeedback} onNavigate={onNavigate} activityFeed={liveActivities} mentorTasks={mentorTasks} />
            )}
            {!isInternDetail && path === '/mentor/monitoring' && (
              <MentorMonitoringView interns={interns} onNavigate={onNavigate} refreshKey={refresh} />
            )}
            {!isInternDetail && path === '/mentor/interns' && <InternsPage items={data?.items || interns} onNavigate={onNavigate} />}
            {!isInternDetail && path === '/mentor/projects' && <MentorProjectsPage />}
            {!isInternDetail && path === '/mentor/tasks' && <TasksPage data={data?.items || []} interns={interns} onCreated={reload} />}
            {!isInternDetail && path === '/mentor/submissions' && <SubmissionsPage data={data?.items || []} onUpdated={reload} />}
            {!isInternDetail && path === '/mentor/feedback' && <FeedbackPage data={data?.items || []} interns={interns} onCreated={reload} />}
            {!isInternDetail && path === '/mentor/intern-feedback' && (
              <InternFeedbackPage data={internFeedback} onRetry={reload} />
            )}
            {!isInternDetail && path === '/mentor/evaluations' && <EvaluationsPage data={data?.items || []} interns={interns} onCreated={reload} />}
            {!isInternDetail && path === '/mentor/calendar' && <CalendarPage />}
            {!isInternDetail && path === '/mentor/profile' && <MentorProfilePage />}
          </>
        )}
      </main>
    </div>
  );
}
