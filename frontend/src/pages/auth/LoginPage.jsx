import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import { login } from '../../services/publicExperience';
import '../../styles/AuthPage.css';

export default function LoginPage({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailState = touched.email ? (emailValid ? 'valid' : 'error') : 'default';

  const validate = () => {
    const next = {};
    if (!email.trim()) next.email = 'Email is required.';
    else if (!emailValid) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Password is required.';
    return next;
  };

  const handleBlur = (field) => setTouched((prev) => ({ ...prev, [field]: true }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const nextErrors = validate();
    setErrors(nextErrors);
    setTouched({ email: true, password: true });
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);
    const result = await login({ email: email.trim(), password });
    setIsLoading(false);

    if (result.ok) {
      const destination = result.role === 'provider'
        ? '/provider-dashboard'
        : result.role === 'mentor'
          ? '/mentor/dashboard'
          : '/intern/dashboard';
      if (onNavigate) onNavigate(destination);
      return;
    }
    setFormError(result.error);
  };

  return (
    <AuthLayout variant="login" onNavigate={onNavigate}>
      <div className="auth-heading">
        <h1>Welcome back</h1>
        <p>Continue your journey with InternFlow.</p>
      </div>



      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-email">Work Email Address</label>
          <div className="auth-input-wrap">
            <Mail size={17} className="auth-input-icon" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
              onBlur={() => handleBlur('email')}
              className={`auth-input ${emailState === 'error' ? 'is-error' : ''} ${emailState === 'valid' ? 'is-valid' : ''}`}
              aria-invalid={emailState === 'error'}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {emailState === 'valid' && (
              <span className="auth-valid-check"><CheckCircle2 size={16} /></span>
            )}
          </div>
          {errors.email && (
            <span id="login-email-error" className="auth-field-error">⚠ {errors.email}</span>
          )}
        </div>

        <div className="auth-field">
          <div className="auth-label">
            <label htmlFor="login-password">Password</label>
            <a
              href="/login"
              className="auth-label-hint auth-link"
              onClick={(e) => e.preventDefault()}
            >
              Forgot password?
            </a>
          </div>
          <div className="auth-input-wrap">
            <Lock size={17} className="auth-input-icon" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
              onBlur={() => handleBlur('password')}
              className={`auth-input ${errors.password ? 'is-error' : ''}`}
              style={{ paddingRight: '2.8rem' }}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            <button
              type="button"
              className="auth-pass-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && (
            <span id="login-password-error" className="auth-field-error">⚠ {errors.password}</span>
          )}
        </div>

        <div className="auth-check-row">
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in
          </label>
        </div>

        {formError && (
          <div className="auth-field-error" role="alert" style={{ marginBottom: '0.9rem' }}>
            ⚠ {formError}
          </div>
        )}

        <button type="submit" className="auth-btn" disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="auth-btn-spinner" aria-hidden="true" /> Signing in...
            </>
          ) : (
            <>
              Sign in <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>

      <div className="auth-switch-line" style={{ marginTop: '1.4rem' }}>
        Don&apos;t have an account?{' '}
        <a
          href="/register"
          onClick={(e) => { e.preventDefault(); if (onNavigate) onNavigate('/register'); }}
        >
          Create account
        </a>
      </div>
    </AuthLayout>
  );
}
