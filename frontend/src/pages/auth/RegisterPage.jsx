import { useState } from 'react';
import { Building, User, UserCheck, Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { signup } from '../../services/publicExperience';
import '../../styles/AuthPage.css';

const ROLES = [
  {
    id: 'provider',
    name: 'Provider',
    desc: 'Manage internships',
    icon: Building,
    heading: 'Start your InternFlow journey.',
    sub: 'Create your organization account and start running internship programs.'
  },
  {
    id: 'intern',
    name: 'Intern',
    desc: 'Learn, build and grow',
    icon: User,
    heading: 'Start your InternFlow journey.',
    sub: 'Create your account to discover internships and track your growth.'
  },
  {
    id: 'mentor',
    name: 'Mentor',
    desc: 'Guide and evaluate',
    icon: UserCheck,
    heading: 'Start your InternFlow journey.',
    sub: 'Create your account to guide interns and shape their progress.'
  }
];

export default function RegisterPage({ onNavigate }) {
  const [role, setRole] = useState('provider');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState(null);

  const activeRole = ROLES.find((r) => r.id === role);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passValid = password.length >= 8;
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = 'Full name is required.';
    if (role === 'provider' && !orgName.trim()) next.orgName = 'Organization name is required.';
    if (!emailValid) next.email = email.trim() ? 'Enter a valid email address.' : 'Email is required.';
    if (!passValid) next.password = 'Password must be at least 8 characters.';
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.';
    return next;
  };

  const handleBlur = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    setTouched({ fullName: true, orgName: true, email: true, password: true, confirmPassword: true });
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);
    const result = await signup({ role, fullName: fullName.trim(), email: email.trim(), password, organization: orgName.trim() });
    setIsLoading(false);

    if (result.ok) {
      setIsSuccess(true);
      window.setTimeout(() => {
        if (onNavigate) onNavigate('/login');
      }, 1600);
    } else {
      setFormError(result.error);
    }
  };

  const clearError = (field) => {
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  if (isSuccess) {
    return (
      <AuthLayout variant="signup" onNavigate={onNavigate}>
        <div className="auth-heading" style={{ textAlign: 'center' }}>
          <CheckCircle2 size={52} color="#4ADE80" style={{ margin: '0 auto 1rem auto' }} />
          <h1>Account created!</h1>
          <p>You&apos;re all set as a {activeRole.name.toLowerCase()}. Redirecting you to sign in...</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="signup" onNavigate={onNavigate}>
      <div className="auth-heading">
        <h1>{activeRole.heading}</h1>
        <p>{activeRole.sub}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <span className="auth-label" style={{ marginBottom: '0.55rem', display: 'flex' }}>I am joining as</span>
        <div className="auth-role-grid" role="radiogroup" aria-label="Account role">
          {ROLES.map((r, i) => {
            const Icon = r.icon;
            const isActive = role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setRole(r.id)}
                className={`auth-role-card ${isActive ? 'is-active' : ''}`}
                style={{ '--role-delay': `${i * 90}ms` }}
              >
                <span className="auth-role-icon"><Icon size={16} /></span>
                <span className="auth-role-name">{r.name}</span>
                <span className="auth-role-desc">{r.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-name">Full Name</label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Ananya Sen"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); clearError('fullName'); }}
            onBlur={() => handleBlur('fullName')}
            className={`auth-input ${touched.fullName && errors.fullName ? 'is-error' : ''}`}
            style={{ paddingLeft: '1rem' }}
            aria-invalid={touched.fullName && !!errors.fullName}
          />
          {touched.fullName && errors.fullName && (
            <span className="auth-field-error">⚠ {errors.fullName}</span>
          )}
        </div>

        {(role === 'provider' || role === 'mentor') && (
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-org">Organization {role === 'mentor' && '(Optional)'}</label>
            <input
              id="reg-org"
              type="text"
              autoComplete="organization"
              placeholder={role === 'mentor' ? "e.g. Acme Innovations" : "e.g. Acme Innovations"}
              value={orgName}
              onChange={(e) => { setOrgName(e.target.value); clearError('orgName'); }}
              onBlur={() => handleBlur('orgName')}
              className={`auth-input ${touched.orgName && errors.orgName ? 'is-error' : ''}`}
              style={{ paddingLeft: '1rem' }}
              aria-invalid={touched.orgName && !!errors.orgName}
            />
            {touched.orgName && errors.orgName && (
              <span className="auth-field-error">⚠ {errors.orgName}</span>
            )}
          </div>
        )}

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-email">Email Address</label>
          <div className="auth-input-wrap">
            <Mail size={17} className="auth-input-icon" />
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder={role === 'mentor' ? 'you@dev.in' : 'you@company.com'}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
              onBlur={() => handleBlur('email')}
              className={`auth-input ${touched.email && errors.email ? 'is-error' : ''} ${touched.email && emailValid ? 'is-valid' : ''}`}
              aria-invalid={touched.email && !!errors.email}
            />
            {touched.email && emailValid && (
              <span className="auth-valid-check"><CheckCircle2 size={16} /></span>
            )}
          </div>
          {touched.email && errors.email && (
            <span className="auth-field-error">⚠ {errors.email}</span>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-password">Password</label>
          <div className="auth-input-wrap">
            <Lock size={17} className="auth-input-icon" />
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
              onBlur={() => handleBlur('password')}
              className={`auth-input ${touched.password && errors.password ? 'is-error' : ''} ${touched.password && passValid ? 'is-valid' : ''}`}
              style={{ paddingRight: '2.8rem' }}
              aria-invalid={touched.password && !!errors.password}
            />
            <button
              type="button"
              className="auth-pass-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {touched.password && errors.password && (
            <span className="auth-field-error">⚠ {errors.password}</span>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
          <div className="auth-input-wrap">
            <Lock size={17} className="auth-input-icon" />
            <input
              id="reg-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
              onBlur={() => handleBlur('confirmPassword')}
              className={`auth-input ${touched.confirmPassword && errors.confirmPassword ? 'is-error' : ''} ${touched.confirmPassword && confirmValid ? 'is-valid' : ''}`}
              aria-invalid={touched.confirmPassword && !!errors.confirmPassword}
            />
            {touched.confirmPassword && confirmValid && (
              <span className="auth-valid-check"><CheckCircle2 size={16} /></span>
            )}
          </div>
          {touched.confirmPassword && errors.confirmPassword && (
            <span className="auth-field-error">⚠ {errors.confirmPassword}</span>
          )}
        </div>

        {formError && <div className="auth-field-error" role="alert" style={{ marginBottom: '0.9rem' }}>⚠ {formError}</div>}

        <button type="submit" className="auth-btn" style={{ marginTop: '0.4rem' }} disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="auth-btn-spinner" aria-hidden="true" /> Creating account...
            </>
          ) : (
            <>
              Create account <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>

      <div className="auth-switch-line" style={{ marginTop: '1.4rem' }}>
        Already registered?{' '}
        <a
          href="/login"
          onClick={(e) => { e.preventDefault(); if (onNavigate) onNavigate('/login'); }}
        >
          Sign in
        </a>
      </div>
    </AuthLayout>
  );
}
