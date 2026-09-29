import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger', // 'danger' | 'warning' | 'info'
  isLoading = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-dialog-card animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header">
          <div className={`modal-icon-badge tone-${tone}`}>
            <AlertTriangle size={20} />
          </div>
          <h2 id="modal-title" className="modal-dialog-title">{title}</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-dialog-body">
          <p>{message}</p>
        </div>

        <div className="modal-dialog-footer">
          <button type="button" className="provider-quiet-button" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn-confirm-action tone-${tone}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
