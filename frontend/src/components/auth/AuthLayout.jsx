import { ArrowLeft } from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import '../../styles/AuthPage.css';

/**
 * Shared split-screen shell for Login / Signup.
 * Left: brand panel with layered technical background (grid + glows + accent paths).
 * Right: auth form. On mobile the brand panel collapses to a slim top bar.
 */
export default function AuthLayout({ variant = 'login', children, footerNote, onNavigate }) {
  return (
    <div className={`auth-shell auth-shell-${variant}`}>
      {/* Back to Home Button */}
      <button
        type="button"
        className="auth-back-btn"
        onClick={() => onNavigate && onNavigate('/')}
        aria-label="Back to home"
      >
        <ArrowLeft size={16} />
        <span>Back to Home</span>
      </button>

      {/* Layered background */}
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-bg-gradient" />
        <div className="auth-bg-grid" />
        <div className="auth-bg-glow auth-bg-glow-1" />
        <div className="auth-bg-glow auth-bg-glow-2" />
        <div className={`auth-bg-paths auth-bg-paths-${variant}`}>
          <span /><span /><span />
        </div>
      </div>

      <div className="auth-shell-inner">
        {/* Brand / visual panel */}
        <aside className="auth-brand-panel">
          <div
            className="auth-brand-logo"
            onClick={() => onNavigate && onNavigate('/')}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onNavigate && onNavigate('/'); }}
          >
            <img src={logoUrl} alt="InternFlow logo" />
            <span>Intern<span>Flow</span></span>
          </div>

          <div className="auth-brand-copy">
            {variant === 'login' ? (
              <>
                <h2>Manage the journey<br />from application<br />to achievement.</h2>
                <p>
                  One platform for screening, onboarding, task tracking, evaluations,
                  and verifiable certificates.
                </p>
              </>
            ) : (
              <>
                <h2>Start where growth<br />becomes visible.</h2>
                <p>
                  Join InternFlow to run or experience internships with AI assistance
                  at every stage — and proof at the end.
                </p>
              </>
            )}
          </div>

          <ul className="auth-brand-points">
            {variant === 'login'
              ? ['AI-powered screening', 'Structured task tracking', 'Verifiable certificates']
                  .map((t) => <li key={t}><span className="auth-point-dot" />{t}</li>)
              : ['Providers run programs', 'Mentors guide growth', 'Interns build proof']
                  .map((t) => <li key={t}><span className="auth-point-dot auth-point-dot-green" />{t}</li>)}
          </ul>

          <div className="auth-brand-panel-footer">
            <span className="auth-brand-chip">Recruit → Certify</span>
            <span className="auth-brand-chip auth-brand-chip-quiet">Verify publicly</span>
          </div>
        </aside>

        {/* Form panel */}
        <main className="auth-form-panel">
          <div className="auth-form-card">
            <div className="auth-form-logo auth-form-logo-mobile">
              <img src={logoUrl} alt="InternFlow logo" />
              <span>Intern<span>Flow</span></span>
            </div>
            {children}
            {footerNote}
          </div>

          <p className="auth-shell-legal">
            Protected by standard session security. <LockInline />
          </p>
        </main>
      </div>
    </div>
  );
}

function LockInline() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginLeft: 4 }} aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
