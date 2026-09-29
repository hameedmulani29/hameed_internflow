import { useState } from 'react';
import { ShieldCheck, ArrowRight, Menu, X } from 'lucide-react';
import { useScrolled, useMagnetic, usePrefersReducedMotion, useScrollSpy } from '../../hooks/useMotionHooks';
import logoUrl from '../../assets/logo.png';
import '../../styles/Header.css';

/**
 * Navbar behavior:
 * - "How It Works" / "Features" target landing-page sections:
 *     on the landing page they smooth-scroll and highlight via scroll-spy;
 *     from another page they navigate to that landing section.
 * - "Explore Internships" / "Verify Certificate" are standalone pages:
 *     they navigate to /explore and /verify and stay highlighted while active.
 */
const SECTION_IDS = ['features', 'how-it-works'];
const NAV_ITEMS = [
  { id: 'how-it-works', label: 'How It Works', kind: 'section' },
  { id: 'features', label: 'Features', kind: 'section' },
  { label: 'Explore Internships', kind: 'route', route: '/explore' },
  { label: 'Verify Certificate', kind: 'route', route: '/verify', variant: 'verify' },
];
const HEADER_OFFSET = 84;

export default function Header({ activePath, onNavigate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const scrolled = useScrolled(24);
  const reducedMotion = usePrefersReducedMotion();
  const ctaRef = useMagnetic(reducedMotion, 4);

  const onLanding = activePath === '/';
  const spySection = useScrollSpy(SECTION_IDS.join(','), onLanding);

  const scrollToSection = (id) => {
    const target = document.getElementById(id);
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET, behavior: reducedMotion ? 'auto' : 'smooth' });
    window.history.replaceState({}, '', `/#${id}`);
  };

  const handleSectionClick = (item) => (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (onLanding) {
      scrollToSection(item.id);
      return;
    }
    // Navigate to the landing page section; App.jsx scrolls on render
    if (onNavigate) onNavigate(`/#${item.id}`);
  };

  const handleRouteClick = (item) => (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (onNavigate) onNavigate(item.route);
  };

  const isActive = (item) =>
    item.kind === 'route' ? activePath === item.route : onLanding && spySection === item.id;

  const linkClass = (item) =>
    item.variant === 'verify'
      ? `header-nav-link-verify ${isActive(item) ? 'active' : ''}`
      : `header-nav-link ${isActive(item) ? 'active' : ''}`;

  const renderLink = (item) =>
    item.variant === 'verify' ? (
      <a key={item.route} href={item.route} onClick={handleRouteClick(item)} className={linkClass(item)}>
        <ShieldCheck size={16} color="var(--color-primary)" /> {item.label}
      </a>
    ) : item.kind === 'route' ? (
      <a key={item.route} href={item.route} onClick={handleRouteClick(item)} className={linkClass(item)}>
        {item.label}
      </a>
    ) : (
      <a key={item.id} href={`/#${item.id}`} onClick={handleSectionClick(item)} className={linkClass(item)}>
        {item.label}
      </a>
    );

  return (
    <header className={`header-container ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container header-inner">
        {/* Logo */}
        <div onClick={(e) => { e.preventDefault(); if (onNavigate) onNavigate('/'); }} className="header-logo">
          <img className="header-logo-img" src={logoUrl} alt="InternFlow logo" />
          <span className="header-logo-text">
            Intern<span className="header-logo-highlight">Flow</span>
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="header-nav" aria-label="Primary">
          {NAV_ITEMS.map(renderLink)}
        </nav>

        {/* Action Buttons */}
        <div className="header-actions">
          <button className="btn btn-outline" onClick={() => onNavigate && onNavigate('/login')}>
            Login
          </button>
          <button
            ref={ctaRef}
            className="btn btn-primary header-cta"
            onClick={() => onNavigate && onNavigate('/register')}
          >
            Get Started <ArrowRight size={16} />
          </button>
        </div>

        {/* Mobile Toggle Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="header-mobile-toggle"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="header-mobile-drawer">
          {NAV_ITEMS.map((item) =>
            item.variant === 'verify' ? (
              <a key={item.route} href={item.route} onClick={handleRouteClick(item)} className={linkClass(item)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} color="var(--color-primary)" /> {item.label}
              </a>
            ) : item.kind === 'route' ? (
              <a key={item.route} href={item.route} onClick={handleRouteClick(item)} className={linkClass(item)}>
                {item.label}
              </a>
            ) : (
              <a key={item.id} href={`/#${item.id}`} onClick={handleSectionClick(item)} className={linkClass(item)}>
                {item.label}
              </a>
            )
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => onNavigate && onNavigate('/login')}>
              Login
            </button>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => onNavigate && onNavigate('/register')}>
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
