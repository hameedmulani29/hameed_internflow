import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  Send,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { fetchLiveInternships } from '../../services/internService';
import '../../styles/InternWorkspace.css';

export default function InternshipDetailsPage({ internshipId, onNavigate }) {
  const [internship, setInternship] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadInternship = () => {
    setIsLoading(true);
    setError('');
    fetchLiveInternships()
      .then((items) => {
        const found = items.find((item) => String(item.id) === String(internshipId));
        if (found) {
          setInternship(found);
        } else {
          setError('This internship is no longer available.');
          setInternship(null);
        }
      })
      .catch((requestError) => {
        setError(requestError?.message || 'Could not load this internship.');
        setInternship(null);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadInternship);
  }, [internshipId]);

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <div className="skeleton-line" style={{ width: '40%' }} />
          <div className="skeleton-line" style={{ width: '60%' }} />
          <div className="skeleton-line" style={{ width: '85%' }} />
          <p>Loading internship details…</p>
        </div>
      </div>
    );
  }

  if (error || !internship) {
    return (
      <div className="intern-page-container container">
        <div className="details-nav-row animate-fade-in">
          <button className="btn-back-link" onClick={() => onNavigate('/intern/explore')}>
            <ArrowLeft size={16} />
            <span>Back to Explore</span>
          </button>
        </div>
        <div className="glass-card empty-state-card animate-fade-in">
          <AlertCircle size={40} className="empty-icon text-cyan" />
          <h3>Internship unavailable</h3>
          <p>{error || 'This internship could not be found. It may have been closed by the provider.'}</p>
          <button className="btn btn-primary glass-btn-primary" onClick={loadInternship}>
            <RefreshCw size={16} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="intern-page-container container">
      {/* Contextual Back Navigation */}
      <div className="details-nav-row animate-fade-in">
        <button className="btn-back-link" onClick={() => onNavigate('/intern/explore')}>
          <ArrowLeft size={16} />
          <span>Back to Explore</span>
        </button>
      </div>

      {/* Detail Header Hero Card */}
      <div className="glass-card detail-hero-card animate-fade-in">
        <div className="detail-hero-top">
          <div className="company-logo-large">
            <Building2 size={32} />
          </div>
          <div className="detail-hero-title-group">
            <div className="hero-badge-sm">
              <Sparkles size={12} />
              <span>{internship.department}</span>
            </div>
            <h1 className="detail-title">{internship.title}</h1>
            <p className="detail-company-name">{internship.company}</p>
            <p className="meta-subtle-info" style={{ marginTop: '0.4rem' }}>
              <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
              {internship.location}
            </p>
          </div>
        </div>

        <div className="detail-key-metrics-bar">
          <div className="metric-box">
            <span className="metric-label">Stipend</span>
            <span className="metric-val highlight-val">{internship.stipend}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Work Mode</span>
            <span className="metric-val">{internship.workMode}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Duration</span>
            <span className="metric-val">{internship.duration}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Posted</span>
            <span className="metric-val">
              <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
              {internship.formattedCreatedAt || 'Just now'}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">Application Deadline</span>
            <span className="metric-val">
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              {internship.deadline}
            </span>
          </div>
        </div>

        <div className="detail-hero-cta-row">
          <button
            className="btn btn-primary btn-lg glass-btn-primary"
            onClick={() => onNavigate(`/intern/applications/${internship.id}/apply`)}
          >
            <Send size={18} />
            <span>Apply Now</span>
          </button>
          <div className="meta-subtle-info">
            <ShieldCheck size={16} className="text-success" />
            <span>Verified Provider on InternFlow</span>
          </div>
        </div>
      </div>

      {/* Content Grid: Overview, Required Skills, What You Get */}
      <div className="details-content-grid">
        <div className="details-main-column">
          {/* About Program */}
          <div className="glass-card section-card">
            <h2 className="card-section-title">About the Program</h2>
            <p className="section-body-text">{internship.description}</p>
          </div>

          {/* Hiring Process — reflects the real InternFlow lifecycle */}
          <div className="glass-card section-card">
            <h2 className="card-section-title">Hiring Process</h2>
            <ul className="bullet-list">
              <li>
                <CheckCircle2 size={16} className="bullet-icon text-cyan" />
                <span>Apply with your resume — takes about two minutes.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="bullet-icon text-mint" />
                <span>AI-assisted screening reviews your skills and experience as evidence for the provider.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="bullet-icon text-cyan" />
                <span>The provider reviews the evidence and makes the selection decision.</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="bullet-icon text-mint" />
                <span>Once selected, a mentor is assigned and your internship workspace goes live.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Sidebar Info Column */}
        <div className="details-side-column">
          {/* Required Skills — only shown when the provider published skills data */}
          {internship.skills.length > 0 && (
            <div className="glass-card section-card">
              <h3 className="sidebar-card-title">Required Skills</h3>
              <div className="skills-cloud">
                {internship.skills.map((skill) => (
                  <span key={skill} className="skill-chip-large">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Program Perks & Mentorship */}
          <div className="glass-card section-card perks-card">
            <h3 className="sidebar-card-title">Program Benefits</h3>
            <div className="perk-item">
              <Sparkles size={16} className="perk-icon" />
              <div>
                <strong>Direct Mentor Guidance</strong>
                <p>Work with an assigned mentor throughout your internship</p>
              </div>
            </div>
            <div className="perk-item">
              <ShieldCheck size={16} className="perk-icon" />
              <div>
                <strong>Verified Outcome</strong>
                <p>Your completed work is tracked and verified on InternFlow</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
