import { useState, useEffect } from 'react';
import { CheckCircle2, ArrowRight, FileCheck, Compass, LayoutDashboard, AlertCircle, Clock } from 'lucide-react';
import { fetchMyApplication } from '../../services/internService';
import '../../styles/InternWorkspace.css';

export default function ApplicationSubmittedPage({ applicationId, onNavigate }) {
  const [app, setApp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      setIsLoading(true);
      setError('');
      return fetchMyApplication(applicationId);
    })
      .then((data) => {
        if (isMounted) setApp(data);
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError?.message || 'Could not load this application.');
          setApp(null);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [applicationId]);

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <div className="skeleton-line" style={{ width: '50%' }} />
          <div className="skeleton-line" style={{ width: '35%' }} />
          <p>Loading confirmation…</p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <AlertCircle size={40} className="empty-icon text-cyan" />
          <h3>Confirmation unavailable</h3>
          <p>{error || 'This application could not be found.'}</p>
          <button className="btn btn-outline" onClick={() => onNavigate('/intern/dashboard')}>
            <LayoutDashboard size={16} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const internship = app.internship || {};
  const screening = app.screening || null;
  const screeningRunning = screening && ['queued', 'pending', 'processing'].includes(screening.status);

  return (
    <div className="intern-page-container container flex-center-content">
      <div className="glass-card confirmation-card animate-fade-in">
        <div className="confirmation-badge-icon">
          <CheckCircle2 size={48} className="text-success" />
        </div>

        <h1 className="confirmation-title">Application Submitted</h1>
        <p className="confirmation-sub">
          Your application for <strong>{internship.title}</strong> at <strong>{internship.provider_name || 'the provider'}</strong> has been successfully received.
        </p>

        <div className="submitted-info-box">
          <div className="info-row">
            <span className="info-label">Application ID:</span>
            <span className="info-val font-mono">{app.id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Current Status:</span>
            <span className="badge badge-warning">{app.status}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Next Stage:</span>
            <span className="info-val text-cyan font-semibold">
              {screeningRunning ? 'AI resume screening' : 'Provider review'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              Submitted:
            </span>
            <span className="info-val">{app.created_at ? new Date(app.created_at).toLocaleString() : 'Just now'}</span>
          </div>
        </div>

        <div className="confirmation-actions">
          <button
            className="btn btn-primary btn-lg glass-btn-primary full-width"
            onClick={() => onNavigate(`/intern/applications/${app.id}/track`)}
          >
            <FileCheck size={18} />
            <span>Track Application</span>
            <ArrowRight size={16} />
          </button>

          <div className="secondary-action-row">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate('/intern/explore')}
            >
              <Compass size={14} />
              <span>Explore More Internships</span>
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate('/intern/dashboard')}
            >
              <LayoutDashboard size={14} />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
