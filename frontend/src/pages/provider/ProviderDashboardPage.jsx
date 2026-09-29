import { useEffect, useState } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  LayoutDashboard,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import { fetchInternships, fetchApplications, getSession } from '../../services/publicExperience';
import { fetchProviderInterviews } from '../../services/phase20Service';
import { fetchProviderAssignments } from '../../services/mentorshipFoundationService';
import { fetchScreeningQueue } from '../../services/internService';
import '../../styles/ProviderDashboard.css';

const sidebarItems = [
  { label: 'Dashboard', path: '/provider-dashboard', icon: LayoutDashboard },
  { label: 'Internships', path: '/provider-internships', icon: BriefcaseBusiness },
  { label: 'Applications', path: '/provider-applications', icon: FileText },
  { label: 'Interviews', path: '/provider-interviews', icon: Clock3 },
  { label: 'Interns', path: '/provider-interns', icon: Users },
  { label: 'Reports', path: '/provider-reports', icon: TrendingUp },
  { label: 'Certificates', path: '/provider-certificates', icon: CheckCircle2 },
  { label: 'Automation', path: '/provider-automation', icon: Zap },
  { label: 'Settings', path: '/provider-settings', icon: Settings },
];

function Sidebar({ onNavigate }) {
  const session = getSession('provider');
  const user = session?.user || {};
  const displayName = user.full_name || 'Provider';
  const orgName = user.organization || user.full_name || 'Provider workspace';
  const initials = (user.full_name || 'P')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'P';

  return (
    <aside className="provider-sidebar" aria-label="Provider navigation">
      <div className="provider-sidebar-top">
        <div className="provider-brand" aria-label="InternFlow home">
          <img src={logoUrl} alt="InternFlow logo" className="provider-logo-img" />
          <span className="provider-brand-text">InternFlow</span>
        </div>

        <nav className="provider-nav">
          {sidebarItems.map(({ label, path, icon: Icon }) => (
            <button type="button" key={label} className={`provider-nav-item ${path === '/provider-dashboard' ? 'is-active' : ''}`} title={label} onClick={() => onNavigate(path)}>
              <span className="provider-nav-icon"><Icon size={18} /></span>
              <span className="provider-nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="provider-sidebar-footer">
        <div className="provider-user-pill">
          <div className="provider-user-avatar">{initials}</div>
          <div className="provider-user-meta">
            <strong>{displayName}</strong>
            <small>{orgName}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function ProviderDashboardPage({ onNavigate }) {
  const session = getSession('provider');
  const user = session?.user || {};

  const displayName = user.full_name || 'Provider';
  const initials = (user.full_name || 'P')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'P';

  const [data, setData] = useState(null); // { internships, applications, queue, interviews, assignments }
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = () => {
    setIsLoading(true);
    setError('');
    Promise.all([
      fetchInternships({ query: '', status: '' }),
      fetchApplications(),
      fetchScreeningQueue(),
      fetchProviderInterviews().catch(() => ({ items: [] })),
      fetchProviderAssignments().catch(() => ({ items: [] })),
    ])
      .then(([internships, applications, queue, interviews, assignments]) => {
        setData({
          internships: internships.items || [],
          applications: applications.items || [],
          queue,
          interviews: interviews.items || [],
          assignments: assignments.items || [],
        });
      })
      .catch((requestError) => setError(requestError?.message || 'Could not load your dashboard.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadDashboard);
  }, []);

  const counts = data
    ? {
        internships: data.internships.filter((i) => (i.status || '') === 'published').length,
        draftInternships: data.internships.filter((i) => (i.status || '') === 'draft').length,
        applications: data.applications.length,
        pendingReview: data.applications.filter((a) => ['applied', 'screening'].includes(a.status)).length,
        shortlisted: data.applications.filter((a) => ['shortlisted', 'interview'].includes(a.status)).length,
        screeningDone: data.queue.filter((s) => s.status === 'completed').length,
        interviews: data.interviews.length,
        interviewsScheduled: data.interviews.filter((i) => ['scheduled', 'confirmed'].includes(i.status)).length,
        interns: new Set(
          data.assignments
            .filter((a) => (a.status || '') === 'active')
            .map((a) => a.intern_id)
        ).size,
      }
    : null;

  const funnel = counts
    ? [
        { label: 'Applications', value: counts.applications, width: '100%' },
        { label: 'Screened', value: counts.screeningDone, width: `${Math.round((counts.screeningDone / Math.max(counts.applications, 1)) * 100)}%` },
        { label: 'Shortlisted / Interview', value: counts.shortlisted, width: `${Math.round((counts.shortlisted / Math.max(counts.applications, 1)) * 100)}%` },
        { label: 'Interviews scheduled', value: counts.interviews, width: `${Math.round((counts.interviews / Math.max(counts.applications, 1)) * 21)}%` },
        { label: 'Active interns', value: counts.interns, width: `${Math.round((counts.interns / Math.max(counts.applications, 1)) * 21)}%` },
      ]
    : [];

  return (
    <div className="provider-app-shell provider-dashboard-shell">
      <div className="provider-background-network" aria-hidden="true">
        <span className="provider-network-line provider-network-line-a" />
        <span className="provider-network-line provider-network-line-b" />
        <span className="provider-network-line provider-network-line-c" />
        <span className="provider-network-dot provider-network-dot-a" />
        <span className="provider-network-dot provider-network-dot-b" />
        <span className="provider-network-dot provider-network-dot-c" />
      </div>

      <Sidebar onNavigate={onNavigate} />

      <main className="provider-dashboard-main">
        <header className="provider-topbar">
          <div>
            <p className="provider-greeting">Welcome back, {displayName}</p>
            <h1>Here&apos;s what&apos;s happening across your programs</h1>
          </div>

          <div className="provider-topbar-actions">
            <button type="button" className="provider-icon-button" aria-label="Search">
              <Search size={18} />
            </button>
            <button type="button" className="provider-icon-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button type="button" className="provider-profile-chip" aria-label="Account">
              <span className="provider-profile-avatar">{initials}</span>
            </button>
          </div>
        </header>

        <section className="provider-hero-row">
          <div className="provider-hero-copy">
            <p className="provider-eyebrow">Operations overview</p>
            <h2>Live counts from your internships, applications, and internships currently in delivery.</h2>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="provider-quiet-button" onClick={loadDashboard} disabled={isLoading}>
              <RefreshCw size={16} /> Refresh
            </button>
            <button type="button" className="provider-primary-btn" onClick={() => onNavigate('/provider-internship-new')}>
              <Sparkles size={16} />
              Create Internship
            </button>
          </div>
        </section>

        {error ? (
          <section className="provider-panel" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <div style={{ fontWeight: 600, color: '#b45309' }}>Something went wrong</div>
            <p style={{ color: '#64748b', margin: '0.5rem 0 1rem' }}>{error}</p>
            <button className="provider-quiet-button" type="button" onClick={loadDashboard}>
              <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> Retry
            </button>
          </section>
        ) : isLoading ? (
          <section className="provider-panel" role="status" aria-live="polite" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            Loading your program data…
          </section>
        ) : (
          <>
            <section className="provider-kpi-grid" aria-label="Key metrics">
              {[
                { label: 'Published internships', value: String(counts.internships), delta: counts.draftInternships ? `${counts.draftInternships} draft` : 'All live' },
                { label: 'Applications', value: String(counts.applications), delta: `${counts.pendingReview} awaiting review` },
                { label: 'Shortlisted / Interview', value: String(counts.shortlisted), delta: `${counts.screeningDone} screened by AI` },
                { label: 'Interviews scheduled', value: String(counts.interviews), delta: `${counts.interviewsScheduled} upcoming` },
                { label: 'Active interns', value: String(counts.interns), delta: 'With assigned mentors' },
              ].map(({ label, value, delta }) => (
                <article key={label} className="provider-kpi-card">
                  <div className="provider-kpi-value">{value}</div>
                  <div className="provider-kpi-label">{label}</div>
                  <div className="provider-kpi-delta">{delta}</div>
                </article>
              ))}
            </section>

            <section className="provider-main-grid">
              <article className="provider-panel provider-funnel-panel">
                <div className="provider-panel-header">
                  <span className="provider-panel-kicker">Application funnel</span>
                </div>

                <div className="provider-funnel-list">
                  {funnel.map(({ label, value, width }) => (
                    <div key={label} className="provider-funnel-row">
                      <div className="provider-funnel-meta">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                      <div className="provider-funnel-bar-track">
                        <div className="provider-funnel-bar" style={{ width }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="provider-panel provider-completion-panel">
                <div className="provider-panel-header">
                  <span className="provider-panel-kicker">Delivery</span>
                </div>

                <div className="provider-completion-ring" aria-label={`${counts.interns} active interns`}>
                  <div className="provider-completion-ring-inner">
                    <span>{counts.interns}</span>
                  </div>
                </div>
                <p className="provider-completion-trend">Active interns with assigned mentors</p>
              </article>
            </section>

            <section className="provider-panel provider-internships-panel">
              <div className="provider-section-header">
                <span>Your internships</span>
                <button type="button" className="provider-link-btn" onClick={() => onNavigate('/provider-internships')}>View all</button>
              </div>

              {data.internships.length === 0 ? (
                <p className="provider-body-copy">No internships yet — create your first program to start receiving applications.</p>
              ) : (
                <div className="provider-internship-list">
                  {data.internships.slice(0, 3).map((internship) => {
                    const internshipApps = data.applications.filter((a) => a.internship_id === internship.id);
                    return (
                      <article key={internship.id} className="provider-internship-card">
                        <div className="provider-internship-row">
                          <div>
                            <h3>{internship.title}</h3>
                            <div className="provider-internship-status-row">
                              <span className="provider-status-dot" />
                              <span>{internship.status || '—'}</span>
                            </div>
                          </div>
                          <button type="button" className="provider-inline-link" onClick={() => onNavigate('/provider-internships')}>
                            View internship <ChevronRight size={15} />
                          </button>
                        </div>

                        <div className="provider-internship-meta">
                          <span>{internshipApps.length} applications</span>
                          <span>{internship.department || '—'}</span>
                          {internship.deadline ? <span>Deadline: {new Date(internship.deadline).toLocaleDateString()}</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="provider-lower-grid">
              <article className="provider-panel provider-actions-panel">
                <div className="provider-section-header">
                  <span>Pending actions</span>
                </div>

                <div className="provider-actions-list">
                  {[
                    { icon: FileText, label: 'Applications awaiting review', count: counts.pendingReview, action: 'Review candidates', tone: 'warning', path: '/provider-applications' },
                    { icon: Clock3, label: 'Interviews scheduled', count: counts.interviewsScheduled, action: 'Open interviews', tone: 'info', path: '/provider-interviews' },
                    { icon: Zap, label: 'AI screenings completed', count: counts.screeningDone, action: 'View screening', tone: 'neutral', path: '/provider-screening' },
                    { icon: Users, label: 'Active interns', count: counts.interns, action: 'View interns', tone: 'danger', path: '/provider-interns' },
                  ].map(({ icon: Icon, label, count, action, tone, path }) => (
                    <button key={label} type="button" className={`provider-action-item ${tone}`} onClick={() => onNavigate(path)}>
                      <div className="provider-action-main">
                        <span className="provider-action-icon"><Icon size={15} /></span>
                        <span className="provider-action-count">{count}</span>
                        <span className="provider-action-label">{label}</span>
                      </div>
                      <span className="provider-action-link">{action}</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="provider-panel provider-activity-panel">
                <div className="provider-section-header">
                  <span>Delivery snapshot</span>
                </div>

                <ul className="provider-activity-list">
                  <li>
                    <span className="provider-activity-dot" />
                    <div>
                      <strong>{counts.internships} published internships</strong>
                      <small>{counts.draftInternships ? `${counts.draftInternships} still in draft` : 'All programs are live'}</small>
                    </div>
                  </li>
                  <li>
                    <span className="provider-activity-dot" />
                    <div>
                      <strong>{counts.applications} total applications</strong>
                      <small>{counts.pendingReview} awaiting your review</small>
                    </div>
                  </li>
                  <li>
                    <span className="provider-activity-dot" />
                    <div>
                      <strong>{counts.shortlisted} shortlisted or in interviews</strong>
                      <small>{counts.interviews} interviews scheduled in total</small>
                    </div>
                  </li>
                  <li>
                    <span className="provider-activity-dot" />
                    <div>
                      <strong>{counts.interns} active interns</strong>
                      <small>Mentor assignments currently running</small>
                    </div>
                  </li>
                </ul>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
