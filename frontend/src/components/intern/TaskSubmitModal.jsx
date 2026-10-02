import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { submitInternTask } from '../../services/internService';

/**
 * TaskSubmitModal — shared task-submission dialog for intern screens.
 *
 * Extracted verbatim from InternDashboardPage so the internship workspace can
 * reuse the exact same submission flow (single task system, single API:
 * POST /api/interns/tasks/{id}/submit). Renders through a portal with the
 * standard glass styling used across the intern experience.
 */
export default function TaskSubmitModal({ tasks = [], initialTaskId = '', onClose, onSubmitted }) {
  const [taskDraft, setTaskDraft] = useState({ taskId: initialTaskId ? String(initialTaskId) : '', content: '', repo_url: '', demo_url: '', notes: '' });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskError, setTaskError] = useState('');

  const handleTaskSubmit = async (event) => {
    event.preventDefault();
    if (!taskDraft.taskId) {
      setTaskError('Please select a task to submit.');
      return;
    }
    if (!taskDraft.content.trim() || taskDraft.content.trim().length < 10) {
      setTaskError('Please write at least 10 characters summarizing your work.');
      return;
    }

    setIsSubmittingTask(true);
    setTaskError('');
    try {
      const submission = await submitInternTask(Number(taskDraft.taskId), {
        content: taskDraft.content.trim(),
        repo_url: taskDraft.repo_url.trim() || undefined,
        demo_url: taskDraft.demo_url.trim() || undefined,
        notes: taskDraft.notes.trim() || undefined,
      });
      if (typeof onSubmitted === 'function') {
        onSubmitted(submission);
      }
      onClose();
    } catch (error) {
      setTaskError(error.message || 'Failed to submit task. Please check your network connection.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(8, 12, 24, 0.75)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', zIndex: 99999 }} onClick={onClose}>
      <div className="glass-card" style={{ width: 'min(640px, calc(100vw - 2rem))', padding: '1.5rem', background: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0', boxShadow: '0 20px 30px rgba(0,0,0,0.25)', borderRadius: '16px' }} onClick={(event) => event.stopPropagation()}>
        <div className="section-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '1.2rem', color: '#0f172a' }}>Submit Task Work</h3>
            <p className="section-subtitle" style={{ color: '#64748b' }}>Share progress, repository links, and notes for your mentor.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleTaskSubmit}>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Task *</span>
              <select value={taskDraft.taskId} onChange={(event) => setTaskDraft((current) => ({ ...current, taskId: event.target.value }))} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem' }}>
                {tasks.map((task) => (
                  <option key={task.id} value={String(task.id)}>{task.title} ({task.status})</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Summary *</span>
              <textarea value={taskDraft.content} onChange={(event) => setTaskDraft((current) => ({ ...current, content: event.target.value }))} rows={5} placeholder="Describe what you completed, implementation details, and outcomes of this task." style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Repository URL</span>
                <input value={taskDraft.repo_url} onChange={(event) => setTaskDraft((current) => ({ ...current, repo_url: event.target.value }))} placeholder="https://github.com/your-repo" style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem' }} />
              </label>
              <label style={{ display: 'grid', gap: '0.3rem' }}>
                <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Demo URL</span>
                <input value={taskDraft.demo_url} onChange={(event) => setTaskDraft((current) => ({ ...current, demo_url: event.target.value }))} placeholder="https://demo.example.com" style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem' }} />
              </label>
            </div>

            <label style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ color: '#334155', fontWeight: 600, fontSize: '0.88rem' }}>Notes / Follow-ups</span>
              <textarea value={taskDraft.notes} onChange={(event) => setTaskDraft((current) => ({ ...current, notes: event.target.value }))} rows={2} placeholder="Add any context or questions for your mentor." style={{ borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', padding: '0.75rem', fontSize: '0.9rem', resize: 'vertical' }} />
            </label>
          </div>

          {taskError && <p style={{ color: '#dc2626', marginTop: '0.75rem', fontSize: '0.85rem' }} role="alert">{taskError}</p>}

          <div className="card-footer-actions" style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-subtle btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmittingTask}>
              {isSubmittingTask ? 'Submitting...' : 'Submit Deliverable'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
