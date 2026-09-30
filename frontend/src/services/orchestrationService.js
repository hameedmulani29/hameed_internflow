/**
 * AI Internship Orchestrator — client-side derivations.
 *
 * Everything here is computed from REAL backend payloads (mentor dashboard,
 * mentor tasks, submissions, evaluations). Nothing invents backend fields:
 * where a true AI/orchestration service is required, the gap is documented in
 * AUDIT_AI_ORCHESTRATION.md and the UI renders honest derived states instead.
 *
 * Progress states are presentation-only system estimates (prompt §17/§28):
 * they always carry the underlying evidence and never claim AI authority.
 */

export const PROGRESS_STATES = {
  ON_TRACK: 'on_track',
  AHEAD: 'ahead',
  AT_RISK: 'at_risk',
  BLOCKED: 'blocked',
  INACTIVE: 'inactive',
  COMPLETED: 'completed',
};

const STATE_LABELS = {
  [PROGRESS_STATES.ON_TRACK]: 'On Track',
  [PROGRESS_STATES.AHEAD]: 'Ahead',
  [PROGRESS_STATES.AT_RISK]: 'At Risk',
  [PROGRESS_STATES.BLOCKED]: 'Blocked',
  [PROGRESS_STATES.INACTIVE]: 'Inactive',
  [PROGRESS_STATES.COMPLETED]: 'Completed',
};

export function progressStateLabel(state) {
  return STATE_LABELS[state] || 'On Track';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = new Date(String(value).includes('T') ? value : `${String(value).slice(0, 10)}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

/** Derive per-task execution flags from a real mentor_tasks payload. */
export function deriveTaskInsights(task, now = new Date()) {
  const due = toDate(task.due_date);
  const isOverdue = Boolean(
    due
    && task.status !== 'completed'
    && task.status !== 'submitted'
    && now.getTime() > due.getTime()
  );
  const dueSoon = Boolean(
    due
    && !isOverdue
    && task.status !== 'completed'
    && task.status !== 'submitted'
    && daysBetween(due, now) <= 2
  );
  return { isOverdue, dueSoon };
}

/**
 * Derive a progress state for one intern from real dashboard/task data.
 * evidence[] always explains the label (prompt §17: never show a bare risk
 * label). The state is derived client-side; the authoritative backend
 * computation is a documented gap.
 */
export function deriveInternState({ taskCount = 0, completedTasks = 0, tasks = [], lastActivity = null }, now = new Date()) {
  const evidence = [];
  const insights = (tasks || []).map((t) => ({ task: t, ...deriveTaskInsights(t, now) }));
  const overdueTasks = insights.filter((i) => i.isOverdue);
  const changesRequested = insights.filter((i) => i.task.status === 'changes_requested');

  const last = toDate(lastActivity);
  const inactiveDays = last ? daysBetween(now, last) : null;

  if (taskCount > 0 && completedTasks >= taskCount) {
    return { state: PROGRESS_STATES.COMPLETED, evidence: ['All assigned tasks completed'] };
  }

  if (changesRequested.length > 0) {
    evidence.push(
      `${changesRequested.length} task${changesRequested.length > 1 ? 's' : ''} with changes requested: ${changesRequested
        .map((i) => `“${i.task.title}”`)
        .join(', ')}`,
    );
  }
  if (overdueTasks.length > 0) {
    evidence.push(
      `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: ${overdueTasks
        .map((i) => `“${i.task.title}”`)
        .join(', ')}`,
    );
  }
  if (inactiveDays != null && inactiveDays >= 5 && taskCount > completedTasks) {
    evidence.push(`No recorded task activity for ${inactiveDays} days`);
  }

  if (changesRequested.length > 0) {
    return { state: PROGRESS_STATES.BLOCKED, evidence };
  }
  if (overdueTasks.length > 0 || (inactiveDays != null && inactiveDays >= 5 && taskCount > completedTasks)) {
    return { state: PROGRESS_STATES.AT_RISK, evidence };
  }

  // Healthy signals
  if (inactiveDays != null && inactiveDays <= 2 && taskCount > 0 && completedTasks > 0) {
    evidence.push('Recent task activity with no overdue work');
  } else if (taskCount === 0) {
    evidence.push('No tasks assigned yet');
  } else {
    evidence.push(`${completedTasks} of ${taskCount} tasks completed, nothing overdue`);
  }
  return { state: PROGRESS_STATES.ON_TRACK, evidence };
}

/**
 * Build the mentor "Requires Attention" queue from real payloads.
 * Severity: blocker (1) > review (2) > risk (3) > info (4).
 */
export function buildAttentionQueue({ tasks = [], pendingReviews = [], evaluations = [], interns = [] }, now = new Date()) {
  const items = [];

  (tasks || []).forEach((task) => {
    const { isOverdue } = deriveTaskInsights(task, now);
    if (task.status === 'changes_requested') {
      items.push({
        id: `blocked-${task.id}`,
        severity: 1,
        kind: 'changes_requested',
        internName: task.intern_name,
        title: `${task.intern_name || 'Intern'} needs to rework “${task.title}”`,
        evidence: ['Changes were requested — task is waiting on the intern to resubmit'],
        actionLabel: 'View task',
      });
    } else if (isOverdue) {
      items.push({
        id: `overdue-${task.id}`,
        severity: 3,
        kind: 'overdue',
        internName: task.intern_name,
        title: `“${task.title}” is overdue for ${task.intern_name || 'intern'}`,
        evidence: [`Due ${task.due_date} — status is still ${task.status.replace('_', ' ')}`],
        actionLabel: 'View tasks',
      });
    }
  });

  (pendingReviews || []).forEach((review) => {
    items.push({
      id: `review-${review.id}`,
      severity: 2,
      kind: 'review',
      internName: review.intern_name,
      title: `Submission awaiting review: “${review.title}” (${review.intern_name})`,
      evidence: [`Submitted ${toDate(review.submitted_at) ? new Date(review.submitted_at).toLocaleDateString() : 'recently'}`],
      actionLabel: 'Review now',
    });
  });

  (evaluations || []).forEach((evaluation) => {
    if (evaluation.status !== 'draft') return;
    const due = toDate(evaluation.due_date);
    const overdue = due ? now.getTime() > due.getTime() : false;
    items.push({
      id: `eval-${evaluation.id}`,
      severity: overdue ? 2 : 4,
      kind: 'evaluation',
      internName: evaluation.intern_name,
      title: `Evaluation for ${evaluation.intern_name || 'intern'} is still a draft${overdue ? ' and past its due date' : ''}`,
      evidence: [due ? `Due ${evaluation.due_date}` : 'No due date set'],
      actionLabel: 'Open evaluations',
    });
  });

  (interns || []).forEach((intern) => {
    const { state, evidence } = deriveInternState(
      {
        taskCount: intern.task_count || 0,
        completedTasks: intern.completed_tasks || 0,
        lastActivity: intern.last_activity,
      },
      now,
    );
    if (state === PROGRESS_STATES.INACTIVE || state === PROGRESS_STATES.AT_RISK) {
      items.push({
        id: `intern-${intern.id}`,
        severity: 3,
        kind: 'stale_intern',
        internName: intern.full_name,
        title: `${intern.full_name} shows no recent activity`,
        evidence,
        actionLabel: 'View profile',
      });
    }
  });

  return items.sort((a, b) => a.severity - b.severity);
}

/** Rollup of progress states across interns (for the control-tower strip). */
export function summarizeProgressStates(interns = [], tasksByIntern = {}, now = new Date()) {
  const counts = {
    [PROGRESS_STATES.ON_TRACK]: 0,
    [PROGRESS_STATES.AHEAD]: 0,
    [PROGRESS_STATES.AT_RISK]: 0,
    [PROGRESS_STATES.BLOCKED]: 0,
    [PROGRESS_STATES.INACTIVE]: 0,
    [PROGRESS_STATES.COMPLETED]: 0,
  };
  const perIntern = {};
  (interns || []).forEach((intern) => {
    const { state } = deriveInternState(
      {
        taskCount: intern.task_count || 0,
        completedTasks: intern.completed_tasks || 0,
        tasks: tasksByIntern[intern.id] || [],
        lastActivity: intern.last_activity,
      },
      now,
    );
    counts[state] += 1;
    perIntern[intern.id] = state;
  });
  return { counts, perIntern };
}
