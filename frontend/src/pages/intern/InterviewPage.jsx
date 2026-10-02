import { useState, useEffect } from 'react';
import {
  Video,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  ExternalLink,
  Award,
  Loader2
} from 'lucide-react';
import { fetchMyApplication, fetchMyApplications } from '../../services/internService';
import { fetchApplicationInterview } from '../../services/phase20Service';
import '../../styles/InternWorkspace.css';

function formatInterviewDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatInterviewTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function InterviewPage({ applicationId, onNavigate }) {
  const [app, setApp] = useState(null);
  const [interviewData, setInterviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      let targetId = applicationId;
      if (!targetId || targetId === 'null' || targetId === 'undefined') {
        const apps = await fetchMyApplications();
        if (Array.isArray(apps) && apps.length > 0) {
          targetId = apps[0].id;
        } else {
          setApp(null);
          setIsLoading(false);
          return;
        }
      }

      const appRes = await fetchMyApplication(targetId);
      setApp(appRes);

      const invRes = await fetchApplicationInterview(targetId);
      if (invRes && invRes.has_interview) {
        setInterviewData(invRes.interview);
      } else {
        setInterviewData(null);
      }
    } catch (err) {
      setError(err?.message || 'Could not load interview details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadData);
  }, [applicationId]);

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <Loader2 size={32} className="spin text-cyan" />
          <p style={{ marginTop: '1rem' }}>Loading interview schedule…</p>
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
        <div
          className="floating-info-popup animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
            border: '1px solid rgba(168, 85, 247, 0.4)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.15)',
            borderRadius: '16px',
            padding: '18px 22px',
            marginBottom: '24px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(168, 85, 247, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
              flexShrink: 0,
            }}
          >
            <Video size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 600, color: '#f8fafc' }}>
              No Interview Scheduled Yet
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: '#94a3b8' }}>
              You have not applied to any internships yet. Explore opportunities and apply to advance through screening and interview stages.
            </p>
          </div>
        </div>
        <div className="glass-card empty-state-card animate-fade-in">
          <Video size={44} className="empty-icon text-cyan" />
          <h3>Interview Stage</h3>
          <p>When you apply to an internship and reach the interview stage, your meeting schedule, interviewer name, and Join link will appear here.</p>
          <button className="btn btn-primary glass-btn-primary" onClick={() => onNavigate('/intern/explore')}>
            <Sparkles size={16} />
            <span>Explore Internships</span>
          </button>
        </div>
      </div>
    );
  }

  const internship = app.internship || {};

  return (
    <div className="intern-page-container container animate-fade-in">
      <div className="details-nav-row">
        <button className="btn-back-link" onClick={() => onNavigate(`/intern/applications/${app.id}/track`)}>
          <ArrowLeft size={16} />
          <span>Back to Application Tracker</span>
        </button>
      </div>

      <div className="interview-hero-card glass-card">
        <div className="hero-badge-sm">
          <Sparkles size={12} />
          <span>Interview Stage</span>
        </div>
        <h1 className="interview-title">{internship.title}</h1>
        <p className="interview-company-sub">
          {internship.provider_name || 'Verified Provider'} • {internship.department || 'Internship Program'}
        </p>

        {error && (
          <div className="my-skills-alert error" style={{ marginTop: '1rem' }} role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {interviewData ? (
          <div className="glass-card animate-fade-in" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '1.75rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Video size={28} className="text-cyan" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>Scheduled Interview</h3>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Interviewer: {interviewData.interviewer_name || 'Provider Representative'}</span>
                </div>
              </div>
              <span className="badge badge-success" style={{ textTransform: 'capitalize', fontSize: '0.85rem', padding: '4px 12px' }}>
                {interviewData.status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', margin: '1.25rem 0', background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                <Calendar size={18} className="text-cyan" />
                <span>{formatInterviewDate(interviewData.scheduled_at)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0' }}>
                <Clock size={18} className="text-cyan" />
                <span>{formatInterviewTime(interviewData.scheduled_at)} ({interviewData.duration_minutes} mins)</span>
              </div>
            </div>

            {interviewData.meeting_link && (
              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <a
                  href={interviewData.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary glass-btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Video size={16} /> Join Interview Meeting <ExternalLink size={14} />
                </a>
              </div>
            )}

            {interviewData.scorecard_id && (
              <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Award size={20} className="text-emerald" />
                  <h4 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>Interview Scorecard Completed</h4>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#cbd5e1', margin: '4px 0' }}>
                  Recommendation: <strong style={{ textTransform: 'capitalize' }}>{interviewData.overall_recommendation}</strong>
                </p>
                {interviewData.evidence_notes && (
                  <p style={{ fontSize: '0.84rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '6px' }}>
                    "{interviewData.evidence_notes}"
                  </p>
                )}
              </div>
            )}

            {!interviewData.scorecard_id && interviewData.status !== 'cancelled' && (
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: '1.25rem' }}>
                The interview scorecard is completed by the interviewer after your meeting.
              </p>
            )}
          </div>
        ) : (
          <div className="glass-card empty-state-card animate-fade-in" style={{ marginTop: '1.5rem', background: 'transparent', boxShadow: 'none' }}>
            <Video size={40} className="empty-icon text-cyan" />
            <h3>No interview scheduled yet</h3>
            <p>
              Your application for <strong>{internship.title}</strong> is currently in stage <strong>{app.status}</strong>.
            </p>
            <p className="sub-text">
              {['applied', 'screening'].includes(app.status)
                ? 'Your application is currently in screening. Interview scheduling unlocks once you pass screening and assessment stages.'
                : app.status === 'shortlisted' || app.status === 'assessment'
                ? 'You are advancing through selection stages. When your provider schedules an interview, the date, time, and Join meeting link will appear here automatically.'
                : 'Once your provider schedules a date and time, the meeting details and Join link will appear here.'}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
              <button className="btn btn-primary glass-btn-primary" onClick={() => onNavigate(`/intern/applications/${app.id}/track`)}>
                <CheckCircle2 size={16} /> Track Application Status
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
