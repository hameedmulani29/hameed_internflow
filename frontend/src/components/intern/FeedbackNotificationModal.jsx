import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import '../../styles/FeedbackNotificationModal.css';

function formatDate(isoString) {
  if (!isoString) return 'Recently';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FeedbackNotificationModal({
  unreadItems = [],
  onClose,
  onViewFeedback,
  onMarkRead,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!unreadItems || unreadItems.length === 0) {
    return null;
  }

  const currentItem = unreadItems[currentIndex] || unreadItems[0];
  const totalItems = unreadItems.length;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % totalItems);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const handleView = async () => {
    setIsProcessing(true);
    try {
      if (onMarkRead && currentItem?.id) {
        await onMarkRead(currentItem.id);
      }
    } catch {
      // Continue anyway
    } finally {
      setIsProcessing(false);
      if (onViewFeedback) {
        onViewFeedback(currentItem);
      }
    }
  };

  const modalContent = (
    <div className="feedback-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="feedback-modal-card animate-pop-in">
        {/* Top Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="bell-icon-badge">
              <Bell size={20} />
            </div>
            <div>
              <h3 id="modal-title">New Mentor Feedback</h3>
              <p className="modal-subtitle">
                {totalItems > 1 ? `You have ${totalItems} unread mentor feedback entries.` : 'Your mentor has shared new feedback.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close feedback modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Carousel / Navigation Header if multiple */}
        {totalItems > 1 && (
          <div className="modal-carousel-bar">
            <span className="counter-tag">
              Feedback {currentIndex + 1} of {totalItems}
            </span>
            <div className="carousel-nav-btns">
              <button
                type="button"
                className="carousel-btn"
                onClick={handlePrev}
                aria-label="Previous feedback"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="carousel-btn"
                onClick={handleNext}
                aria-label="Next feedback"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Feedback Details Box */}
        <div className="modal-feedback-body">
          <div className="mentor-meta-row">
            <div className="mentor-avatar-sm">
              <UserCheck size={16} />
            </div>
            <div>
              <strong>{currentItem.mentor_name || currentItem.mentor || 'Assigned Mentor'}</strong>
              {currentItem.task_title && (
                <span className="task-pill">Task: {currentItem.task_title}</span>
              )}
            </div>
            <span className="feedback-date">{formatDate(currentItem.created_at)}</span>
          </div>

          <div className="feedback-quote-box">
            <MessageSquare size={16} className="quote-icon" />
            <p className="quote-text">"{currentItem.feedback || currentItem.message}"</p>
          </div>

          {currentItem.strengths && (
            <div className="feedback-section-box box-strengths">
              <strong>Strengths:</strong>
              <p>{currentItem.strengths}</p>
            </div>
          )}

          {(currentItem.improvements || currentItem.areas_for_improvement) && (
            <div className="feedback-section-box box-improvements">
              <strong>Areas for Improvement:</strong>
              <p>{currentItem.improvements || currentItem.areas_for_improvement}</p>
            </div>
          )}

          {currentItem.next_steps && (
            <div className="feedback-section-box box-nextsteps">
              <strong>Recommended Next Steps:</strong>
              <p>{currentItem.next_steps}</p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="modal-footer-row">
          <button
            type="button"
            className="btn btn-outline modal-later-btn"
            onClick={onClose}
          >
            Later
          </button>
          <button
            type="button"
            className="btn btn-primary glass-btn-primary modal-view-btn"
            onClick={handleView}
            disabled={isProcessing}
          >
            <ShieldCheck size={16} />
            <span>{isProcessing ? 'Opening...' : 'View Feedback'}</span>
          </button>
        </div>

        {/* Decreasing Animated Line at Bottom of Popup Card */}
        <div className="notification-progress-bar-container">
          <div key={currentItem?.id || currentIndex} className="notification-progress-bar-line" />
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

