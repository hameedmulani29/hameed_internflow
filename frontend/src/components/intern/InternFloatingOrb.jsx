import { useState, useEffect, useRef } from 'react';
import {
  Compass,
  LayoutDashboard,
  FileCheck,
  BrainCircuit,
  Video,
  Sparkles,
  X,
  LogOut,
  MessagesSquare
} from 'lucide-react';
import { clearSession } from '../../services/publicExperience';
import { fetchMyApplications } from '../../services/internService';
import { fetchUnreadFeedbackCount } from '../../services/mentorFeedbackService';
import '../../styles/InternFloatingOrb.css';

/**
 * InternFloatingOrb Component
 * Alignment Fix:
 * Each sub-section node (Icon + Section Name Tag) is centered perfectly on the circular ring vector:
 * `transform: translate(-50%, -50%) translate(dx, dy)`
 */
export default function InternFloatingOrb({ currentPath, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [customPos, setCustomPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef(null);
  const dragInfoRef = useRef({ isDown: false, startX: 0, startY: 0, initialX: 0, initialY: 0, moved: false });

  // Latest real application id from the backend; null until one exists.
  const [activeAppId, setActiveAppId] = useState(null);
  const [unreadFeedbackCount, setUnreadFeedbackCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    fetchMyApplications()
      .then((items) => {
        if (isMounted && Array.isArray(items) && items.length > 0) {
          setActiveAppId(items[0].id);
        }
      })
      .catch(() => {
        /* Orb navigation still works; tracking entries just stay hidden. */
      });

    fetchUnreadFeedbackCount()
      .then((res) => {
        if (isMounted && typeof res?.unread_count === 'number') {
          setUnreadFeedbackCount(res.unread_count);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentPath]);

  useEffect(() => {
    const handleResize = () => {
      if (customPos) {
        setCustomPos((prev) => ({
          x: Math.min(prev.x, window.innerWidth - 90),
          y: Math.min(prev.y, window.innerHeight - 90)
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [customPos]);

  // Drag Handlers
  const handleDragStart = (clientX, clientY) => {
    const currentX = customPos ? customPos.x : window.innerWidth - 100;
    const currentY = customPos ? customPos.y : window.innerHeight - 120;
    dragInfoRef.current = {
      isDown: true,
      startX: clientX,
      startY: clientY,
      initialX: currentX,
      initialY: currentY,
      moved: false
    };
    setIsDragging(true);
  };

  const handleDragMove = (clientX, clientY) => {
    if (!dragInfoRef.current.isDown) return;

    const deltaX = clientX - dragInfoRef.current.startX;
    const deltaY = clientY - dragInfoRef.current.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragInfoRef.current.moved = true;
    }

    const newX = Math.max(20, Math.min(window.innerWidth - 90, dragInfoRef.current.initialX + deltaX));
    const newY = Math.max(20, Math.min(window.innerHeight - 90, dragInfoRef.current.initialY + deltaY));

    setCustomPos({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    dragInfoRef.current.isDown = false;
    setIsDragging(false);
  };

  // Global listeners
  useEffect(() => {
    const onMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e) => {
      if (e.touches[0]) handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => handleDragEnd();

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [customPos]);

  const handleOrbClick = () => {
    if (dragInfoRef.current.moved) {
      dragInfoRef.current.moved = false;
      return;
    }
    setIsOpen(!isOpen);
  };

  const handleNavClick = (path) => {
    setIsOpen(false);
    if (onNavigate) onNavigate(path);
  };

  const handleLogout = () => {
    clearSession();
    if (onNavigate) onNavigate('/login');
  };

  // Nav Items Definitions with explicit Section Names
  const navItems = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: LayoutDashboard,
      path: '/intern/dashboard',
      isActive: currentPath === '/intern/dashboard',
      colorClass: 'radial-cyan'
    },
    {
      id: 'explore',
      name: 'Explore',
      icon: Compass,
      path: '/intern/explore',
      isActive: currentPath === '/intern/explore' || currentPath.includes('/internships/'),
      colorClass: 'radial-mint'
    },
    {
      id: 'track',
      name: 'Tracking',
      icon: FileCheck,
      // No application yet → the dashboard's empty state explains next steps.
      path: activeAppId ? `/intern/applications/${activeAppId}/track` : '/intern/dashboard',
      isActive: currentPath.includes('/track') || currentPath.includes('/submitted') || currentPath.includes('/apply'),
      colorClass: 'radial-amber'
    },
    {
      id: 'assessment',
      name: 'Assessment',
      icon: BrainCircuit,
      path: activeAppId ? `/intern/applications/${activeAppId}/assessment` : '/intern/dashboard',
      isActive: currentPath.includes('/assessment'),
      colorClass: 'radial-indigo'
    },
    {
      id: 'interview',
      name: 'Interview',
      icon: Video,
      path: activeAppId ? `/intern/applications/${activeAppId}/interview` : '/intern/dashboard',
      isActive: currentPath.includes('/interview'),
      colorClass: 'radial-purple'
    },
    {
      id: 'my-skills',
      name: 'My Skills',
      icon: Sparkles,
      path: '/intern/my-skills',
      isActive: currentPath === '/intern/my-skills',
      colorClass: 'radial-violet'
    },
    {
      id: 'mentor-feedback',
      name: unreadFeedbackCount > 0 ? `Feedback [${unreadFeedbackCount}]` : 'Feedback',
      icon: MessagesSquare,
      path: '/intern/mentor-feedback',
      isActive: currentPath === '/intern/mentor-feedback' || currentPath.startsWith('/intern/mentor-feedback') || currentPath === '/mentor-feedback',
      colorClass: 'radial-teal',
      badgeCount: unreadFeedbackCount
    }
  ];

  const totalItems = navItems.length; // 7 items
  const radius = 145; // Radial distance in px from orb center

  return (
    <div
      className={`intern-orb-wrapper ${isDragging ? 'is-dragging' : ''}`}
      style={customPos ? { left: `${customPos.x}px`, top: `${customPos.y}px` } : { right: '28px', bottom: '28px' }}
      ref={containerRef}
    >
      {/* Equal Circular Radial Menu Ring Layout */}
      {isOpen && (
        <div className="radial-circular-ring">
          {navItems.map((item, idx) => {
            const IconComp = item.icon;
            // Equal 360° circular angular math (72° per item, starting at -90° top)
            const angleDeg = (idx * (360 / totalItems)) - 90;
            const rad = (angleDeg * Math.PI) / 180;
            const dx = Math.round(Math.cos(rad) * radius);
            const dy = Math.round(Math.sin(rad) * radius);

            return (
              <div
                key={item.id}
                className="radial-node-item animate-radial-ring-pop"
                style={{
                  transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px)`,
                  animationDelay: `${idx * 45}ms`
                }}
              >
                <button
                  className={`radial-circle-btn ${item.colorClass} ${item.isActive ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.path)}
                  title={item.name}
                  style={{ position: 'relative' }}
                >
                  <IconComp size={20} />
                  {item.badgeCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                        border: '1.5px solid #0f172a'
                      }}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </button>
                {/* Explicit Section Name Tag Centered Below Icon */}
                <span className={`radial-section-tag ${item.isActive ? 'active-tag' : ''}`}>
                  {item.name}
                </span>
              </div>
            );
          })}

          {/* Quick Sign Out Action (Centered cleanly below Assessment sub-section) */}
          <div
            className="radial-node-item animate-radial-ring-pop"
            style={{
              transform: 'translate(-50%, -50%) translate(0px, 235px)',
              animationDelay: '250ms'
            }}
          >
            <button className="radial-circle-btn radial-danger" onClick={handleLogout} title="Sign Out">
              <LogOut size={16} />
            </button>
            <span className="radial-section-tag tag-danger">Sign Out</span>
          </div>
        </div>
      )}

      {/* Main Trigger — PERFECT CIRCULAR ORB BUTTON */}
      <div className="perfect-circular-orb-group">
        <button
          className={`circular-orb-trigger ${isOpen ? 'open' : ''}`}
          onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            if (e.touches[0]) handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onClick={handleOrbClick}
          aria-label="Your Journey Navigation Orb"
        >
          <div className="orb-trigger-glow" />
          <div className="orb-icon-inner">
            {isOpen ? <X size={26} /> : <Sparkles size={26} />}
          </div>
          <span className={`orb-status-dot ${unreadFeedbackCount > 0 ? 'has-unread' : ''}`} style={unreadFeedbackCount > 0 ? { background: '#ef4444', width: '18px', height: '18px', top: '0', right: '0', fontSize: '0.65rem', fontWeight: 'bold', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(239, 68, 68, 0.8)' } : {}}>
            {unreadFeedbackCount > 0 ? unreadFeedbackCount : null}
          </span>
        </button>

        {/* Attached "Your Journey" Glass Label Tag */}
        <span className="your-journey-tag">
          Your Journey
        </span>
      </div>
    </div>
  );
}
