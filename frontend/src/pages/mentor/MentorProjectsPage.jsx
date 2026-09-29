import { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Eye,
  FolderKanban,
  GitBranch,
  Layers,
  ListTree,
  Play,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import {
  createChunk,
  createMasterTask,
  createMentorProject,
  deleteChunk,
  deleteMasterTask,
  executeDistribution,
  executeSchedule,
  fetchChunks,
  fetchMentorProject,
  fetchMentorProjects,
  previewDistribution,
  previewSchedule,
  updateMentorProject,
} from '../../services/mentorshipFoundationService';

const PROJECT_STATUSES = ['draft', 'active', 'completed', 'archived'];

export default function MentorProjectsPage() {
  const [projects, setProjects] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const loadProjects = () => {
    setError('');
    fetchMentorProjects()
      .then((result) => {
        setProjects(result.items || []);
      })
      .catch((requestError) => setError(requestError?.message || 'Unable to load projects.'));
  };

  useEffect(() => {
    Promise.resolve().then(loadProjects);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const internshipId = Number(data.get('internship_id'));
    if (!internshipId) {
      setFormError('Select the internship this project belongs to.');
      return;
    }

    const startDate = String(data.get('start_date') || '').trim() || null;
    const endDate = String(data.get('end_date') || '').trim() || null;

    if (startDate && endDate && endDate < startDate) {
      setFormError('End date cannot precede start date.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const created = await createMentorProject({
        internship_id: internshipId,
        title: String(data.get('title') || '').trim(),
        description: String(data.get('description') || '').trim() || null,
        objective: String(data.get('objective') || '').trim() || null,
        deliverable: String(data.get('deliverable') || '').trim() || null,
        status: String(data.get('status') || 'draft'),
        start_date: startDate,
        end_date: endDate,
      });
      setFormOpen(false);
      setSelectedId(created.id);
      loadProjects();
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not create the project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {formOpen && (
        <form className="mentor-panel mentor-form animate-fade-in" onSubmit={submit}>
          <label>
            Internship *
            <InternshipSelect />
          </label>
          <label>
            Project Title *
            <input name="title" required minLength={2} maxLength={200} placeholder="e.g. Internship Management Platform" />
          </label>
          <label className="wide">
            Description
            <textarea name="description" rows="2" maxLength={4000} placeholder="Scope and context for this project…" />
          </label>
          <label>
            Objective
            <input name="objective" maxLength={2000} placeholder="What should the intern team achieve?" />
          </label>
          <label>
            Deliverable
            <input name="deliverable" maxLength={2000} placeholder="e.g. Working dashboard + API" />
          </label>
          <label>
            Start Date
            <input name="start_date" type="date" />
          </label>
          <label>
            End Date
            <input name="end_date" type="date" />
          </label>
          <label>
            Status
            <select name="status" defaultValue="draft">
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          {formError && <p className="mentor-error" role="alert">{formError}</p>}
          <button className="mentor-primary-button" type="submit" disabled={saving}>
            <Plus size={14} /> {saving ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}

      {projects === null && !error && (
        <section className="mentor-panel">
          <p className="provider-body-copy">Loading projects…</p>
        </section>
      )}

      {error && (
        <section className="mentor-panel">
          <p className="mentor-error" role="alert">{error}</p>
          <button className="provider-quiet-button" type="button" onClick={loadProjects}>Retry</button>
        </section>
      )}

      {projects !== null && !error && (
        <section className="mentor-panel">
          <div className="mentor-panel-heading">
            <div>
              <span>Projects</span>
              <small>Project-level plan for each assigned internship — master tasks and chunks live under a project.</small>
            </div>
            <button type="button" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? 'Cancel' : (<><Plus size={13} /> New project</>)}
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="mentor-empty-state">
              <FolderKanban size={22} />
              <strong>No projects yet</strong>
              <span>Create your first project for an assigned internship to start planning master tasks.</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '.6rem' }}>
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isExpanded={selectedId === project.id}
                  onToggle={() => setSelectedId(selectedId === project.id ? null : project.id)}
                  onChanged={loadProjects}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}

function InternshipSelect() {
  const [options, setOptions] = useState({ items: [], loading: true, error: '' });

  useEffect(() => {
    import('../../services/publicExperience')
      .then(({ fetchMentorInterns }) => fetchMentorInterns())
      .then((result) => {
        const items = (result.items || [])
          .filter((intern) => intern.internship_id && intern.internship_title)
          .map((intern) => ({ id: intern.internship_id, title: intern.internship_title }));
        const unique = Array.from(new Map(items.map((item) => [item.id, item])).values());
        setOptions({ items: unique, loading: false, error: '' });
      })
      .catch(() => setOptions({ items: [], loading: false, error: 'Unable to load your assigned internships.' }));
  }, []);

  if (options.loading) return <select disabled><option>Loading internships…</option></select>;
  if (options.error) return <span style={{ color: '#b91c1c', fontSize: '.75rem' }}>{options.error}</span>;
  if (options.items.length === 0) {
    return (
      <span style={{ color: 'var(--provider-text-muted)', fontSize: '.75rem' }}>
        No internship-linked assignments yet — assignments with an internship unlock project planning.
      </span>
    );
  }
  return (
    <select name="internship_id" required defaultValue="">
      <option value="" disabled>Select internship</option>
      {options.items.map((item) => (
        <option key={item.id} value={item.id}>{item.title}</option>
      ))}
    </select>
  );
}

function ProjectCard({ project, isExpanded, onToggle, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  // Engine state
  const [distMode, setDistMode] = useState('workload_balanced');
  const [distPreview, setDistPreview] = useState(null);
  const [distBusy, setDistBusy] = useState(false);
  const [distMsg, setDistMsg] = useState('');

  const [schPreview, setSchPreview] = useState(null);
  const [schBusy, setSchBusy] = useState(false);
  const [schMsg, setSchMsg] = useState('');

  const [datesEditing, setDatesEditing] = useState(false);
  const [startDateInput, setStartDateInput] = useState(project.start_date || '');
  const [endDateInput, setEndDateInput] = useState(project.end_date || '');

  useEffect(() => {
    if (!isExpanded) return undefined;
    let active = true;
    fetchMentorProject(project.id)
      .then((data) => {
        if (active) {
          setDetail(data);
          setStartDateInput(data.start_date || '');
          setEndDateInput(data.end_date || '');
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Unable to load project details.');
      });
    return () => {
      active = false;
    };
  }, [isExpanded, project.id]);

  const changeStatus = async (status) => {
    setStatusBusy(true);
    try {
      await updateMentorProject(project.id, { status });
      const fresh = await fetchMentorProject(project.id);
      setDetail(fresh);
      onChanged?.();
    } catch (requestError) {
      setError(requestError?.message || 'Could not update the project.');
    } finally {
      setStatusBusy(false);
    }
  };

  const saveProjectDates = async () => {
    if (startDateInput && endDateInput && endDateInput < startDateInput) {
      setError('End date cannot precede start date.');
      return;
    }
    setError('');
    setStatusBusy(true);
    try {
      await updateMentorProject(project.id, { start_date: startDateInput || null, end_date: endDateInput || null });
      const fresh = await fetchMentorProject(project.id);
      setDetail(fresh);
      setDatesEditing(false);
      onChanged?.();
    } catch (requestError) {
      setError(requestError?.message || 'Could not update project dates.');
    } finally {
      setStatusBusy(false);
    }
  };

  const handlePreviewDist = async () => {
    setDistBusy(true);
    setError('');
    setDistMsg('');
    try {
      const res = await previewDistribution(project.id, distMode);
      setDistPreview(res);
    } catch (err) {
      setError(err?.message || 'Distribution preview failed.');
    } finally {
      setDistBusy(false);
    }
  };

  const handleExecuteDist = async () => {
    setDistBusy(true);
    setError('');
    setDistMsg('');
    try {
      const res = await executeDistribution(project.id, distMode);
      setDistPreview(null);
      setDistMsg(`Successfully distributed chunks! (${res.created_tasks_count} created, ${res.updated_tasks_count} updated).`);
      const fresh = await fetchMentorProject(project.id);
      setDetail(fresh);
    } catch (err) {
      setError(err?.message || 'Task distribution failed.');
    } finally {
      setDistBusy(false);
    }
  };

  const handlePreviewSch = async () => {
    setSchBusy(true);
    setError('');
    setSchMsg('');
    try {
      const res = await previewSchedule(project.id);
      setSchPreview(res);
    } catch (err) {
      setError(err?.message || 'Schedule preview failed.');
    } finally {
      setSchBusy(false);
    }
  };

  const handleExecuteSch = async () => {
    setSchBusy(true);
    setError('');
    setSchMsg('');
    try {
      const res = await executeSchedule(project.id);
      setSchPreview(null);
      setSchMsg(`Successfully generated and saved schedule for ${res.schedule.length} tasks across ${res.available_days} days!`);
      const fresh = await fetchMentorProject(project.id);
      setDetail(fresh);
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'Task scheduling failed.');
    } finally {
      setSchBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--provider-border)', borderRadius: '10px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => {
          setError('');
          onToggle();
        }}
        style={{
          display: 'flex', width: '100%', alignItems: 'center', gap: '.6rem',
          padding: '.7rem .8rem', background: 'rgba(255,255,255,.6)', border: 0,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <FolderKanban size={17} style={{ color: 'var(--mentor-accent)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '.82rem', color: 'var(--mentor-text)' }}>{project.title}</strong>
          <small style={{ color: 'var(--provider-text-muted)', fontSize: '.7rem' }}>
            {project.internship_title} · {project.master_task_count} master task{project.master_task_count === 1 ? '' : 's'}
            {project.start_date ? ` · Timeline: ${project.start_date} to ${project.end_date || 'TBD'}` : ''}
          </small>
        </span>
        <span className="provider-status-pill muted" style={{ fontSize: '.65rem', padding: '3px 8px' }}>{project.status}</span>
      </button>

      {isExpanded && (
        <div style={{ padding: '.8rem', borderTop: '1px solid var(--provider-border)', display: 'grid', gap: '.7rem' }}>
          {error && <p className="mentor-error" role="alert">{error}</p>}
          {distMsg && <p style={{ color: '#047857', background: '#ecfdf5', padding: '.5rem', borderRadius: '6px', fontSize: '.75rem', fontWeight: 600 }}>{distMsg}</p>}
          {schMsg && <p style={{ color: '#047857', background: '#ecfdf5', padding: '.5rem', borderRadius: '6px', fontSize: '.75rem', fontWeight: 600 }}>{schMsg}</p>}

          {!detail && !error && <p className="provider-body-copy" style={{ fontSize: '.78rem' }}>Loading project…</p>}
          {detail && (
            <>
              {(detail.description || detail.objective || detail.deliverable) && (
                <div style={{ display: 'grid', gap: '.25rem', fontSize: '.75rem', color: 'var(--provider-text-soft)' }}>
                  {detail.objective && <span><strong>Objective:</strong> {detail.objective}</span>}
                  {detail.deliverable && <span><strong>Deliverable:</strong> {detail.deliverable}</span>}
                  {detail.description && <span><strong>Description:</strong> {detail.description}</span>}
                </div>
              )}

              {/* Dates & Status bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', padding: '.5rem', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px solid var(--provider-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.72rem' }}>
                  <Calendar size={14} style={{ color: 'var(--mentor-accent)' }} />
                  {datesEditing ? (
                    <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                      <input type="date" value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)} style={{ padding: '2px 5px', fontSize: '.7rem' }} />
                      <span>to</span>
                      <input type="date" value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)} style={{ padding: '2px 5px', fontSize: '.7rem' }} />
                      <button type="button" className="mentor-primary-button" style={{ padding: '2px 8px', fontSize: '.65rem' }} onClick={saveProjectDates} disabled={statusBusy}>Save</button>
                      <button type="button" className="provider-quiet-button" style={{ fontSize: '.65rem' }} onClick={() => setDatesEditing(false)}>Cancel</button>
                    </div>
                  ) : (
                    <span>
                      <strong>Dates:</strong> {detail.start_date || 'Not set'} → {detail.end_date || 'Not set'}
                      <button type="button" onClick={() => setDatesEditing(true)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--mentor-accent)', marginLeft: '6px', fontSize: '.7rem', textDecoration: 'underline' }}>Edit</button>
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.4rem' }}>
                  <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--provider-text-soft)' }}>Status:</span>
                  {PROJECT_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={statusBusy || detail.status === status}
                      onClick={() => changeStatus(status)}
                      style={{
                        border: '1px solid var(--provider-border)', borderRadius: '999px', cursor: 'pointer',
                        padding: '2px 10px', fontSize: '.65rem', fontWeight: 700,
                        background: detail.status === status ? 'var(--mentor-accent)' : 'transparent',
                        color: detail.status === status ? '#fff' : 'var(--provider-text-soft)',
                        opacity: statusBusy && detail.status !== status ? 0.6 : 1,
                      }}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Master Task & Chunks Section */}
              {detail.master_tasks.map((task) => (
                <MasterTaskBlock key={task.id} projectId={project.id} task={task} onChanged={() => {
                  fetchMentorProject(project.id).then(setDetail).catch(() => {});
                }} />
              ))}
              {detail.master_tasks.length === 0 && (
                <div className="mentor-empty-state" style={{ minHeight: 90 }}>
                  <ListTree size={18} />
                  <strong>No master tasks yet</strong>
                  <span>Add the first project-level task below — chunks break it down further.</span>
                </div>
              )}
              <MasterTaskCreateForm projectId={project.id} onCreated={() => {
                fetchMentorProject(project.id).then(setDetail).catch(() => {});
              }} />

              {/* CORE MENTORSHIP ENGINE PANEL: Distribution & Scheduling */}
              <div style={{ marginTop: '.8rem', padding: '.8rem', background: 'rgba(248, 250, 252, 0.7)', borderRadius: '10px', border: '1px dashed var(--mentor-accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.6rem' }}>
                  <Sliders size={16} style={{ color: 'var(--mentor-accent)' }} />
                  <strong style={{ fontSize: '.82rem', color: 'var(--mentor-text)' }}>Core Mentorship Execution Engine</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.8rem' }}>
                  {/* Task Distribution Box */}
                  <div style={{ padding: '.6rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--provider-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.4rem' }}>
                      <GitBranch size={13} style={{ color: 'var(--mentor-accent)' }} />
                      <span style={{ fontSize: '.75rem', fontWeight: 700 }}>Task Distribution Engine</span>
                    </div>

                    <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.6rem', flexWrap: 'wrap' }}>
                      {[
                        { id: 'workload_balanced', label: 'Workload Balanced' },
                        { id: 'equal', label: 'Equal Distribution' },
                        { id: 'priority', label: 'Priority Based' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setDistMode(m.id)}
                          style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer',
                            border: distMode === m.id ? '1px solid var(--mentor-accent)' : '1px solid var(--provider-border)',
                            background: distMode === m.id ? 'rgba(79,70,229,0.1)' : 'transparent',
                            color: distMode === m.id ? 'var(--mentor-accent)' : 'var(--provider-text-soft)',
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      <button
                        type="button"
                        className="provider-quiet-button"
                        style={{ fontSize: '.7rem', padding: '.3rem .6rem' }}
                        onClick={handlePreviewDist}
                        disabled={distBusy || detail.chunks.length === 0}
                      >
                        <Eye size={12} /> Preview
                      </button>
                      <button
                        type="button"
                        className="mentor-primary-button"
                        style={{ fontSize: '.7rem', padding: '.3rem .6rem' }}
                        onClick={handleExecuteDist}
                        disabled={distBusy || detail.chunks.length === 0}
                      >
                        <Play size={12} /> {distBusy ? 'Distributing…' : 'Distribute Tasks'}
                      </button>
                    </div>
                  </div>

                  {/* Task Scheduling Box */}
                  <div style={{ padding: '.6rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--provider-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', marginBottom: '.4rem' }}>
                      <Clock size={13} style={{ color: 'var(--mentor-accent)' }} />
                      <span style={{ fontSize: '.75rem', fontWeight: 700 }}>Priority-Based Scheduling Engine</span>
                    </div>

                    <p style={{ margin: '0 0 .5rem', fontSize: '.68rem', color: 'var(--provider-text-muted)' }}>
                      Calculates timeline start and due dates per assigned intern using project boundaries.
                    </p>

                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      <button
                        type="button"
                        className="provider-quiet-button"
                        style={{ fontSize: '.7rem', padding: '.3rem .6rem' }}
                        onClick={handlePreviewSch}
                        disabled={schBusy || !detail.start_date || !detail.end_date}
                      >
                        <Eye size={12} /> Preview Schedule
                      </button>
                      <button
                        type="button"
                        className="mentor-primary-button"
                        style={{ fontSize: '.7rem', padding: '.3rem .6rem' }}
                        onClick={handleExecuteSch}
                        disabled={schBusy || !detail.start_date || !detail.end_date}
                      >
                        <Sparkles size={12} /> {schBusy ? 'Scheduling…' : 'Generate Schedule'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* DISTRIBUTION PREVIEW CARD */}
                {distPreview && (
                  <div style={{ marginTop: '.7rem', padding: '.6rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--mentor-accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                      <strong style={{ fontSize: '.75rem', color: 'var(--mentor-accent)' }}>Distribution Preview ({distPreview.mode})</strong>
                      <button type="button" onClick={() => setDistPreview(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: '.7rem' }}>✕ Close</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '.4rem', marginBottom: '.5rem' }}>
                      {distPreview.summary.map((s) => (
                        <div key={s.intern_id} style={{ padding: '.4rem', background: 'rgba(241,245,249,0.7)', borderRadius: '6px', fontSize: '.68rem' }}>
                          <strong style={{ display: 'block' }}>{s.intern_name}</strong>
                          <span style={{ color: 'var(--provider-text-muted)' }}>{s.chunk_count} chunks ({s.total_hours}h total)</span>
                        </div>
                      ))}
                    </div>

                    <table style={{ width: '100%', fontSize: '.68rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                          <th style={{ padding: '4px' }}>Chunk</th>
                          <th style={{ padding: '4px' }}>Priority</th>
                          <th style={{ padding: '4px' }}>Est. Effort</th>
                          <th style={{ padding: '4px' }}>Assigned Intern</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distPreview.assignments.map((item) => (
                          <tr key={item.chunk_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '4px' }}>{item.chunk_title}</td>
                            <td style={{ padding: '4px' }}>{item.priority}</td>
                            <td style={{ padding: '4px' }}>{item.estimated_hours ? `${item.estimated_hours}h` : '1h'}</td>
                            <td style={{ padding: '4px', fontWeight: 600 }}>{item.intern_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* SCHEDULE PREVIEW CARD */}
                {schPreview && (
                  <div style={{ marginTop: '.7rem', padding: '.6rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--mentor-accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.4rem' }}>
                      <strong style={{ fontSize: '.75rem', color: 'var(--mentor-accent)' }}>Schedule Preview ({schPreview.available_days} Days)</strong>
                      <button type="button" onClick={() => setSchPreview(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: '.7rem' }}>✕ Close</button>
                    </div>

                    <table style={{ width: '100%', fontSize: '.68rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                          <th style={{ padding: '4px' }}>Intern</th>
                          <th style={{ padding: '4px' }}>Task Title</th>
                          <th style={{ padding: '4px' }}>Start Date</th>
                          <th style={{ padding: '4px' }}>Due Date</th>
                          <th style={{ padding: '4px' }}>Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schPreview.schedule.map((item) => (
                          <tr key={item.task_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '4px', fontWeight: 600 }}>{item.intern_name}</td>
                            <td style={{ padding: '4px' }}>{item.title}</td>
                            <td style={{ padding: '4px' }}>{item.start_date}</td>
                            <td style={{ padding: '4px' }}>{item.due_date}</td>
                            <td style={{ padding: '4px' }}>{item.priority}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MasterTaskCreateForm({ projectId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const title = String(data.get('title') || '').trim();
    if (title.length < 2) {
      setError('Task title needs at least 2 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const hoursRaw = String(data.get('estimated_hours') || '').trim();
      await createMasterTask(projectId, {
        title,
        description: String(data.get('description') || '').trim() || null,
        priority: String(data.get('priority') || 'normal'),
        estimated_hours: hoursRaw ? Number(hoursRaw) : null,
      });
      formEl.reset();
      setOpen(false);
      onCreated();
    } catch (requestError) {
      setError(requestError?.message || 'Could not add the master task.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', border: '1px dashed var(--provider-border)', background: 'transparent', borderRadius: '7px', padding: '.45rem .7rem', cursor: 'pointer', color: 'var(--mentor-accent)', fontSize: '.74rem', fontWeight: 800, justifySelf: 'start' }}
      >
        <Plus size={13} /> Add master task
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '.4rem', border: '1px dashed var(--provider-border)', borderRadius: '9px', padding: '.6rem' }}>
      <input name="title" required minLength={2} maxLength={200} placeholder="Master task title (e.g. Backend Development)" style={{ padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
      <textarea name="description" rows="2" maxLength={4000} placeholder="Optional scope detail for this master task" style={{ padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <select name="priority" defaultValue="normal" style={{ flex: 1, padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }}>
          <option value="low">low priority</option>
          <option value="normal">normal priority</option>
          <option value="high">high priority</option>
        </select>
        <input name="estimated_hours" type="number" min="0" step="0.5" placeholder="Est. hours" style={{ flex: 1, padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
      </div>
      {error && <p className="mentor-error" role="alert" style={{ fontSize: '.7rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button className="mentor-primary-button" type="submit" disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Adding…' : 'Add master task'}
        </button>
        <button type="button" className="provider-quiet-button" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
      </div>
    </form>
  );
}

function MasterTaskBlock({ projectId, task, onChanged }) {
  const [chunks, setChunks] = useState({ items: [], loaded: false, error: '' });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(false);

  useEffect(() => {
    if (!chunks.loaded && !chunks.error) {
      fetchChunks(task.id)
        .then((result) => setChunks({ items: result.items || [], loaded: true, error: '' }))
        .catch((requestError) => setChunks({ items: [], loaded: true, error: requestError?.message || 'Unable to load chunks.' }));
    }
  }, [chunks.loaded, chunks.error, task.id]);

  const addChunk = async (event) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const title = String(data.get('title') || '').trim();
    if (title.length < 2) {
      setFormError('Chunk title needs at least 2 characters.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const hoursRaw = String(data.get('estimated_hours') || '').trim();
      await createChunk(task.id, {
        title,
        description: String(data.get('description') || '').trim() || null,
        priority: String(data.get('priority') || 'normal'),
        estimated_hours: hoursRaw ? Number(hoursRaw) : null,
      });
      formEl.reset();
      const result = await fetchChunks(task.id);
      setChunks((prev) => ({ ...prev, items: result.items || [] }));
      onChanged();
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not add the chunk.');
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async () => {
    try {
      await deleteMasterTask(projectId, task.id);
      setDeleteTarget(false);
      onChanged();
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not delete the master task.');
      setDeleteTarget(false);
    }
  };

  const removeChunk = async (chunkId) => {
    try {
      await deleteChunk(chunkId);
      const result = await fetchChunks(task.id);
      setChunks((prev) => ({ ...prev, items: result.items || [] }));
      onChanged();
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not delete the chunk.');
    }
  };

  return (
    <div style={{ border: '1px dashed var(--provider-border)', borderRadius: '9px', padding: '.65rem .7rem', display: 'grid', gap: '.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <ListTree size={15} style={{ color: 'var(--mentor-accent)', flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: '.78rem', color: 'var(--mentor-text)' }}>{task.sequence + 1}. {task.title}</strong>
          <small style={{ display: 'block', color: 'var(--provider-text-muted)', fontSize: '.68rem' }}>
            {task.priority} · {task.estimated_hours != null ? `${task.estimated_hours}h est.` : 'no estimate'} · {task.status.replace('_', ' ')}
          </small>
        </span>
        <button
          type="button"
          onClick={() => setDeleteTarget(true)}
          aria-label={`Delete master task ${task.title}`}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#dc2626', padding: '2px' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {task.description && (
        <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--provider-text-soft)' }}>{task.description}</p>
      )}

      <div style={{ display: 'grid', gap: '.3rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.68rem', fontWeight: 800, color: 'var(--provider-text-soft)' }}>
          <Layers size={12} /> Chunks ({chunks.items.length})
        </span>
        {chunks.error && <p className="mentor-error" role="alert" style={{ fontSize: '.7rem' }}>{chunks.error}</p>}
        {chunks.items.map((chunk) => (
          <div key={chunk.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.3rem .5rem', background: 'rgba(255,255,255,.55)', borderRadius: '7px' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '.74rem', color: 'var(--mentor-text)' }}>
              {chunk.sequence + 1}. {chunk.title}
              <small style={{ display: 'block', color: 'var(--provider-text-muted)', fontSize: '.66rem' }}>
                {chunk.priority} · {chunk.estimated_hours != null ? `${chunk.estimated_hours}h` : 'no estimate'} · {chunk.status.replace('_', ' ')}
              </small>
            </span>
            <button
              type="button"
              onClick={() => removeChunk(chunk.id)}
              aria-label={`Delete chunk ${chunk.title}`}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#dc2626', padding: '2px' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!chunks.loaded && !chunks.error && <p className="provider-body-copy" style={{ fontSize: '.7rem' }}>Loading chunks…</p>}
      </div>

      {adding ? (
        <form onSubmit={addChunk} style={{ display: 'grid', gap: '.4rem' }}>
          <input name="title" required minLength={2} maxLength={200} placeholder="Chunk title (e.g. Implement authentication API)" style={{ padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
          <input name="description" maxLength={4000} placeholder="Optional detail" style={{ padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <select name="priority" defaultValue="normal" style={{ flex: 1, padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }}>
              <option value="low">low priority</option>
              <option value="normal">normal priority</option>
              <option value="high">high priority</option>
            </select>
            <input name="estimated_hours" type="number" min="0" step="0.5" placeholder="Est. hours" style={{ flex: 1, padding: '.45rem .6rem', border: '1px solid var(--provider-border)', borderRadius: '7px', fontSize: '.76rem' }} />
            <button className="mentor-primary-button" type="submit" disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Adding…' : 'Add chunk'}
            </button>
            <button type="button" className="provider-quiet-button" onClick={() => { setAdding(false); setFormError(''); }}>Cancel</button>
          </div>
          {formError && <p className="mentor-error" role="alert" style={{ fontSize: '.7rem' }}>{formError}</p>}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', border: '1px dashed var(--provider-border)', background: 'transparent', borderRadius: '7px', padding: '.4rem .6rem', cursor: 'pointer', color: 'var(--mentor-accent)', fontSize: '.72rem', fontWeight: 800 }}
        >
          <Plus size={12} /> Add chunk
        </button>
      )}

      {formError && !adding && <p className="mentor-error" role="alert" style={{ fontSize: '.7rem' }}>{formError}</p>}

      <ConfirmationModal
        isOpen={deleteTarget}
        onClose={() => setDeleteTarget(false)}
        onConfirm={removeTask}
        title="Delete master task"
        message={`Delete "${task.title}" and its chunks? This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
