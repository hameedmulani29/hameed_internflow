import { ShieldCheck, Globe, Share2, Mail } from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import '../../styles/Footer.css';

export default function Footer({ onNavigate }) {
  const handleNavClick = (path, e) => {
    if (e) e.preventDefault();
    if (onNavigate) onNavigate(path);
  };

  return (
    <footer className="footer-container">
      {/* Quiet network decoration */}
      <div className="footer-network" aria-hidden="true">
        <div className="footer-network-grid" />
        <svg className="footer-network-svg" viewBox="0 0 260 200" fill="none">
          <line className="footer-network-edge" x1="40" y1="40" x2="150" y2="70" />
          <line className="footer-network-edge" x1="150" y1="70" x2="220" y2="30" />
          <line className="footer-network-edge" x1="150" y1="70" x2="130" y2="150" />
          <line className="footer-network-edge" x1="130" y1="150" x2="220" y2="120" />
          <line className="footer-network-edge" x1="40" y1="40" x2="130" y2="150" />
          <circle className="footer-network-node" cx="40" cy="40" r="4" />
          <circle className="footer-network-node" cx="150" cy="70" r="5" />
          <circle className="footer-network-node" cx="220" cy="30" r="3.5" />
          <circle className="footer-network-node" cx="130" cy="150" r="4.5" />
          <circle className="footer-network-node" cx="220" cy="120" r="3.5" />
        </svg>
      </div>

      <div className="container">
        <div className="footer-grid">
          {/* Brand Info */}
          <div className="footer-brand-col">
            <div className="footer-logo" onClick={(e) => handleNavClick('/', e)} style={{ cursor: 'pointer' }}>
              <img className="footer-logo-img" src={logoUrl} alt="InternFlow logo" />
              <span className="footer-logo-text">
                Intern<span className="footer-logo-highlight">Flow</span>
              </span>
            </div>
            <p className="footer-brand-desc">
              AI-powered internship operations platform automating recruitment, onboarding, task monitoring, evaluation, and verifiable certification.
            </p>
            <div className="footer-socials">
              <a href="#" className="footer-social-link" aria-label="Website"><Globe size={20} /></a>
              <a href="#" className="footer-social-link" aria-label="Share"><Share2 size={20} /></a>
              <a href="#" className="footer-social-link" aria-label="Contact"><Mail size={20} /></a>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="footer-title">Product</h4>
            <ul className="footer-link-list">
              <li><a href="#features" onClick={(e) => handleNavClick('/#features', e)} className="footer-link">Features</a></li>
              <li><a href="#how-it-works" onClick={(e) => handleNavClick('/#how-it-works', e)} className="footer-link">How It Works</a></li>
              <li><a href="/explore" onClick={(e) => handleNavClick('/explore', e)} className="footer-link">Explore Internships</a></li>
              <li><a href="#" className="footer-link">AI Resume Screening</a></li>
              <li><a href="#" className="footer-link">Task Workspace</a></li>
            </ul>
          </div>

          {/* User Links */}
          <div>
            <h4 className="footer-title">For Users</h4>
            <ul className="footer-link-list">
              <li><a href="/register?role=provider" onClick={(e) => handleNavClick('/register?role=provider', e)} className="footer-link">For Providers</a></li>
              <li><a href="/register?role=mentor" onClick={(e) => handleNavClick('/register?role=mentor', e)} className="footer-link">For Mentors</a></li>
              <li><a href="/register?role=candidate" onClick={(e) => handleNavClick('/register?role=candidate', e)} className="footer-link">For Interns</a></li>
              <li><a href="/login" onClick={(e) => handleNavClick('/login', e)} className="footer-link">Platform Login</a></li>
            </ul>
          </div>

          {/* Verification & Legal */}
          <div>
            <h4 className="footer-title">Verification</h4>
            <ul className="footer-link-list">
              <li>
                <a 
                  href="/verify" 
                  onClick={(e) => handleNavClick('/verify', e)} 
                  className="footer-verify-link"
                >
                  <ShieldCheck size={16} color="var(--color-primary-light)" /> Verify Certificate
                </a>
              </li>
              <li><a href="#" className="footer-link">Public Registry</a></li>
              <li><a href="#" className="footer-link">Privacy Policy</a></li>
              <li><a href="#" className="footer-link">Terms of Service</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div>
            © {new Date().getFullYear()} InternFlow Platform. All rights reserved.
          </div>
          <div className="footer-bottom-links">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Statement</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
