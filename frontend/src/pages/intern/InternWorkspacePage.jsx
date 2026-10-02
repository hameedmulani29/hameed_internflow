import { useMemo } from 'react';
import InternBackground from '../../components/intern/InternBackground';
import InternFloatingOrb from '../../components/intern/InternFloatingOrb';
import InternDashboardPage from './InternDashboardPage';
import InternInternshipWorkspacePage from './InternInternshipWorkspacePage';
import ExploreInternshipsPage from './ExploreInternshipsPage';
import InternshipDetailsPage from './InternshipDetailsPage';
import ApplicationFlowPage from './ApplicationFlowPage';
import ApplicationSubmittedPage from './ApplicationSubmittedPage';
import ApplicationTrackingPage from './ApplicationTrackingPage';
import AssessmentPage from './AssessmentPage';
import InterviewPage from './InterviewPage';
import MentorFeedbackPage from './MentorFeedbackPage';
import MySkillsPage from './MySkillsPage';

/**
 * InternWorkspacePage — Master Component for Intern Role Experience
 *
 * Enforces:
 * - Reusable InternBackground (Glass + Floating Light)
 * - Single Floating Circular Navigation Orb (NO top navbar, NO sidebar, NO bottom nav)
 * - Routing across all 9 exact agreed Intern routes:
 *   1. /intern/dashboard
 *   2. /intern/explore
 *   3. /intern/internships/:id
 *   4. /intern/applications/:id/apply
 *   5. /intern/applications/:id/submitted
 *   6. /intern/applications/:id/track
 *   7. /intern/applications/:id/assessment
 *   8. /intern/applications/:id/interview
 */
export default function InternWorkspacePage({ path = '/intern/dashboard', onNavigate }) {
  // Parse sub-route and dynamic params
  const { routeKey, dynamicId } = useMemo(() => {
    // Dynamic matching
    const parts = path.split('/');
    if (path.startsWith('/intern/internship/')) {
      // Selected candidate → their active internship workspace (assignment-scoped).
      return { routeKey: 'internship-workspace', dynamicId: parts[3] || null };
    }
    if (path.startsWith('/intern/internships/')) {
      const parts = path.split('/');
      return { routeKey: 'internship-details', dynamicId: parts[3] || null };
    }
    if (path.includes('/apply')) {
      const parts = path.split('/');
      return { routeKey: 'apply', dynamicId: parts[3] || null };
    }
    if (path.includes('/submitted')) {
      const parts = path.split('/');
      return { routeKey: 'submitted', dynamicId: parts[3] || null };
    }
    if (path.includes('/track')) {
      const parts = path.split('/');
      return { routeKey: 'track', dynamicId: parts[3] || null };
    }
    if (path.includes('/assessment')) {
      const parts = path.split('/');
      return { routeKey: 'assessment', dynamicId: parts[3] || null };
    }
    if (path.includes('/interview')) {
      const parts = path.split('/');
      return { routeKey: 'interview', dynamicId: parts[3] || null };
    }
    if (path === '/intern/explore') {
      return { routeKey: 'explore', dynamicId: null };
    }
    if (path === '/intern/my-skills') {
      return { routeKey: 'my-skills', dynamicId: null };
    }
    if (path === '/intern/mentor-feedback' || path.startsWith('/intern/mentor-feedback') || path === '/mentor-feedback' || path.startsWith('/mentor-feedback') || path.includes('/mentor') || path.includes('/feedback')) {
      return { routeKey: 'mentor-feedback', dynamicId: null };
    }
    return { routeKey: 'dashboard', dynamicId: null };
  }, [path]);

  const renderContent = () => {
    switch (routeKey) {
      case 'explore':
        return <ExploreInternshipsPage onNavigate={onNavigate} />;
      case 'internship-workspace':
        return <InternInternshipWorkspacePage onNavigate={onNavigate} />;
      case 'internship-details':
        return <InternshipDetailsPage internshipId={dynamicId} onNavigate={onNavigate} />;
      case 'apply':
        return <ApplicationFlowPage internshipId={dynamicId} onNavigate={onNavigate} />;
      case 'submitted':
        return <ApplicationSubmittedPage applicationId={dynamicId} onNavigate={onNavigate} />;
      case 'track':
        return <ApplicationTrackingPage applicationId={dynamicId} onNavigate={onNavigate} />;
      case 'assessment':
        return <AssessmentPage applicationId={dynamicId} onNavigate={onNavigate} />;
      case 'interview':
        return <InterviewPage applicationId={dynamicId} onNavigate={onNavigate} />;
      case 'mentor-feedback':
        return <MentorFeedbackPage onNavigate={onNavigate} />;
      case 'my-skills':
        return <MySkillsPage onNavigate={onNavigate} />;
      case 'dashboard':
      default:
        return <InternDashboardPage onNavigate={onNavigate} />;
    }
  };

  return (
    <InternBackground currentPath={path}>
      {/* Page Content */}
      {renderContent()}

      {/* Floating Circular Navigation Orb (The ONLY Navigation for Intern Role) */}
      <InternFloatingOrb currentPath={path} onNavigate={onNavigate} />
    </InternBackground>
  );
}
