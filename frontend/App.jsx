import { useState, useEffect } from 'react';
import PublicLayout from './src/components/layout/PublicLayout';
import LandingPage from './src/pages/public/LandingPage';
import ExploreInternshipsPage from './src/pages/public/ExploreInternshipsPage';
import VerifyCertificatePage from './src/pages/public/VerifyCertificatePage';
import LoginPage from './src/pages/auth/LoginPage';
import RegisterPage from './src/pages/auth/RegisterPage';
import ProviderDashboardPage from './src/pages/provider/ProviderDashboardPage';
import ProviderWorkspacePage from './src/pages/provider/ProviderWorkspacePage';
import MentorWorkspacePage from './src/pages/mentor/MentorWorkspacePage';
import InternWorkspacePage from './src/pages/intern/InternWorkspacePage';
import { getSession } from './src/services/publicExperience';

const providerWorkspacePaths = new Set([
  '/provider-internships',
  '/provider-internship-new',
  '/provider-internship-details',
  '/provider-applications',
  '/provider-candidate',
  '/provider-screening',
  '/provider-interviews',
  '/provider-assessments',
  '/provider-interns',
  '/provider-mentors',
  '/provider-mentor-details',
  '/provider-intern-details',
  '/provider-reports',
  '/provider-certificates',
  '/provider-automation',
  '/provider-settings',
]);

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname || '/');

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname || '/';
      setCurrentPath(p);
    };
    const handleSessionChange = () => {
      const p = window.location.pathname || '/';
      setCurrentPath(p);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('internflow_session_changed', handleSessionChange);
    window.addEventListener('storage', handleSessionChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('internflow_session_changed', handleSessionChange);
      window.removeEventListener('storage', handleSessionChange);
    };
  }, []);

  useEffect(() => {
    const hashPart = window.location.hash.slice(1);
    if (!hashPart) return undefined;
    const scrollToHash = window.setTimeout(() => {
      const target = document.getElementById(hashPart);
      if (target) {
        const top = target.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: 'auto' });
      }
    }, 120);
    return () => window.clearTimeout(scrollToHash);
  }, [currentPath]);

  const handleNavigate = (path) => {
    const [targetPathWithQuery, hashPart] = path.split('#');
    const targetPath = targetPathWithQuery || '/';
    const basePath = targetPath.split('?')[0] || '/';
    window.history.pushState({}, '', path);
    setCurrentPath(basePath);

    if (hashPart) {
      window.setTimeout(() => {
        const target = document.getElementById(hashPart);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }, 120);
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const isAuthPage = currentPath === '/login' || currentPath === '/register';
  const isProviderPage = currentPath.startsWith('/provider');
  const isMentorPage = (currentPath === '/mentor' || currentPath.startsWith('/mentor/')) && currentPath !== '/mentor-feedback' && !currentPath.startsWith('/intern');
  const isInternPage = currentPath.startsWith('/intern') || currentPath === '/mentor-feedback';

  // Guard Provider & Mentor Workspaces
  if (isProviderPage || isMentorPage) {
    const expectedRole = isMentorPage ? 'mentor' : 'provider';
    const roleSession = getSession(expectedRole);
    if (!roleSession?.token || roleSession.user?.role !== expectedRole) {
      return <div className="auth-route-root"><LoginPage onNavigate={handleNavigate} /></div>;
    }
    return isMentorPage
      ? <MentorWorkspacePage path={currentPath} onNavigate={handleNavigate} />
      : providerWorkspacePaths.has(currentPath)
        ? <ProviderWorkspacePage path={currentPath} onNavigate={handleNavigate} />
        : <ProviderDashboardPage onNavigate={handleNavigate} />;
  }

  // Intern Role Workspace (Dedicated Environment with Glass + Floating Light and Floating Orb Nav)
  if (isInternPage) {
    return <InternWorkspacePage path={currentPath} onNavigate={handleNavigate} />;
  }

  if (isAuthPage) {
    return <div className="auth-route-root">{renderPageContent()}</div>;
  }

  function renderPageContent() {
    switch (true) {
      case currentPath === '/explore':
        return <ExploreInternshipsPage onNavigate={handleNavigate} />;
      case currentPath === '/verify' || currentPath.startsWith('/verify/'):
        return <VerifyCertificatePage onNavigate={handleNavigate} />;
      case currentPath === '/login':
        return <LoginPage onNavigate={handleNavigate} />;
      case currentPath === '/register':
        return <RegisterPage onNavigate={handleNavigate} />;
      case currentPath === '/':
      default:
        return <LandingPage onNavigate={handleNavigate} />;
    }
  }

  return (
    <PublicLayout activePath={currentPath} onNavigate={handleNavigate}>
      {renderPageContent()}
    </PublicLayout>
  );
}
