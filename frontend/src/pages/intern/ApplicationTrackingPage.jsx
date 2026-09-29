import { useState, useEffect } from 'react';
import {
  FileCheck,
  Building2,
  Clock,
  CheckCircle2,
  Circle,
  BrainCircuit,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { fetchMyApplication } from '../../services/internService';
import '../../components/common/SkillChip.css';
import '../../styles/InternWorkspace.css';

/**
 * Backend lifecycle states (source of truth):
 *   applied → screening → shortlisted → assessment → interview → selected | rejected
 * Stage presentation below maps 1:1 onto those states; a stage is only ever
 * marked completed/active when the backend application row confirms it.
 */
const STAGE_LABELS = {
  applied: 'Application submitted',
  screening: 'AI screening',
  shortlisted: 'Shortlisted',
  assessment: 'Assessment',
  interview: 'Interview',
  selected: 'Selected',
  rejected: 'Not selected'
};

const LIFECYCLE = ['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected'];

const STAGE_HINTS = {
  applied: 'The provider has received your application.',
  screening: 'Your resume is being analyzed for skills and experience match.',
  shortlisted: 'You passed initial screening. The provider can now move you to assessment.',
  assessment: 'Complete the technical assessment when the provider publishes it.',
  interview: 'Interview scheduling happens directly with the provider once you reach this stage.',
  selected: 'Congratulations — the provider selected you for the internship.'
};

function stageState(stage, currentStatus) {
  if (stage === currentStatus) return 'active';
  const currentIdx = LIFECYCLE.indexOf(currentStatus);
  const stageIdx = LIFECYCLE.indexOf(stage);
  if (currentIdx === -1) {
    // 'rejected' is a terminal state outside the happy-path lifecycle:
    // the application itself did happen, later stages are moot.
    return stageIdx === 0 ? 'completed' : 'upcoming';
  }
  return currentIdx > stageIdx ? 'completed' : 'upcoming';
}

export default function ApplicationTrackingPage({ applicationId, onNavigate }) {
  const [app, setApp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadApplication = () => {
    setIsLoading(true);
    setError('');
    fetchMyApplication(applicationId)
      .then((data) => {
        setApp(data);
      })
      .catch((requestError) => {
        setError(requestError?.message || 'Could not load this application.');
        setApp(null);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadApplication);
  }, [applicationId]);

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <div className="skeleton-line" style={{ width: '40%' }} />
          <div className="skeleton-line" style={{ width: '70%' }} />
          <div className="skeleton-line" style={{ width: '55%' }} />
          <p>Loading your application…</p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="intern-page-container container">
        <div className="details-nav-row animate-fade-in">
          <button className="btn-back-link" onClick={() => onNavigate('/intern/dashboard')}>
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>
        <div className="glass-card empty-state-card animate-fade-in">
          <AlertCircle size={40} className="empty-icon text-cyan" />
          <h3>Application unavailable</h3>
          <p>{error || 'This application could not be found.'}</p>
          <button className="btn btn-primary glass-btn-primary" onClick={loadApplication}>
            <RefreshCw size={16} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const status = app.status;
  const internship = app.internship || {};
  const screening = app.screening || null;
  const screeningDone = screening && screening.status === 'completed';
  const screeningFailed = screening && screening.status === 'failed';
  const screeningRunning = screening && (screening.status === 'processing' || screening.status === 'pending' || screening.status === 'queued');
  const isRejected = status === 'rejected';

  return (
    <div className="intern-page-container container">
      {/* Back Link */}
      <div className="details-nav-row animate-fade-in">
        <button className="btn-back-link" onClick={() => onNavigate('/intern/dashboard')}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Hero Tracker Overview Card */}
      <div className="glass-card tracker-hero-card animate-fade-in">
        <div className="tracker-hero-top">
          <div className="company-badge-large">
            <Building2 size={28} />
          </div>
          <div className="tracker-title-group">
            <div className="hero-badge-sm">
              <Sparkles size={12} />
              <span>Application ID: {app.id}</span>
            </div>
            <h1 className="tracker-role-title">{internship.title}</h1>
            <p className="tracker-company-name">{internship.provider_name || 'Verified Provider'}</p>
          </div>
          <span className={`badge ${isRejected ? 'badge-warning' : 'badge-primary'} badge-lg`}>
            {STAGE_LABELS[status] || status}
          </span>
        </div>

        {/* Status Progression UI — vertical timeline, backend-confirmed states only.
            Timestamps are shown only where the backend provides them (applied date,
            screening time). No history table exists yet, so past stages show no date. */}
        <div className="progression-container">
          <span className="progression-title">Application Progression</span>
          <ol className="timeline-track" role="list">
            {LIFECYCLE.map((stage) => {
              const state = stageState(stage, status);
              const isCompleted = state === 'completed';
              const isActive = state === 'active';
              const stageDate = stage === 'applied' && app.created_at
                ? new Date(app.created_at).toLocaleDateString()
                : (stage === 'screening' && screeningDone && screening.screened_at
                  ? new Date(screening.screened_at).toLocaleDateString()
                  : null);
              return (
                <li
                  key={stage}
                  className={`timeline-step ${isActive ? 'is-current' : isCompleted ? 'is-complete' : 'is-upcoming'} ${stage === 'selected' && isRejected ? 'is-muted' : ''}`}
                >
                  <span className="timeline-marker" aria-hidden="true">
                    {isCompleted ? <CheckCircle2 size={16} /> : isActive ? <span className="timeline-dot-current" /> : <Circle size={12} />}
                  </span>
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <span className="timeline-name">{STAGE_LABELS[stage]}</span>
                      {isActive && <span className="badge badge-primary">Current stage</span>}
                      {stageDate && <span className="timeline-date">{stageDate}</span>}
                    </div>
                    <p className="timeline-desc">{STAGE_HINTS[stage]}</p>
                    {isActive && stage === 'selected' && (
                      <button className="btn btn-outline btn-sm" onClick={() => onNavigate('/intern/dashboard')}>
                        Go to My Workspace
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {isRejected && (
            <p className="section-subtitle" style={{ marginTop: '0.6rem' }}>
              This application was not selected. Explore other opportunities — your skills carry over to every future application.
            </p>
          )}
        </div>
      </div>

      {/* AI Screening Evidence (only rendered once the backend completed screening) */}
      {screeningRunning && (
        <div className="glass-card cta-banner-card banner-assessment animate-fade-in">
          <div className="banner-left">
            <div className="banner-icon-bg bg-cyan">
              <BrainCircuit size={28} />
            </div>
            <div className="banner-info">
              <div className="banner-tag">In Progress</div>
              <h3 className="banner-title">AI resume screening is running</h3>
              <p className="banner-sub">
                Your resume is being reviewed for skills and experience match. Results appear here automatically — no action needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {screeningFailed && (
        <div className="glass-card cta-banner-card animate-fade-in">
          <div className="banner-left">
            <div className="banner-icon-bg bg-cyan">
              <AlertCircle size={28} />
            </div>
            <div className="banner-info">
              <div className="banner-tag">Needs Attention</div>
              <h3 className="banner-title">Screening could not complete</h3>
              <p className="banner-sub">
                The automated review hit a snag. The provider can re-run it — your application is still active.
              </p>
            </div>
          </div>
        </div>
      )}

      {screeningDone && (
        <div className="glass-card tracker-col-card animate-fade-in" style={{ marginBottom: '1.5rem' }}>
          <div className="col-card-title-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <ShieldCheck size={18} className="text-cyan" />
            <h3 className="col-card-title" style={{ margin: 0 }}>AI Screening Evidence</h3>
            {screening.overall_score != null && (
              <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>
                {screening.overall_score}% overall match
              </span>
            )}
          </div>
          {screening.summary && <p className="section-body-text">{screening.summary}</p>}
          {(screening.matched_skills?.length > 0 || screening.missing_skills?.length > 0) && (
            <div className="detail-summary-list" style={{ marginTop: '0.9rem' }}>
              {screening.matched_skills?.length > 0 && (
                <div className="summary-item">
                  <span className="item-label">Matched Skills</span>
                  <div className="skills-chips">
                    {screening.matched_skills.map((skill) => (
                      <span key={skill} className="skill-chip-sm">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {screening.missing_skills?.length > 0 && (
                <div className="summary-item">
                  <span className="item-label">Missing Skills</span>
                  <div className="skills-chips">
                    {screening.missing_skills.map((skill) => (
                      <span key={skill} className="skill-chip-sm">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="section-subtitle" style={{ marginTop: '0.9rem' }}>
            This analysis is advisory — the provider makes all decisions on your application.
          </p>
        </div>
      )}

      {/* Timeline & Company Feed Grid */}
      <div className="tracker-grid">
        {/* Application Details Summary */}
        <div className="glass-card tracker-col-card">
          <h3 className="col-card-title">Submitted Application Details</h3>
          <div className="detail-summary-list">
            <div className="summary-item">
              <span className="item-label">Role</span>
              <span className="item-val">{internship.title}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Department</span>
              <span className="item-val">{internship.department || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Work Mode</span>
              <span className="item-val">{internship.work_mode || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Duration</span>
              <span className="item-val">{internship.duration || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Stipend</span>
              <span className="item-val text-cyan">{internship.stipend || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Resume</span>
              <span className="item-val text-cyan">{app.resume_file_name || 'Submitted'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">
                <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                Applied
              </span>
              <span className="item-val">{app.created_at ? new Date(app.created_at).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>

        {/* Company Communication Activity Stream (backend-confirmed events only) */}
        <div className="glass-card tracker-col-card">
          <h3 className="col-card-title">Application Activity Log</h3>
          <div className="activity-stream">
            <div className="activity-item">
              <div className={`activity-dot ${isRejected ? 'bg-cyan' : 'bg-mint'}`} />
              <div className="activity-content">
                <span className="activity-time">{app.created_at ? new Date(app.created_at).toLocaleString() : 'Just now'}</span>
                <p className="activity-msg">
                  Application submitted to <strong>{internship.provider_name || 'the provider'}</strong> via InternFlow.
                </p>
              </div>
            </div>
            {screeningDone && screening.screened_at && (
              <div className="activity-item">
                <div className="activity-dot bg-cyan" />
                <div className="activity-content">
                  <span className="activity-time">{new Date(screening.screened_at).toLocaleString()}</span>
                  <p className="activity-msg">
                    AI screening completed{screening.overall_score != null ? <> with a <strong>{screening.overall_score}%</strong> overall match</> : null}.
                  </p>
                </div>
              </div>
            )}
            {status !== 'applied' && (
              <div className="activity-item">
                <div className="activity-dot bg-mint" />
                <div className="activity-content">
                  <span className="activity-time">Live</span>
                  <p className="activity-msg">
                    Current stage: <strong>{STAGE_LABELS[status] || status}</strong> — set by {internship.provider_name || 'the provider'}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Next-step guidance */}
      <div className="glass-card animate-fade-in" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <FileCheck size={20} className="text-cyan" />
          <div style={{ flex: 1, minWidth: '240px' }}>
            <h3 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>What happens next?</h3>
            <p className="section-subtitle" style={{ margin: '0.2rem 0 0' }}>
              {status === 'shortlisted' && 'The provider reviews shortlisted candidates and can move you to the next stage. Watch this page for updates.'}
              {status === 'applied' && 'Your application is with the provider. Screening results and stage updates appear here automatically.'}
              {status === 'selected' && 'Check your workspace — your mentor, tasks and attendance live under My Workspace on the dashboard.'}
              {isRejected && 'This application was not selected. Keep going — explore more opportunities matched to your skills.'}
              {!['shortlisted', 'applied', 'selected'].includes(status) && !isRejected && 'The provider moves your application through each stage. This page always reflects the live backend status.'}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => onNavigate('/intern/explore')}>
            <span>Explore Opportunities</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
