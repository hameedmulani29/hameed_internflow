import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  AlertTriangle,
  Inbox,
  Loader2,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import Pagination from '../../components/common/Pagination';
import ConfirmationModal from '../../components/common/ConfirmationModal';
import {
  clearSession,
  createInternship,
  fetchApplications,
  fetchInternships,
  getSession,
  updateApplicationStatus,
  updateInternshipStatus,
} from '../../services/publicExperience';
import {
  scheduleInterview,
  fetchProviderInterviews,
  fetchEligibleCandidates,
  fetchAssessments,
  fetchProviderCertificates,
  updateInterviewStatus,
  submitInterviewScorecard,
  fetchInterviewScorecard,
} from '../../services/phase20Service';
import { screenApplication } from '../../services/internService';
import { fetchApplicationDetail } from '../../services/skillService';
import { createMentorAssignment, fetchAvailableMentors, fetchProviderAssignments, fetchProviderMenteeDetail } from '../../services/mentorshipFoundationService';
import SkillChip from '../../components/common/SkillChip';
import '../../styles/ProviderDashboard.css';
import '../../styles/ProviderWorkspace.css';

const PROVIDER_NAV = [
  { label: 'Dashboard', path: '/provider-dashboard', icon: LayoutDashboard },
  { label: 'Internships', path: '/provider-internships', icon: BriefcaseBusiness },
  { label: 'Applications', path: '/provider-applications', icon: FileText },
  { label: 'Interviews', path: '/provider-interviews', icon: CalendarDays },
  { label: 'Assessments', path: '/provider-assessments', icon: ClipboardCheck },
  { label: 'Active Interns', path: '/provider-interns', icon: Users },
  { label: 'Mentors', path: '/provider-mentors', icon: UserPlus },
  { label: 'Reports', path: '/provider-reports', icon: BarChart3 },
  { label: 'Certificates', path: '/provider-certificates', icon: ShieldCheck },
  { label: 'Automation', path: '/provider-automation', icon: Zap },
  { label: 'Settings', path: '/provider-settings', icon: Settings },
];




function StatusPill({ children, tone = 'neutral' }) {
  return <span className={`provider-status-pill ${tone}`}>{children}</span>;
}

function LoadingPanel({ label = 'Loading…' }) {
  return (
    <section className="provider-workspace-panel" role="status" aria-live="polite" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
      <Loader2 size={26} className="spin" style={{ marginBottom: '0.6rem' }} />
      <div>{label}</div>
    </section>
  );
}

function ErrorPanel({ message, onRetry }) {
  return (
    <section className="provider-workspace-panel" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
      <AlertTriangle size={26} style={{ color: '#d97706', marginBottom: '0.6rem' }} />
      <div style={{ fontWeight: 600, color: '#b45309' }}>Something went wrong</div>
      <p style={{ color: '#64748b', margin: '0.5rem 0 1rem' }}>{message || 'The data could not be loaded.'}</p>
      {onRetry && (
        <button className="provider-quiet-button" type="button" onClick={onRetry}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: '4px' }} /> Retry
        </button>
      )}
    </section>
  );
}

function EmptyPanel({ title, message }) {
  return (
    <section className="provider-workspace-panel" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
      <Inbox size={26} style={{ marginBottom: '0.6rem', opacity: 0.6 }} />
      <div style={{ fontWeight: 600, color: '#334155' }}>{title}</div>
      <p style={{ margin: '0.4rem 0 0' }}>{message}</p>
    </section>
  );
}

function StatStrip({ items }) {
  return (
    <div className="provider-workspace-stats">
      {items.map(([label, value, detail]) => (
        <div className="provider-workspace-stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          {detail && <small>{detail}</small>}
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="provider-workspace-header">
      <div>
        <p className="provider-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="provider-workspace-description">{description}</p>}
      </div>
      {actions && <div className="provider-workspace-actions">{actions}</div>}
    </div>
  );
}

function InternshipDetail({ onNavigate }) {
  const [internship, setInternship] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const internshipId = new URLSearchParams(window.location.search).get('id');

  const loadInternship = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await fetchInternships({ query: '', status: '' });
      const selected = (result.items || []).find((item) => String(item.id) === String(internshipId));
      setInternship(selected || null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load internship details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadInternship);
  }, [internshipId]);

  const handlePublish = async () => {
    if (!internshipId || isPublishing) return;
    setIsPublishing(true);
    setError('');

    try {
      const updated = await updateInternshipStatus(internshipId, 'published');
      setInternship((current) => ({ ...(current || {}), ...updated }));
    } catch (requestError) {
      setError(requestError.message || 'Unable to publish internship.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="provider-workspace-panel" style={{ padding: '28px' }}>
        <p className="provider-body-copy">Loading internship details...</p>
      </div>
    );
  }

  if (error || !internship) {
    return (
      <div className="provider-workspace-panel" style={{ padding: '28px' }}>
        <div className="provider-panel-heading">
          <div>
            <span className="provider-panel-kicker">Program</span>
            <h2>Internship details</h2>
          </div>
          <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-internships')}>
            Back to internships
          </button>
        </div>
        <p className="provider-body-copy">{error || 'Internship details are unavailable for this record.'}</p>
      </div>
    );
  }

  return (
    <div className="provider-workspace-panel provider-detail-shell" style={{ padding: '28px' }}>
      <div className="provider-panel-heading" style={{ marginBottom: '22px' }}>
        <div className="provider-profile-heading">
          <div className="provider-large-avatar" aria-hidden="true">{(internship.title || 'I').charAt(0).toUpperCase()}</div>
          <div>
            <span className="provider-panel-kicker">Program Details</span>
            <h2>{internship.title}</h2>
          </div>
        </div>
        <div className="provider-row-actions">
          {internship.status !== 'published' && (
            <button type="button" className="provider-primary-btn" onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Publish Internship'}
            </button>
          )}
          <button type="button" className="provider-quiet-button" onClick={() => onNavigate('/provider-internships')}>
            Back
          </button>
        </div>
      </div>

      <div className="provider-detail-hero">
        <div>
          <p className="provider-body-copy">Internship overview</p>
          <div className={`provider-status-pill ${internship.status === 'published' ? 'success' : internship.status === 'draft' ? 'muted' : 'warning'}`} style={{ marginTop: '8px' }}>{internship.status}</div>
        </div>
        <div className="provider-detail-metrics">
          <div><span>Openings</span><strong>{internship.openings || 1}</strong></div>
          <div><span>Work mode</span><strong>{internship.work_mode || 'Hybrid'}</strong></div>
          <div><span>Location</span><strong>{internship.location || 'Remote'}</strong></div>
        </div>
      </div>

      <div className="provider-form-grid provider-detail-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginTop: '20px' }}>
        <div className="provider-form-field wide provider-detail-card">
          <label>Description</label>
          <div className="provider-readout provider-readout-large">{internship.description || 'No description provided.'}</div>
        </div>

        <div className="provider-form-field provider-detail-card">
          <label>Department</label>
          <div className="provider-readout">{internship.department || 'Engineering'}</div>
        </div>
        <div className="provider-form-field provider-detail-card">
          <label>Duration</label>
          <div className="provider-readout">{internship.duration || '12 weeks'}</div>
        </div>
        <div className="provider-form-field provider-detail-card">
          <label>Stipend</label>
          <div className="provider-readout">{internship.stipend || 'Not specified'}</div>
        </div>
        <div className="provider-form-field provider-detail-card">
          <label>Deadline</label>
          <div className="provider-readout">{internship.deadline || 'Not specified'}</div>
        </div>
        <div className="provider-form-field provider-detail-card">
          <label>Visibility</label>
          <div className="provider-readout">Published to applicants</div>
        </div>
      </div>
    </div>
  );
}

function InternshipList({ onNavigate }) {
  const [internships, setInternships] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, title: '' });

  const loadInternships = () => {
    setIsLoading(true);
    setError('');
    fetchInternships({ query, status })
      .then((result) => {
        setInternships(result.items || []);
      })
      .catch((requestError) => {
        setError(requestError.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    Promise.resolve().then(loadInternships);
  }, [query, status]);

  // Reset page when filters change (deferred to avoid sync setState in effect)
  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [query, status]);

  const handleDeleteConfirm = () => {
    setInternships((prev) => prev.filter((item) => item.id !== deleteModal.id));
    setDeleteModal({ open: false, id: null, title: '' });
  };

  const totalItems = internships.length;
  const paginatedInternships = internships.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <SectionHeader
        eyebrow="Program management"
        title="Internships"
        description="Create, configure, and manage every internship program across your organization."
        actions={
          <button className="provider-primary-btn" type="button" onClick={() => onNavigate('/provider-internship-new')}>
            <Plus size={16} /> Create internship
          </button>
        }
      />

      <div className="provider-workspace-toolbar">
        <div className="provider-search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search internships by title or department..."
          />
          {query && (
            <button type="button" className="btn-clear-search" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <select className="provider-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="closed">Closed</option>
        </select>

        {(query || status) && (
          <button
            className="provider-quiet-button"
            type="button"
            onClick={() => {
              setQuery('');
              setStatus('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="provider-ai-callout" role="alert">
          <div>
            <strong>Error loading internships</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="provider-quiet-button" onClick={loadInternships}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      <section className="provider-workspace-panel">
        {isLoading ? (
          <p className="provider-body-copy">Loading internships list...</p>
        ) : paginatedInternships.length === 0 ? (
          <div className="provider-body-copy" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--provider-text)' }}>No internships found</p>
            <p style={{ margin: '6px 0 16px' }}>There are currently no internships matching your filters.</p>
            {(query || status) && (
              <button
                className="provider-primary-btn"
                type="button"
                onClick={() => {
                  setQuery('');
                  setStatus('');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Internship Title</th>
                    <th>Status</th>
                    <th>Department</th>
                    <th>Work Mode</th>
                    <th>Openings</th>
                    <th>Deadline</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInternships.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <small>{item.organization || 'Acme Labs'}</small>
                      </td>
                      <td>
                        <StatusPill tone={item.status === 'published' ? 'success' : item.status === 'draft' ? 'muted' : 'warning'}>
                          {item.status}
                        </StatusPill>
                      </td>
                      <td>{item.department || 'Engineering'}</td>
                      <td>{item.work_mode || 'Hybrid'}</td>
                      <td>{item.openings || 1}</td>
                      <td>{item.deadline || 'Oct 15, 2026'}</td>
                      <td>
                        <div className="provider-row-actions">
                          <button type="button" onClick={() => onNavigate(`/provider-internship-details?id=${item.id}`)}>
                            View
                          </button>
                          {item.status !== 'published' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await updateInternshipStatus(item.id, 'published');
                                  setInternships((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...updated } : row)));
                                } catch (requestError) {
                                  setError(requestError.message || 'Unable to publish internship.');
                                }
                              }}
                            >
                              Publish
                            </button>
                          )}
                          <button
                            type="button"
                            style={{ color: '#dc2626' }}
                            onClick={() => setDeleteModal({ open: true, id: item.id, title: item.title })}
                            title="Delete Internship"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20]}
            />
          </>
        )}
      </section>

      <ConfirmationModal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, id: null, title: '' })}
        onConfirm={handleDeleteConfirm}
        title="Delete Internship"
        message={`Are you sure you want to delete "${deleteModal.title}"? This action will remove the program and cannot be undone.`}
        confirmLabel="Delete Program"
        tone="danger"
      />
    </>
  );
}

function CreateInternship({ onNavigate }) {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    department: 'Engineering',
    location: '',
    work_mode: 'Hybrid',
    duration: '12 weeks',
    stipend: 'INR 20,000 / month',
    openings: '2',
    deadline: '',
    description: '',
    skills: 'React, Node.js, Python',
    requirements: 'Strong problem-solving skills, basic web development knowledge',
    responsibilities: 'Build features, write tests, participate in daily standups',
    mentor_assigned: 'Priya Menon',
    ai_screening_enabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [stepErrors, setStepErrors] = useState({});

  const steps = [
    { title: 'Basic Information', kicker: 'Program identity & details' },
    { title: 'Requirements & Scope', kicker: 'Skills & expectations' },
    { title: 'Selection Process', kicker: 'Screening & stages' },
    { title: 'Configuration', kicker: 'Mentors & logistics' },
    { title: 'Review & Publish', kicker: 'Final verification' },
  ];

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setStepErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validateStep = (stepIdx) => {
    const errors = {};
    if (stepIdx === 0) {
      if (!formData.title.trim()) errors.title = 'Internship title is required';
      if (!formData.location.trim()) errors.location = 'Location is required';
    } else if (stepIdx === 1) {
      if (!formData.description.trim() || formData.description.length < 15) {
        errors.description = 'Description must be at least 15 characters long';
      }
    }
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrevStep = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(activeStep)) return;

    setFormError('');
    setIsSaving(true);

    const parsedSkills = typeof formData.skills === 'string'
      ? formData.skills.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(formData.skills) ? formData.skills : []);

    try {
      await createInternship({
        title: formData.title.trim(),
        department: formData.department.trim(),
        description: formData.description.trim(),
        location: formData.location.trim(),
        work_mode: formData.work_mode,
        duration: formData.duration.trim(),
        stipend: formData.stipend.trim(),
        openings: Number(formData.openings || 1),
        deadline: formData.deadline ? formData.deadline : null,
        skills: parsedSkills,
        status: 'published',
      });
      onNavigate('/provider-internships');
    } catch (err) {
      setFormError(err.message || 'Failed to create internship program.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Internship builder"
        title="Create Internship Program"
        description="Set up a structured internship program in five guided steps."
        actions={
          <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-internships')}>
            <ArrowLeft size={15} /> Back to internships
          </button>
        }
      />

      <div className="provider-wizard-layout">
        <aside className="provider-wizard-steps">
          {steps.map((s, idx) => (
            <button
              type="button"
              className={`provider-wizard-step ${idx === activeStep ? 'is-active' : ''}`}
              key={s.title}
              onClick={() => {
                if (idx < activeStep || validateStep(activeStep)) {
                  setActiveStep(idx);
                }
              }}
            >
              <span>{idx + 1}</span>
              <div>
                <strong>{s.title}</strong>
              </div>
            </button>
          ))}
        </aside>

        <form className="provider-workspace-panel provider-form-panel" onSubmit={handleSubmit}>
          <div className="provider-panel-heading">
            <div>
              <span className="provider-panel-kicker">
                Step {activeStep + 1} of {steps.length} — {steps[activeStep].kicker}
              </span>
              <h2>{steps[activeStep].title}</h2>
            </div>
            <StatusPill tone="muted">Draft</StatusPill>
          </div>

          {activeStep === 0 && (
            <div className="provider-form-grid animate-fade-in">
              <label>
                Internship Title *
                <input
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="e.g. Full Stack Engineering Intern"
                  required
                />
                {stepErrors.title && <span style={{ color: '#dc2626', fontSize: '0.72rem' }}>{stepErrors.title}</span>}
              </label>

              <label>
                Department *
                <select value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)}>
                  <option value="Engineering">Engineering</option>
                  <option value="AI / Machine Learning">AI / Machine Learning</option>
                  <option value="Data Science">Data Science</option>
                  <option value="Product Design">Product Design</option>
                  <option value="Backend Systems">Backend Systems</option>
                </select>
              </label>

              <label>
                Location *
                <input
                  value={formData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="e.g. Bengaluru, India or Remote"
                  required
                />
                {stepErrors.location && <span style={{ color: '#dc2626', fontSize: '0.72rem' }}>{stepErrors.location}</span>}
              </label>

              <label>
                Work Mode *
                <select value={formData.work_mode} onChange={(e) => handleInputChange('work_mode', e.target.value)}>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Remote">Remote</option>
                  <option value="On-site">On-site</option>
                </select>
              </label>

              <label>
                Program Duration *
                <input
                  value={formData.duration}
                  onChange={(e) => handleInputChange('duration', e.target.value)}
                  placeholder="e.g. 12 weeks / 3 months"
                  required
                />
              </label>

              <label>
                Stipend *
                <input
                  value={formData.stipend}
                  onChange={(e) => handleInputChange('stipend', e.target.value)}
                  placeholder="e.g. INR 20,000 / month"
                  required
                />
              </label>

              <label>
                Openings Count *
                <input
                  type="number"
                  min="1"
                  value={formData.openings}
                  onChange={(e) => handleInputChange('openings', e.target.value)}
                  required
                />
              </label>

              <label>
                Application Deadline
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => handleInputChange('deadline', e.target.value)}
                />
              </label>
            </div>
          )}

          {activeStep === 1 && (
            <div className="provider-form-grid animate-fade-in">
              <label className="wide">
                Opportunity Description *
                <textarea
                  rows="4"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the opportunity, learning environment, and what the intern will accomplish..."
                  required
                />
                {stepErrors.description && <span style={{ color: '#dc2626', fontSize: '0.72rem' }}>{stepErrors.description}</span>}
              </label>

              <label className="wide">
                Key Technical Skills (Comma Separated)
                <input
                  value={formData.skills}
                  onChange={(e) => handleInputChange('skills', e.target.value)}
                  placeholder="e.g. Python, FastAPI, React, SQL"
                />
              </label>

              <label className="wide">
                Key Requirements
                <textarea
                  rows="3"
                  value={formData.requirements}
                  onChange={(e) => handleInputChange('requirements', e.target.value)}
                  placeholder="e.g. Solid computer science fundamentals, git workflow experience"
                />
              </label>

              <label className="wide">
                Core Responsibilities
                <textarea
                  rows="3"
                  value={formData.responsibilities}
                  onChange={(e) => handleInputChange('responsibilities', e.target.value)}
                  placeholder="e.g. Implement REST endpoints, write unit tests, participate in design reviews"
                />
              </label>
            </div>
          )}

          {activeStep === 2 && (
            <div className="provider-form-grid animate-fade-in">
              <div className="wide" style={{ background: 'rgba(79, 70, 229, 0.06)', padding: '16px', borderRadius: '10px' }}>
                <strong style={{ color: 'var(--provider-text)' }}>AI-Assisted Screening</strong>
                <p style={{ margin: '4px 0 12px', fontSize: '0.82rem', color: 'var(--provider-text-soft)' }}>
                  Automatically calculate match scores based on candidate resume analysis. Human reviewers retain final authority.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.ai_screening_enabled}
                    onChange={(e) => handleInputChange('ai_screening_enabled', e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <span>Enable AI Resume Match Scoring</span>
                </label>
              </div>

              <div className="wide">
                <p style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '8px' }}>Configured Selection Funnel Stages:</p>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {['1. Application Received', '2. AI Resume Screening', '3. Technical Skill Assessment', '4. Mentor Interview', '5. Final Selection'].map((stage) => (
                    <div key={stage} style={{ padding: '10px 14px', background: '#fff', border: '1px solid var(--provider-border)', borderRadius: '8px', fontSize: '0.82rem' }}>
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="provider-form-grid animate-fade-in">
              <label className="wide">
                Assigned Lead Mentor
                <select value={formData.mentor_assigned} onChange={(e) => handleInputChange('mentor_assigned', e.target.value)}>
                  <option value="Priya Menon">Priya Menon (Lead Engineer)</option>
                  <option value="Rahul Shah">Rahul Shah (Staff AI Scientist)</option>
                  <option value="Dr. Aris Thorne">Dr. Aris Thorne (Research Director)</option>
                </select>
              </label>

              <div className="wide" style={{ padding: '14px', background: 'rgba(240, 242, 252, 0.6)', borderRadius: '10px' }}>
                <strong>Mentor Guidance Protocol</strong>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--provider-text-muted)' }}>
                  Assigned mentors will receive weekly task submission queues and progress reports automatically once interns are onboarded.
                </p>
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="provider-form-grid animate-fade-in">
              <div className="wide" style={{ background: '#fff', padding: '18px', border: '1px solid var(--provider-border)', borderRadius: '12px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: 'var(--provider-text)' }}>Program Summary Review</h3>
                <div className="provider-detail-list">
                  <span>Title<strong>{formData.title || 'Untitled Internship'}</strong></span>
                  <span>Department<strong>{formData.department}</strong></span>
                  <span>Location / Mode<strong>{formData.location} ({formData.work_mode})</strong></span>
                  <span>Stipend<strong>{formData.stipend}</strong></span>
                  <span>Openings<strong>{formData.openings} positions</strong></span>
                  <span>Mentor<strong>{formData.mentor_assigned}</strong></span>
                </div>
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--provider-border)' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--provider-text-muted)' }}>Description</span>
                  <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>{formData.description || 'No description provided.'}</p>
                </div>
              </div>
            </div>
          )}

          {formError && (
            <div className="provider-ai-callout" role="alert" style={{ marginTop: '14px' }}>
              <span>{formError}</span>
            </div>
          )}

          <div className="provider-form-footer">
            <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-internships')}>
              Cancel
            </button>

            {activeStep > 0 && (
              <button className="provider-quiet-button" type="button" onClick={handlePrevStep}>
                Previous Step
              </button>
            )}

            {activeStep < steps.length - 1 ? (
              <button className="provider-primary-btn" type="button" onClick={handleNextStep}>
                Continue to Next Step <ChevronRight size={15} />
              </button>
            ) : (
              <button className="provider-primary-btn" type="submit" disabled={isSaving}>
                {isSaving ? 'Publishing Program...' : <>Publish Internship <Sparkles size={15} /></>}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

function ScreeningDetailModal({ candidate, onClose, onStatusChange }) {
  if (!candidate) return null;
  const screening = candidate.screening || null;
  const matchNum = screening?.overall_score ?? candidate.numericMatch ?? null;

  return (
    <div
      className="provider-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        className="provider-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--provider-card-bg, #ffffff)',
          borderRadius: '16px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          border: '1px solid var(--provider-border, #e2e8f0)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <StatusPill tone="info">AI Analysis</StatusPill>
              {matchNum != null && (
                <StatusPill tone={matchNum >= 85 ? 'success' : matchNum >= 70 ? 'info' : 'warning'}>
                  {matchNum}% Overall Match
                </StatusPill>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--provider-text, #0f172a)' }}>
              {candidate.name}
            </h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--provider-muted, #64748b)', fontSize: '0.9rem' }}>
              {candidate.email} • {candidate.program}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--provider-muted, #64748b)',
              padding: '4px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#4f46e5', marginBottom: '8px' }}>
            <Sparkles size={16} /> AI Explanation
          </div>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#334155', lineHeight: 1.5 }}>
            {screening?.summary || candidate.screening_summary || 'Run AI screening to generate an evidence-based analysis of this application.'}
          </p>
          {screening?.recommendation && (
            <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#475569' }}>
              Model recommendation: <strong>{String(screening.recommendation).replace(/_/g, ' ')}</strong> — advisory only; the decision remains yours.
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={14} /> Matched Skills
            </h4>
            {(screening?.matched_skills?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {screening.matched_skills.map((skill) => (
                  <span key={skill} className="provider-status-pill success" style={{ padding: '2px 10px', fontSize: '0.8rem' }}>{skill}</span>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>No matched skills recorded yet.</p>
            )}
          </div>

          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9a3412', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} /> Missing Skills
            </h4>
            {(screening?.missing_skills?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {screening.missing_skills.map((skill) => (
                  <span key={skill} className="provider-status-pill warning" style={{ padding: '2px 10px', fontSize: '0.8rem' }}>{skill}</span>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>No missing skills recorded yet.</p>
            )}
          </div>
        </div>

        {((screening?.strengths?.length ?? 0) > 0 || (screening?.gaps?.length ?? 0) > 0) && (
          <div style={{ marginBottom: '20px' }}>
            {(screening?.strengths?.length ?? 0) > 0 && (
              <div style={{ marginBottom: screening?.gaps?.length ? '12px' : 0 }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '0.85rem', color: '#166534' }}>Evidence — Strengths</h4>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.88rem', color: '#334155' }}>
                  {screening.strengths.map((str, i) => <li key={i}>{str}</li>)}
                </ul>
              </div>
            )}
            {(screening?.gaps?.length ?? 0) > 0 && (
              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '0.85rem', color: '#9a3412' }}>Evidence — Gaps</h4>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.88rem', color: '#334155' }}>
                  {screening.gaps.map((gap, i) => <li key={i}>{gap}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            className="provider-quiet-button"
            style={{ color: '#dc2626' }}
            onClick={() => {
              onStatusChange(candidate, 'Rejected');
              onClose();
            }}
          >
            Reject Candidate
          </button>
          <button
            type="button"
            className="provider-primary-btn"
            onClick={() => {
              onStatusChange(candidate, 'Shortlisted');
              onClose();
            }}
          >
            <CheckCircle2 size={15} /> Shortlist Candidate
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveApplications({ onNavigate, screening = false }) {
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [matchScoreFilter, setMatchScoreFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedScreeningCandidate, setSelectedScreeningCandidate] = useState(null);
  const [screeningJob, setScreeningJob] = useState(null); // { id, phase: 'running'|'done'|'failed', error }

  const loadApplications = () => {
    setIsLoading(true);
    fetchApplications()
      .then((result) => {
        setApplications(result.items || []);
        setError('');
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadApplications);
  }, []);

  // Reset page when filters change (deferred to avoid sync setState in effect)
  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, matchScoreFilter]);

  const changeStatus = async (item, newStatus) => {
    try {
      const updated = await updateApplicationStatus(item.apiId, newStatus);
      setApplications((prev) =>
        prev.map((app) => (app.id === item.apiId ? { ...app, status: updated.status } : app))
      );
      setToastMessage(`${item.name} status updated to ${newStatus}`);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  /* Trigger real AI screening for one application. The modal shows the Ready →
     Screening → Completed/Failed lifecycle; results come from the backend. */
  const runScreening = async (item) => {
    setScreeningJob({ id: item.apiId, phase: 'running', error: '' });
    try {
      const result = await screenApplication(item.apiId);
      setScreeningJob({ id: item.apiId, phase: 'done', error: '' });
      setToastMessage(`AI screening completed for ${item.name}`);
      setTimeout(() => setToastMessage(''), 3000);
      setSelectedScreeningCandidate({ ...item, screening: result });
      await loadApplications();
    } catch (requestError) {
      const message = requestError?.message || 'AI screening could not be completed.';
      setScreeningJob({ id: item.apiId, phase: 'failed', error: message });
      setError(`AI screening failed for ${item.name}: ${message}`);
    }
  };

  const runBatchScreening = async () => {
    const unscreened = formattedApiItems.filter((item) => item.screening_status !== 'completed' && item.screening_status !== 'failed');
    if (unscreened.length === 0) {
      setToastMessage('Every application already has a completed screening result.');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }
    setScreeningJob({ id: 'batch', phase: 'running', error: '' });
    let completed = 0;
    let failed = 0;
    for (const item of unscreened) {
      try {
        await screenApplication(item.apiId);
        completed += 1;
      } catch {
        failed += 1;
      }
    }
    setScreeningJob(null);
    setToastMessage(`Batch screening finished: ${completed} completed${failed ? `, ${failed} failed` : ''}.`);
    setTimeout(() => setToastMessage(''), 3500);
    await loadApplications();
  };

  const formattedApiItems = applications.map((app) => {
    const screeningDone = app.screening_status === 'completed';
    const screeningRunning = ['queued', 'pending', 'processing'].includes(app.screening_status || '');
    return {
      id: `api-app-${app.id}`,
      apiId: app.id,
      name: app.applicant_name || 'Intern Candidate',
      email: app.applicant_email || 'candidate@dev.in',
      program: app.internship_title || 'Internship Program',
      match: screeningDone && app.screening_overall_score != null ? `${app.screening_overall_score}%` : screeningRunning ? 'Screening…' : app.screening_status === 'failed' ? 'Failed' : 'Ready',
      numericMatch: screeningDone ? app.screening_overall_score : null,
      screening_status: app.screening_status || 'pending',
      screening_summary: screeningDone ? app.screening_summary : '',
      status: app.status === 'applied' ? 'Under Review' : app.status.charAt(0).toUpperCase() + app.status.slice(1),
      date: app.created_at ? new Date(app.created_at).toLocaleDateString() : 'Today',
      raw_app: app,
    };
  });

  const allCandidates = formattedApiItems;

  const filteredCandidates = allCandidates.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.email.toLowerCase().includes(q) || item.program.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || item.status.toLowerCase() === statusFilter.toLowerCase();

    let matchesMatchFilter = true;
    const score = item.numericMatch || parseInt(item.match, 10) || 0;
    if (matchScoreFilter === 'high') matchesMatchFilter = score >= 85;
    else if (matchScoreFilter === 'medium') matchesMatchFilter = score >= 70 && score < 85;
    else if (matchScoreFilter === 'low') matchesMatchFilter = score < 70;

    return matchesSearch && matchesStatus && matchesMatchFilter;
  });

  const totalItems = filteredCandidates.length;
  const paginatedCandidates = filteredCandidates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const highMatchCount = allCandidates.filter((c) => c.numericMatch != null && c.numericMatch >= 85).length;
  const scoredCandidates = allCandidates.filter((c) => c.numericMatch != null);

  return (
    <>
      <SectionHeader
        eyebrow={screening ? 'AI-Assisted Evaluation' : 'Recruitment'}
        title={screening ? 'Candidate Screening Queue' : 'Applications & Candidates'}
        description={screening ? 'Review candidate AI match scores, skill gap evaluations, and automated screening breakdowns.' : 'Review, evaluate, and advance candidates through recruitment stages.'}
        actions={
          screening ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-applications')}>
                View All Applications
              </button>
              <button
                className="provider-primary-btn"
                type="button"
                onClick={runBatchScreening}
                disabled={screeningJob?.phase === 'running'}
              >
                <Sparkles size={15} /> {screeningJob?.id === 'batch' && screeningJob.phase === 'running' ? 'Screening…' : 'Run AI Batch Screening'}
              </button>
            </div>
          ) : (
            <button className="provider-primary-btn" type="button" onClick={() => onNavigate('/provider-screening')}>
              <Sparkles size={15} /> Open Screening Queue
            </button>
          )
        }
      />

      {screening && (
        <StatStrip
          items={[
            ['Applications', allCandidates.length, 'Received for your internships'],
            ['Screened', scoredCandidates.length, 'AI analysis completed'],
            ['High AI Match (>85%)', highMatchCount, 'Top tier candidates'],
            ['Shortlisted', allCandidates.filter((c) => c.status === 'Shortlisted').length, 'Ready for next stage'],
          ]}
        />
      )}

      <div className="provider-workspace-toolbar">
        <div className="provider-search-field">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates by name, email, or program..."
          />
        </div>

        {screening && (
          <select className="provider-select" value={matchScoreFilter} onChange={(e) => setMatchScoreFilter(e.target.value)}>
            <option value="">All AI Match Scores</option>
            <option value="high">High Match (85%+)</option>
            <option value="medium">Moderate Match (70–84%)</option>
            <option value="low">Low Match (&lt;70%)</option>
          </select>
        )}

        <select className="provider-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Under Review">Under Review</option>
          <option value="Shortlisted">Shortlisted</option>
          <option value="Assessment">Assessment</option>
          <option value="Interview">Interview</option>
          <option value="Selected">Selected</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {toastMessage && (
        <div className="provider-status-pill success" style={{ marginBottom: '12px', display: 'inline-flex', padding: '6px 12px' }}>
          <CheckCircle2 size={14} style={{ marginRight: '6px' }} /> {toastMessage}
        </div>
      )}

      {error && <div className="provider-ai-callout" role="alert">{error}</div>}

      <section className="provider-workspace-panel">
        {isLoading ? (
          <p className="provider-body-copy">Loading candidate applications...</p>
        ) : allCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Users size={36} style={{ color: '#94a3b8', marginBottom: '12px' }} />
            <p className="provider-body-copy" style={{ fontWeight: 600, marginBottom: '4px' }}>No applications yet</p>
            <p className="provider-body-copy" style={{ color: '#64748b' }}>
              When candidates apply to your published internships, they appear here with their AI screening evidence.
            </p>
          </div>
        ) : paginatedCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p className="provider-body-copy" style={{ marginBottom: '10px' }}>No candidates match your search or filters.</p>
            <button
              type="button"
              className="provider-quiet-button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setMatchScoreFilter('');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Program</th>
                    <th>AI Match Score</th>
                    <th>Screening Status</th>
                    <th>Status</th>
                    <th>Applied Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCandidates.map((row) => {
                    const scoreNum = row.numericMatch || parseInt(row.match, 10) || 0;
                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                          <small>{row.email}</small>
                        </td>
                        <td>{row.program}</td>
                        <td>
                          {row.numericMatch != null ? (
                            <span
                              className="provider-status-pill"
                              style={{
                                background: scoreNum >= 85 ? 'rgba(34, 197, 94, 0.12)' : scoreNum >= 70 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(234, 179, 8, 0.12)',
                                color: scoreNum >= 85 ? '#15803d' : scoreNum >= 70 ? '#1d4ed8' : '#b45309',
                                fontWeight: 700,
                              }}
                            >
                              <Sparkles size={12} style={{ marginRight: '4px' }} />
                              {row.match}
                            </span>
                          ) : (
                            <span className="provider-status-pill muted">{row.match}</span>
                          )}
                        </td>
                        <td>
                          <StatusPill tone={row.screening_status === 'completed' ? 'info' : row.screening_status === 'failed' ? 'warning' : 'muted'}>
                            {row.screening_status === 'completed' ? 'Screened' : row.screening_status === 'failed' ? 'Failed' : row.screening_status === 'processing' ? 'Processing' : 'Ready'}
                          </StatusPill>
                        </td>
                        <td>
                          <StatusPill tone={row.status === 'Selected' ? 'success' : row.status === 'Shortlisted' ? 'info' : row.status === 'Rejected' ? 'warning' : 'muted'}>
                            {row.status}
                          </StatusPill>
                        </td>
                        <td>{row.date}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              className="provider-primary-btn"
                              type="button"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              disabled={screeningJob?.phase === 'running' && screeningJob.id === row.apiId}
                              onClick={() => runScreening(row)}
                            >
                              <Sparkles size={12} />
                              {screeningJob?.id === row.apiId && screeningJob.phase === 'running'
                                ? 'Screening…'
                                : row.screening_status === 'completed'
                                  ? 'AI Analysis'
                                  : row.screening_status === 'failed'
                                    ? 'Retry Screening'
                                    : 'AI Screen'}
                            </button>
                            <button
                              className="provider-row-link"
                              type="button"
                              onClick={() => onNavigate(`/provider-candidate?id=${row.apiId}`)}
                            >
                              Profile <ChevronRight size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[5, 10, 20]}
            />
          </>
        )}
      </section>

      {selectedScreeningCandidate && (
        <ScreeningDetailModal
          candidate={selectedScreeningCandidate}
          onClose={() => setSelectedScreeningCandidate(null)}
          onStatusChange={changeStatus}
        />
      )}
    </>
  );
}

function CandidateDetail({ onNavigate }) {
  const applicationId = new URLSearchParams(window.location.search).get('id');
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, action: '' });
  const [toast, setToast] = useState('');

  // Provider → mentor assignment (Phase 1). Real backend: POST /api/mentor/assignments —
  // authorization and duplicate prevention are enforced server-side.
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [mentors, setMentors] = useState({ items: [], loading: false, error: '' });
  const [assignState, setAssignState] = useState({ mentorId: '', submitting: false, error: '', done: false });
  const [assignedMentor, setAssignedMentor] = useState(null);

  const loadDetail = () => {
    if (!applicationId) {
      setError('No application selected. Open a candidate from the Applications table.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    fetchApplicationDetail(applicationId)
      .then((data) => {
        setDetail(data);
        setError('');
        // Reflect any existing backend assignment for this candidate + internship
        // so the assigned mentor survives a full page refresh.
        fetchProviderAssignments()
          .then((result) => {
            const match = (result.items || []).find(
              (a) => String(a.intern_id) === String(data.candidate.id)
                && String(a.internship_id) === String(data.internship.id)
            );
            if (match) setAssignedMentor({ name: match.mentor_name, assigned_at: match.created_at });
          })
          .catch(() => {});
      })
      .catch((requestError) => setError(requestError?.message || 'Unable to load this application.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadDetail);
  }, [applicationId]);

  const lifecycle = ['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected'];
  const status = detail?.status;
  const statusIdx = lifecycle.indexOf(status);

  const handleDecision = async (newStatus) => {
    setIsAdvancing(true);
    setError('');
    try {
      await updateApplicationStatus(detail.id, newStatus);
      setToast(`Candidate moved to ${newStatus}.`);
      setTimeout(() => setToast(''), 3000);
      setConfirmModal({ open: false, action: '' });
      loadDetail();
    } catch (requestError) {
      setError(requestError?.message || 'Could not update the application status.');
      setConfirmModal({ open: false, action: '' });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleAssign = async () => {
    if (!assignState.mentorId) {
      setAssignState((prev) => ({ ...prev, error: 'Select a mentor to continue.' }));
      return;
    }
    setAssignState((prev) => ({ ...prev, submitting: true, error: '' }));
    try {
      await createMentorAssignment({
        mentorId: assignState.mentorId,
        internId: detail.candidate.id,
        internshipId: detail.internship.id,
      });
      const mentorName = mentors.items.find((m) => String(m.id) === String(assignState.mentorId))?.full_name || 'the selected mentor';
      setAssignedMentor({ name: mentorName, assigned_at: new Date().toISOString() });
      setAssignState((prev) => ({ ...prev, submitting: false, done: true }));
      setToast(`${detail.candidate.name} assigned to ${mentorName}.`);
      setTimeout(() => setToast(''), 4000);
    } catch (requestError) {
      setAssignState((prev) => ({ ...prev, submitting: false, error: requestError?.message || 'Could not create the assignment.' }));
    }
  };

  const openAssignModal = () => {
    setAssignState({ mentorId: '', submitting: false, error: '', done: false });
    setAssignModalOpen(true);
    setMentors((prev) => ({ ...prev, loading: true, error: '' }));
    fetchAvailableMentors()
      .then((result) => setMentors({ items: result.items || [], loading: false, error: '' }))
      .catch((requestError) => setMentors({ items: [], loading: false, error: requestError?.message || 'Unable to load mentors.' }));
  };

  if (isLoading) {
    return (
      <div className="provider-workspace-panel" style={{ padding: '28px' }}>
        <p className="provider-body-copy">Loading candidate application...</p>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="provider-workspace-panel" style={{ padding: '28px' }}>
        <div className="provider-panel-heading">
          <div>
            <span className="provider-panel-kicker">Candidate</span>
            <h2>Application unavailable</h2>
          </div>
          <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-applications')}>
            Back to applications
          </button>
        </div>
        <p className="provider-body-copy">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  const { candidate, internship, skills, screening } = detail;
  const screeningDone = screening?.status === 'completed';
  const screeningRunning = screening && ['queued', 'pending', 'processing'].includes(screening.status);
  const nextStage = statusIdx >= 0 && statusIdx < lifecycle.length - 1 ? lifecycle[statusIdx + 1] : null;
  const canDecide = status !== 'selected' && status !== 'rejected';

  return (
    <>
      <SectionHeader
        eyebrow="Candidate application"
        title={candidate.name}
        description={`${internship.title} · Applied ${detail.created_at ? new Date(detail.created_at).toLocaleDateString() : 'recently'}`}
        actions={
            <>
            {canDecide && (
              <button
                className="provider-quiet-button"
                type="button"
                style={{ color: '#dc2626' }}
                onClick={() => setConfirmModal({ open: true, action: 'Reject' })}
              >
                Reject
              </button>
            )}
            {canDecide && nextStage && (
              <button
                className="provider-primary-btn"
                type="button"
                disabled={isAdvancing}
                onClick={() => setConfirmModal({ open: true, action: nextStage })}
              >
                <CheckCircle2 size={15} /> {isAdvancing ? 'Updating…' : `Advance to ${nextStage}`}
              </button>
            )}
            {status === 'selected' && !assignedMentor && (
              <button className="provider-primary-btn" type="button" onClick={openAssignModal}>
                <UserPlus size={15} /> Assign Mentor
              </button>
            )}
            <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-applications')}>
              Back
            </button>
            </>
        }
      />

      {toast && (
        <div className="provider-status-pill success" style={{ marginBottom: '12px', display: 'inline-flex', padding: '6px 12px' }}>
          <CheckCircle2 size={14} style={{ marginRight: '6px' }} /> {toast}
        </div>
      )}
      {error && <div className="provider-ai-callout" role="alert">{error}</div>}

      {/* Lifecycle progress */}
      <div className="provider-workspace-panel" style={{ marginBottom: '20px' }}>
        <div className="provider-panel-heading"><h2>Application Progress</h2></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {lifecycle.map((stage, idx) => (
            <span
              key={stage}
              className={`provider-status-pill ${stage === status ? 'info' : statusIdx > idx ? 'success' : 'muted'}`}
              style={{ fontWeight: stage === status ? 800 : 500, textDecoration: status === 'rejected' && stage === 'selected' ? 'line-through' : 'none' }}
            >
              {statusIdx > idx ? '✓ ' : ''}{stage}
            </span>
          ))}
          {status === 'rejected' && <span className="provider-status-pill warning">Not selected</span>}
        </div>
      </div>

      <div className="provider-detail-grid">
        {/* Candidate + internship + skills */}
        <section className="provider-workspace-panel">
          <div className="provider-profile-heading">
            <div className="provider-large-avatar">{candidate.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{candidate.name}</h2>
              <p>{candidate.email}</p>
              <StatusPill tone={status === 'selected' ? 'success' : status === 'rejected' ? 'warning' : 'info'}>{status}</StatusPill>
            </div>
          </div>
          <div className="provider-detail-list">
            <span>Internship<strong>{internship.title} · {internship.work_mode}</strong></span>
            <span>Department<strong>{internship.department}</strong></span>
            <span>Duration<strong>{internship.duration} · {internship.stipend}</strong></span>
            <span>Resume<strong>{detail.resume_file_name || 'Submitted'}</strong></span>
            <span>Mentor<strong>{assignedMentor ? assignedMentor.name : 'Not assigned yet'}</strong></span>
          </div>

          <div className="provider-panel-heading" style={{ marginTop: '18px' }}>
            <h2 style={{ fontSize: '1rem' }}>Skills</h2>
          </div>
          <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '0 0 6px' }}>
            Required by internship
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {(skills.required_skills || []).length === 0
              ? <span className="provider-body-copy" style={{ fontSize: '0.8rem', opacity: 0.7 }}>No required skills defined for this internship yet.</span>
              : skills.required_skills.map((s) => <SkillChip key={s.id} name={s.name} variant="neutral" />)}
          </div>
          <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '0 0 6px' }}>
            Matched — candidate has these on record
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {(skills.matched_skills || []).length === 0
              ? <span className="provider-body-copy" style={{ fontSize: '0.8rem', opacity: 0.7 }}>No matches recorded yet.</span>
              : skills.matched_skills.map((s) => <SkillChip key={s.name} name={s.name} variant="matched" source={s.source} />)}
          </div>
          <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '0 0 6px' }}>
            Potential gaps — not listed on the candidate profile (not evidence of inability)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(skills.potential_gaps || []).length === 0
              ? <span className="provider-body-copy" style={{ fontSize: '0.8rem', opacity: 0.7 }}>No gaps — all required skills are on record.</span>
              : skills.potential_gaps.map((s) => <SkillChip key={s.name} name={s.name} variant="gap" />)}
          </div>
        </section>

        {/* AI screening evidence */}
        <section className="provider-workspace-panel">
          <div className="provider-panel-heading">
            <h2>AI Screening</h2>
            <StatusPill tone={screeningDone ? 'info' : screening?.status === 'failed' ? 'warning' : 'muted'}>
              {screeningDone ? 'Completed' : screening?.status === 'failed' ? 'Failed' : screeningRunning ? 'In progress' : 'Not screened'}
            </StatusPill>
          </div>

          {!screening && (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <p className="provider-body-copy" style={{ fontWeight: 600 }}>No screening result yet</p>
              <p className="provider-body-copy" style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Run AI screening from the Applications table to generate evidence for this candidate.
              </p>
              <button
                className="provider-primary-btn"
                type="button"
                onClick={async () => {
                  try {
                    await screenApplication(detail.id);
                    setToast('AI screening completed.');
                    setTimeout(() => setToast(''), 3000);
                    loadDetail();
                  } catch (requestError) {
                    setError(requestError?.message || 'AI screening failed.');
                  }
                }}
              >
                <Sparkles size={15} /> Run AI Screening
              </button>
            </div>
          )}

          {screeningRunning && (
            <p className="provider-body-copy">Screening is running — results appear here when the backend completes the analysis.</p>
          )}

          {screening?.status === 'failed' && (
            <div className="provider-ai-callout" role="alert">
              Screening failed: {screening.summary || 'the analysis could not complete.'} You can retry from the Applications table.
            </div>
          )}

          {screeningDone && (
            <>
              <div className="provider-match-score">
                {screening.overall_score != null ? `${screening.overall_score}%` : '—'}
                <small>AI-reported match — decision support only, not a hiring decision</small>
              </div>
              <p className="provider-body-copy" style={{ fontSize: '0.88rem' }}>{screening.summary}</p>
              {(screening.matched_skills?.length > 0) && (
                <>
                  <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '12px 0 6px', fontWeight: 700 }}>Matched skills (per AI analysis)</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {screening.matched_skills.map((s) => <SkillChip key={s} name={s} variant="matched" />)}
                  </div>
                </>
              )}
              {(screening.missing_skills?.length > 0) && (
                <>
                  <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '12px 0 6px', fontWeight: 700 }}>Missing skills (per AI analysis)</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {screening.missing_skills.map((s) => <SkillChip key={s} name={s} variant="gap" />)}
                  </div>
                </>
              )}
              {(screening.strengths?.length > 0) && (
                <>
                  <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '12px 0 4px', fontWeight: 700 }}>Evidence — strengths</p>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: '#334155' }}>
                    {screening.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </>
              )}
              {(screening.gaps?.length > 0) && (
                <>
                  <p className="provider-body-copy" style={{ fontSize: '0.8rem', margin: '12px 0 4px', fontWeight: 700 }}>Evidence — potential gaps</p>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.85rem', color: '#334155' }}>
                    {screening.gaps.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </>
              )}
              {screening.recommendation && (
                <p className="provider-body-copy" style={{ fontSize: '0.8rem', marginTop: '12px', color: '#475569' }}>
                  Model recommendation: <strong>{String(screening.recommendation).replace(/_/g, ' ')}</strong> — advisory only. All decisions remain yours.
                </p>
              )}
              {screening.screened_at && (
                <p className="provider-body-copy" style={{ fontSize: '0.75rem', marginTop: '8px', color: '#64748b' }}>
                  Screened {new Date(screening.screened_at).toLocaleString()} · model: {screening.model_used}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <ConfirmationModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: '' })}
        onConfirm={() => handleDecision(confirmModal.action === 'Reject' ? 'rejected' : confirmModal.action)}
        title={confirmModal.action === 'Reject' ? 'Reject Candidate' : `Advance to ${confirmModal.action}`}
        message={`Set ${candidate.name}'s application status to ${confirmModal.action === 'Reject' ? 'rejected' : confirmModal.action}?`}
        confirmLabel={confirmModal.action === 'Reject' ? 'Confirm rejection' : 'Confirm'}
        tone={confirmModal.action === 'Reject' ? 'danger' : 'info'}
      />

      <AssignMentorModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        candidate={candidate}
        internship={internship}
        mentors={mentors}
        state={assignState}
        onMentorChange={(mentorId) => setAssignState((prev) => ({ ...prev, mentorId, error: '' }))}
        onConfirm={handleAssign}
        assignedMentor={assignedMentor}
      />
    </>
  );
}

function AssignMentorModal({ open, onClose, candidate, internship, mentors, state, onMentorChange, onConfirm, assignedMentor }) {
  if (!open || !candidate || !internship) return null;

  return (
    <div
      className="provider-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        className="provider-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--provider-card-bg, #ffffff)',
          borderRadius: '16px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          border: '1px solid var(--provider-border, #e2e8f0)',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <StatusPill tone="info">Mentorship</StatusPill>
            </div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--provider-text, #0f172a)' }}>
              Assign a Mentor
            </h2>
            <p style={{ margin: '4px 0 0 0', color: 'var(--provider-muted, #64748b)', fontSize: '0.85rem' }}>
              Pair this selected candidate with a mentor to begin the guided internship.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--provider-muted, #64748b)', padding: '4px', borderRadius: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Candidate + internship summary — read-only context */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--provider-surface, #f8fafc)', border: '1px solid var(--provider-border, #e2e8f0)' }}>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--provider-muted, #64748b)' }}>Candidate</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700, color: 'var(--provider-text, #0f172a)', fontSize: '0.9rem' }}>{candidate.name}</p>
            <p style={{ margin: '2px 0 0', color: 'var(--provider-muted, #64748b)', fontSize: '0.78rem' }}>{candidate.email}</p>
          </div>
          <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--provider-surface, #f8fafc)', border: '1px solid var(--provider-border, #e2e8f0)' }}>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--provider-muted, #64748b)' }}>Internship</p>
            <p style={{ margin: '4px 0 0', fontWeight: 700, color: 'var(--provider-text, #0f172a)', fontSize: '0.9rem' }}>{internship.title}</p>
            <p style={{ margin: '2px 0 0', color: 'var(--provider-muted, #64748b)', fontSize: '0.78rem' }}>{internship.work_mode} · {internship.duration}</p>
          </div>
        </div>

        {state.done ? (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700, marginBottom: '8px' }}>
              <CheckCircle2 size={22} /> Assignment created
            </div>
            <p style={{ margin: '0 0 16px', color: 'var(--provider-muted, #64748b)', fontSize: '0.88rem' }}>
              {candidate.name} is now assigned to <strong>{assignedMentor?.name}</strong>.
            </p>
            <button className="provider-primary-btn" type="button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            {mentors.loading ? (
              <p style={{ color: 'var(--provider-muted, #64748b)', fontSize: '0.85rem', padding: '12px 0' }}>Loading available mentors…</p>
            ) : mentors.error ? (
              <div className="provider-ai-callout" role="alert">
                {mentors.error}
              </div>
            ) : mentors.items.length === 0 ? (
              <p style={{ color: 'var(--provider-muted, #64748b)', fontSize: '0.85rem', padding: '12px 0' }}>
                No mentors are available for assignment yet. Ask mentors to register first.
              </p>
            ) : (
              <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--provider-text, #0f172a)' }}>
                Select mentor *
                <select
                  value={state.mentorId}
                  onChange={(e) => onMentorChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid var(--provider-border, #e2e8f0)',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    background: '#fff',
                    color: 'var(--provider-text, #0f172a)',
                  }}
                >
                  <option value="">Select a mentor…</option>
                  {mentors.items.map((mentor) => (
                    <option key={mentor.id} value={mentor.id}>
                      {mentor.full_name} — {mentor.email}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {state.error && (
              <div className="provider-ai-callout" role="alert" style={{ marginBottom: '12px' }}>
                {state.error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="provider-quiet-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                className="provider-primary-btn"
                type="button"
                disabled={state.submitting || !state.mentorId}
                onClick={onConfirm}
              >
                <UserPlus size={15} /> {state.submitting ? 'Assigning…' : 'Confirm assignment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Interviews() {
  const [interviews, setInterviews] = useState([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [interviewsError, setInterviewsError] = useState('');
  const [internships, setInternships] = useState([]);
  const [selectedInternshipId, setSelectedInternshipId] = useState('');
  const [eligibleCandidates, setEligibleCandidates] = useState([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [showAddModal, setShowAddModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    scheduled_at: '',
    duration_minutes: 30,
    notes: '',
    meeting_link: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [scorecardModal, setScorecardModal] = useState({ open: false, interview: null });
  const [scorecard, setScorecard] = useState({
    technical_skills: 3,
    communication: 3,
    problem_solving: 3,
    role_understanding: 3,
    relevant_skills: 3,
    overall_recommendation: 'further_review',
    evidence_notes: '',
    skill_evaluations: [{ skill_name: '', rating: 3, notes: '' }],
  });
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [scorecardSaving, setScorecardSaving] = useState(false);
  const [scorecardError, setScorecardError] = useState('');
  const [scorecardSaved, setScorecardSaved] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const openScorecard = (interview) => {
    setScorecardModal({ open: true, interview });
    setScorecardError('');
    setScorecardSaved(false);
    setScorecardLoading(true);
    fetchInterviewScorecard(interview.id)
      .then((existing) => {
        setScorecard({
          technical_skills: existing.technical_skills ?? 3,
          communication: existing.communication ?? 3,
          problem_solving: existing.problem_solving ?? 3,
          role_understanding: existing.role_understanding ?? 3,
          relevant_skills: existing.relevant_skills ?? 3,
          overall_recommendation: existing.overall_recommendation || 'further_review',
          evidence_notes: existing.evidence_notes || '',
          skill_evaluations: (Array.isArray(existing.skill_evaluations) && existing.skill_evaluations.length
            ? existing.skill_evaluations
            : [{ skill_name: '', rating: 3, notes: '' }]),
        });
        setScorecardSaved(true);
      })
      .catch(() => {
        // No scorecard yet — start from defaults.
        setScorecard({
          technical_skills: 3,
          communication: 3,
          problem_solving: 3,
          role_understanding: 3,
          relevant_skills: 3,
          overall_recommendation: 'further_review',
          evidence_notes: '',
          skill_evaluations: [{ skill_name: '', rating: 3, notes: '' }],
        });
        setScorecardSaved(false);
      })
      .finally(() => setScorecardLoading(false));
  };

  const handleScorecardSave = async () => {
    if (!scorecardModal.interview || scorecardSaving) return;
    setScorecardSaving(true);
    setScorecardError('');
    try {
      await submitInterviewScorecard(scorecardModal.interview.id, {
        ...scorecard,
        skill_evaluations: scorecard.skill_evaluations.filter((entry) => entry.skill_name && entry.skill_name.trim()),
      });
      const refreshed = await fetchProviderInterviews();
      setInterviews(Array.isArray(refreshed) ? refreshed : refreshed.items || []);
      setScorecardSaved(true);
    } catch (requestError) {
      setScorecardError(requestError?.message || 'Could not save the scorecard.');
    } finally {
      setScorecardSaving(false);
    }
  };

  const handleCancelInterview = async (interview) => {
    if (cancellingId) return;
    if (!window.confirm(`Cancel the interview with ${interview.candidate_name || 'this candidate'}? The candidate will see it as cancelled.`)) return;
    setCancellingId(interview.id);
    try {
      await updateInterviewStatus(interview.id, 'cancelled');
      const refreshed = await fetchProviderInterviews();
      setInterviews(Array.isArray(refreshed) ? refreshed : refreshed.items || []);
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not cancel the interview.');
    } finally {
      setCancellingId(null);
    }
  };

  const loadInterviews = () => {
    setInterviewsLoading(true);
    setInterviewsError('');
    fetchProviderInterviews()
      .then((result) => setInterviews(Array.isArray(result) ? result : result.items || []))
      .catch((requestError) => setInterviewsError(requestError?.message || 'Could not load interviews.'))
      .finally(() => setInterviewsLoading(false));
    fetchInternships({ query: '', status: '' })
      .then((result) => setInternships(result.items || []))
      .catch(() => setInternships([]));
  };

  useEffect(() => {
    Promise.resolve().then(loadInterviews);
  }, []);

  useEffect(() => {
    if (!selectedInternshipId) return undefined;

    const timer = Promise.resolve().then(() =>
      fetchEligibleCandidates(selectedInternshipId)
        .then((items) => {
          setEligibleCandidates(items);
          setSelectedCandidateId('');
        })
        .catch(() => setEligibleCandidates([]))
    );
    return () => timer;
  }, [selectedInternshipId]);

  const filteredCandidates = eligibleCandidates.filter((item) => {
    const search = candidateSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      (item.candidate_name || '').toLowerCase().includes(search) ||
      (item.candidate_email || '').toLowerCase().includes(search) ||
      String(item.application_id).includes(search)
    );
  });

  const filteredInterviews = interviews.filter((item) => {
    const search = query.trim().toLowerCase();
    if (!search) return true;
    return (
      (item.candidate_name || '').toLowerCase().includes(search) ||
      (item.internship_title || '').toLowerCase().includes(search) ||
      (item.interviewer_name || '').toLowerCase().includes(search)
    );
  });

  const totalItems = filteredInterviews.length;
  const paginated = filteredInterviews.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSchedule = async () => {
    if (!selectedInternshipId || !selectedCandidateId || !scheduleForm.scheduled_at) {
      setFormError('Select an internship, a candidate, and a valid interview time.');
      return;
    }

    const scheduledDate = new Date(scheduleForm.scheduled_at);
    if (Number.isNaN(scheduledDate.getTime())) {
      setFormError('Enter a valid date and time for the interview.');
      return;
    }
    if (scheduledDate.getTime() <= Date.now()) {
      setFormError('Interview time must be in the future.');
      return;
    }
    const duration = Number(scheduleForm.duration_minutes);
    if (!Number.isFinite(duration) || duration < 15 || duration > 180) {
      setFormError('Duration must be between 15 and 180 minutes.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      await scheduleInterview({
        application_id: Number(selectedCandidateId),
        scheduled_at: new Date(scheduleForm.scheduled_at).toISOString(),
        duration_minutes: Number(scheduleForm.duration_minutes) || 30,
        meeting_link: scheduleForm.meeting_link || undefined,
        notes: scheduleForm.notes || undefined,
      });

      const refreshed = await fetchProviderInterviews();
      setInterviews(Array.isArray(refreshed) ? refreshed : refreshed.items || []);
      setShowAddModal(false);
      setSelectedCandidateId('');
      setScheduleForm({ scheduled_at: '', duration_minutes: 30, notes: '', meeting_link: '' });
    } catch (requestError) {
      setFormError(requestError?.message || 'Could not schedule the interview.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Selection process"
        title="Interviews"
        description="Review scheduled interviews and schedule meetings only for interview-eligible candidates in your own internships."
        actions={
          <>
            <button className="provider-quiet-button" type="button" onClick={loadInterviews} disabled={interviewsLoading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="provider-primary-btn" type="button" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Schedule interview
            </button>
          </>
        }
      />

      {interviewsError && <ErrorPanel message={interviewsError} onRetry={loadInterviews} />}
      {interviewsLoading && !interviewsError && <LoadingPanel label="Loading interviews…" />}
      {!interviewsLoading && !interviewsError && (
      <>
      <div className="provider-workspace-toolbar">
        <div className="provider-search-field">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search interviews..." />
        </div>
      </div>

      <section className="provider-workspace-panel">
        <div className="provider-table-wrap">
          <table className="provider-data-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Program</th>
                <th>Interviewer</th>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>
                    No scheduled interviews found.
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.candidate_name || 'Candidate'}</strong></td>
                    <td>{row.internship_title || 'Internship'}</td>
                    <td>{row.interviewer_name || 'Provider'}</td>
                    <td>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : '—'}</td>
                    <td>
                      <StatusPill tone={
                        row.status === 'completed' ? 'success'
                          : row.status === 'cancelled' || row.status === 'no_show' ? 'muted'
                            : 'info'}
                      >
                        {row.status}
                      </StatusPill>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="provider-row-link" type="button" onClick={() => openScorecard(row)}>
                          {row.status === 'completed' ? 'View scorecard' : 'Review'}
                        </button>
                        {(row.status === 'scheduled' || row.status === 'confirmed') && (
                          <button
                            className="provider-row-link"
                            type="button"
                            style={{ color: '#b45309' }}
                            disabled={cancellingId === row.id}
                            onClick={() => handleCancelInterview(row)}
                          >
                            {cancellingId === row.id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[5, 10]}
        />
      </section>
      </>
      )}

      {scorecardModal.open && scorecardModal.interview && (
        <div className="modal-backdrop-overlay" onClick={() => setScorecardModal({ open: false, interview: null })}>
          <div className="modal-dialog-card animate-scale-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Interview scorecard">
            <div className="modal-dialog-header">
              <h2 className="modal-dialog-title">Interview scorecard — {scorecardModal.interview.candidate_name}</h2>
              <button className="modal-close-btn" type="button" onClick={() => setScorecardModal({ open: false, interview: null })}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-dialog-body" style={{ display: 'grid', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                {scorecardModal.interview.internship_title} · {scorecardModal.interview.scheduled_at ? new Date(scorecardModal.interview.scheduled_at).toLocaleString() : ''}
              </p>

              {scorecardLoading ? (
                <LoadingPanel label="Loading scorecard…" />
              ) : (
                <>
                  {scorecardSaved && (
                    <div className="provider-status-pill success" style={{ display: 'inline-flex', width: 'fit-content' }}>
                      <CheckCircle2 size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} /> Scorecard saved — safe to edit again (the latest submission is what counts)
                    </div>
                    )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    {[
                      ['technical_skills', 'Technical Skills'],
                      ['communication', 'Communication'],
                      ['problem_solving', 'Problem Solving'],
                      ['role_understanding', 'Role Understanding'],
                      ['relevant_skills', 'Relevant Skills'],
                    ].map(([field, label]) => (
                      <label key={field} style={{ fontSize: '0.78rem' }}>
                        {label}
                        <select
                          className="provider-select"
                          style={{ width: '100%', marginTop: '4px' }}
                          value={scorecard[field]}
                          onChange={(event) => setScorecard((prev) => ({ ...prev, [field]: Number(event.target.value) }))}
                        >
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}/5</option>)}
                        </select>
                      </label>
                    ))}
                  </div>

                  <label style={{ fontSize: '0.78rem' }}>
                    Overall recommendation
                    <select
                      className="provider-select"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={scorecard.overall_recommendation}
                      onChange={(event) => setScorecard((prev) => ({ ...prev, overall_recommendation: event.target.value }))}
                    >
                      <option value="advance">Advance</option>
                      <option value="reject">Reject</option>
                      <option value="further_review">Further Review</option>
                    </select>
                  </label>

                  <label style={{ fontSize: '0.78rem' }}>
                    Evidence notes
                    <textarea
                      rows={3}
                      className="provider-select"
                      style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
                      value={scorecard.evidence_notes}
                      onChange={(event) => setScorecard((prev) => ({ ...prev, evidence_notes: event.target.value }))}
                      placeholder="Strengths, concerns, and evidence observed in the interview."
                    />
                  </label>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    {scorecard.skill_evaluations.map((entry, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          className="provider-select"
                          style={{ flex: 2 }}
                          value={entry.skill_name}
                          placeholder="Skill (e.g. python)"
                          onChange={(event) => setScorecard((prev) => {
                            const next = [...prev.skill_evaluations];
                            next[index] = { ...next[index], skill_name: event.target.value };
                            return { ...prev, skill_evaluations: next };
                          })}
                        />
                        <select
                          className="provider-select"
                          style={{ flex: 1 }}
                          value={entry.rating}
                          onChange={(event) => setScorecard((prev) => {
                            const next = [...prev.skill_evaluations];
                            next[index] = { ...next[index], rating: Number(event.target.value) };
                            return { ...prev, skill_evaluations: next };
                          })}
                        >
                          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}/5</option>)}
                        </select>
                        {scorecard.skill_evaluations.length > 1 && (
                          <button
                            className="provider-quiet-button"
                            type="button"
                            onClick={() => setScorecard((prev) => ({ ...prev, skill_evaluations: prev.skill_evaluations.filter((_, i) => i !== index) }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="provider-quiet-button"
                      type="button"
                      onClick={() => setScorecard((prev) => ({ ...prev, skill_evaluations: [...prev.skill_evaluations, { skill_name: '', rating: 3, notes: '' }] }))}
                    >
                      <Plus size={13} /> Add skill
                    </button>
                  </div>

                  {scorecardError && <div className="provider-ai-callout" role="alert">{scorecardError}</div>}
                </>
              )}
            </div>
            <div className="modal-dialog-footer">
              <button className="provider-quiet-button" type="button" onClick={() => setScorecardModal({ open: false, interview: null })}>
                Close
              </button>
              <button
                className="provider-primary-btn"
                type="button"
                disabled={scorecardSaving || scorecardLoading}
                onClick={handleScorecardSave}
              >
                {scorecardSaving ? 'Saving…' : scorecardSaved ? 'Update scorecard' : 'Submit scorecard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-backdrop-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-dialog-card animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dialog-header">
              <h2 className="modal-dialog-title">Schedule New Interview</h2>
              <button className="modal-close-btn" type="button" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-dialog-body" style={{ display: 'grid', gap: '12px' }}>
              <label style={{ fontSize: '0.78rem' }}>
                Internship
                <select
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={selectedInternshipId}
                  onChange={(event) => setSelectedInternshipId(event.target.value)}
                >
                  <option value="">Select internship</option>
                  {(internships || []).map((internship) => (
                    <option key={internship.id} value={internship.id}>{internship.title}</option>
                  ))}
                </select>
              </label>

              {selectedInternshipId && (
                <>
                  <label style={{ fontSize: '0.78rem' }}>
                    Candidate
                    <input
                      className="provider-select"
                      style={{ width: '100%', marginTop: '4px' }}
                      value={candidateSearch}
                      onChange={(event) => setCandidateSearch(event.target.value)}
                      placeholder="Search by name, email, or application id"
                    />
                  </label>

                  <select
                    className="provider-select"
                    style={{ width: '100%' }}
                    value={selectedCandidateId}
                    onChange={(event) => setSelectedCandidateId(event.target.value)}
                  >
                    <option value="">Select eligible candidate</option>
                    {filteredCandidates.map((candidate) => (
                      <option key={candidate.application_id} value={candidate.application_id}>
                        {candidate.candidate_name} • {candidate.candidate_email}
                      </option>
                    ))}
                  </select>

                  {!filteredCandidates.length && (
                    <div className="provider-status-pill warning" style={{ display: 'inline-flex', width: 'fit-content' }}>
                      No interview-eligible candidates in this internship.
                    </div>
                  )}
                </>
              )}

              <label style={{ fontSize: '0.78rem' }}>
                Date & Time
                <input
                  type="datetime-local"
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={scheduleForm.scheduled_at}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, scheduled_at: event.target.value }))}
                />
              </label>

              <label style={{ fontSize: '0.78rem' }}>
                Duration (minutes)
                <input
                  type="number"
                  min="15"
                  max="180"
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={scheduleForm.duration_minutes}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, duration_minutes: Number(event.target.value) || 30 }))}
                />
              </label>

              <label style={{ fontSize: '0.78rem' }}>
                Meeting Link
                <input
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={scheduleForm.meeting_link}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, meeting_link: event.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <label style={{ fontSize: '0.78rem' }}>
                Notes
                <textarea
                  rows={3}
                  className="provider-select"
                  style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
                  value={scheduleForm.notes}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Optional interview notes"
                />
              </label>

              {formError && <div className="provider-ai-callout" role="alert">{formError}</div>}
            </div>
            <div className="modal-dialog-footer">
              <button className="provider-quiet-button" type="button" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button
                className="provider-primary-btn"
                type="button"
                disabled={isSaving || !selectedCandidateId || !selectedInternshipId || !scheduleForm.scheduled_at}
                onClick={handleSchedule}
              >
                {isSaving ? 'Scheduling...' : 'Schedule Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Assessments() {
  const [assessments, setAssessments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const loadAssessments = () => {
    setIsLoading(true);
    setError('');
    fetchAssessments()
      .then((items) => setAssessments(items))
      .catch((requestError) => setError(requestError?.message || 'Could not load assessments.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadAssessments);
  }, []);

  const filtered = assessments.filter((a) => !query || (a.title || '').toLowerCase().includes(query.toLowerCase()));
  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalAttempts = assessments.reduce((sum, a) => sum + (a.attempt_count || 0), 0);
  const completedAttempts = assessments.reduce((sum, a) => sum + (a.completed_count || 0), 0);
  const passedAttempts = assessments.reduce((sum, a) => sum + (a.passed_count || 0), 0);
  const scoredRows = assessments.filter((a) => a.avg_score !== null && a.avg_score !== undefined);
  const avgScore = scoredRows.length
    ? `${Math.round(scoredRows.reduce((sum, a) => sum + Number(a.avg_score || 0), 0) / scoredRows.length)}%`
    : '—';
  const passRate = completedAttempts ? `${Math.round((passedAttempts / completedAttempts) * 100)}%` : '—';

  return (
    <>
      <SectionHeader
        eyebrow="Evaluation tools"
        title="Assessments"
        description="Structured technical assessments with server-side scoring and attempt tracking."
        actions={
          <button className="provider-quiet-button" type="button" onClick={loadAssessments} disabled={isLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <StatStrip
        items={[
          ['Assessments', String(assessments.length), 'Created by you'],
          ['Total attempts', String(totalAttempts), `${completedAttempts} submitted`],
          ['Average score', avgScore, 'Completed attempts'],
          ['Pass rate', passRate, `${passedAttempts} passed`],
        ]}
      />

      {error ? (
        <ErrorPanel message={error} onRetry={loadAssessments} />
      ) : isLoading ? (
        <LoadingPanel label="Loading assessments…" />
      ) : assessments.length === 0 ? (
        <EmptyPanel
          title="No assessments yet"
          message="Assessments you create for your internships will appear here with live attempt statistics."
        />
      ) : (
        <>
          <div className="provider-workspace-toolbar">
            <div className="provider-search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assessments..." />
            </div>
          </div>

          <section className="provider-workspace-panel">
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Assessment Title</th>
                    <th>Program</th>
                    <th>Questions</th>
                    <th>Attempts</th>
                    <th>Avg Score</th>
                    <th>Pass Rate</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.title}</strong></td>
                      <td>{row.internship_title || 'All programs'}</td>
                      <td>{row.question_count ?? 0}</td>
                      <td>
                        {row.attempt_count || 0}
                        <small style={{ color: '#64748b', marginLeft: '6px' }}>({row.completed_count || 0} submitted)</small>
                      </td>
                      <td><strong>{row.avg_score == null ? '—' : `${row.avg_score}%`}</strong></td>
                      <td>{row.completed_count ? `${Math.round(((row.passed_count || 0) / row.completed_count) * 100)}%` : '—'}</td>
                      <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10]}
            />
          </section>
        </>
      )}
    </>
  );
}

function Interns({ onNavigate }) {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const loadInterns = () => {
    setIsLoading(true);
    setError('');
    fetchProviderAssignments()
      .then((result) => setAssignments(result.items || []))
      .catch((requestError) => setError(requestError?.message || 'Could not load interns.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadInterns);
  }, []);

  // One row per unique intern (an intern can hold several assignments).
  const internRows = [];
  const seen = new Set();
  for (const a of assignments) {
    if (seen.has(a.intern_id)) continue;
    seen.add(a.intern_id);
    internRows.push(a);
  }

  const filtered = internRows.filter((row) => {
    const q = query.toLowerCase().trim();
    const matchesQ = !q
      || (row.intern_name || '').toLowerCase().includes(q)
      || (row.internship_title || '').toLowerCase().includes(q)
      || (row.mentor_name || '').toLowerCase().includes(q);
    const matchesS = !statusFilter || (row.status || '') === statusFilter;
    return matchesQ && matchesS;
  });

  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeCount = internRows.filter((row) => (row.status || '') === 'active').length;

  return (
    <>
      <SectionHeader
        eyebrow="Program delivery"
        title="Active Interns"
        description="Interns assigned to mentors across your internships. Open an intern for projects, tasks, and attendance."
        actions={
          <button className="provider-quiet-button" type="button" onClick={loadInterns} disabled={isLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <StatStrip
        items={[
          ['Assigned interns', String(internRows.length), 'Across your programs'],
          ['Active assignments', String(activeCount), 'Currently running'],
          ['Mentors involved', String(new Set(internRows.map((row) => row.mentor_id)).size), 'Delivering mentorship'],
        ]}
      />

      {error ? (
        <ErrorPanel message={error} onRetry={loadInterns} />
      ) : isLoading ? (
        <LoadingPanel label="Loading interns…" />
      ) : internRows.length === 0 ? (
        <EmptyPanel
          title="No interns assigned yet"
          message="Assign a mentor to an intern from an internship's Applications view — assigned interns will appear here."
        />
      ) : (
        <>
          <div className="provider-workspace-toolbar">
            <div className="provider-search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search interns, programs, mentors..." />
            </div>
            <select className="provider-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <section className="provider-workspace-panel">
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Intern</th>
                    <th>Program</th>
                    <th>Mentor</th>
                    <th>Assigned</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row) => (
                    <tr key={row.intern_id}>
                      <td>
                        <button
                          className="provider-row-link"
                          type="button"
                          onClick={() => {
                            try { sessionStorage.setItem('internflow_selected_mentee', String(row.intern_id)); } catch { /* private mode */ }
                            onNavigate('/provider-intern-details');
                          }}
                        >
                          <strong>{row.intern_name || 'Intern'}</strong>
                        </button>
                      </td>
                      <td>{row.internship_title || '—'}</td>
                      <td>{row.mentor_name || 'Unassigned'}</td>
                      <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <StatusPill tone={(row.status || '') === 'active' ? 'info' : (row.status || '') === 'completed' ? 'success' : 'neutral'}>
                          {row.status || 'unknown'}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10]}
            />
          </section>
        </>
      )}
    </>
  );
}

function Certificates() {
  const [certs, setCerts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const loadCertificates = () => {
    setIsLoading(true);
    setError('');
    fetchProviderCertificates()
      .then((items) => setCerts(items))
      .catch((requestError) => setError(requestError?.message || 'Could not load certificates.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadCertificates);
  }, []);

  const filtered = certs.filter((c) =>
    !query
    || (c.candidate_name || '').toLowerCase().includes(query.toLowerCase())
    || (c.internship_title || '').toLowerCase().includes(query.toLowerCase())
    || (c.certificate_id || '').toLowerCase().includes(query.toLowerCase()));
  const totalItems = filtered.length;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <SectionHeader
        eyebrow="Recognition"
        title="Certificates"
        description="Certificates are issued automatically when an internship outcome is completed. Verification is public via each certificate's verification link."
        actions={
          <button className="provider-quiet-button" type="button" onClick={loadCertificates} disabled={isLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <StatStrip
        items={[
          ['Certificates issued', String(certs.length), 'From completed outcomes'],
          ['Unique interns', String(new Set(certs.map((c) => c.intern_id)).size), 'Recognized'],
        ]}
      />

      {error ? (
        <ErrorPanel message={error} onRetry={loadCertificates} />
      ) : isLoading ? (
        <LoadingPanel label="Loading certificates…" />
      ) : certs.length === 0 ? (
        <EmptyPanel
          title="No certificates issued yet"
          message="When an internship outcome is completed, a verifiable certificate is generated and appears here."
        />
      ) : (
        <>
          <div className="provider-workspace-toolbar">
            <div className="provider-search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search certificates..." />
            </div>
          </div>

          <section className="provider-workspace-panel">
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Intern</th>
                    <th>Certificate ID</th>
                    <th>Program</th>
                    <th>Issued</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.candidate_name}</strong></td>
                      <td>
                        <code style={{ fontSize: '0.75rem' }}>{row.certificate_id}</code>
                      </td>
                      <td>{row.internship_title}</td>
                      <td>{row.issue_date ? new Date(row.issue_date).toLocaleDateString() : '—'}</td>
                      <td>
                        {row.verification_url
                          ? <a className="provider-row-link" href={`/verify?certificate=${encodeURIComponent(row.certificate_id)}`}><ShieldCheck size={13} style={{ verticalAlign: '-2px' }} /> Verify</a>
                          : <StatusPill tone="muted">No verification link</StatusPill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10]}
            />
          </section>
        </>
      )}
    </>
  );
}

// Honest capability map: only workflows the backend actually performs today.
// There is no scheduler/email engine in the backend, so anything not listed
// here must NOT be shown as a running automation.
const AUTOMATION_CAPABILITIES = [
  {
    id: 'ai-screening',
    label: 'AI Resume Screening',
    trigger: 'Runs when you request screening for an application',
    status: 'implemented',
    detail: 'AI evaluation runs on demand and records real scores on the application.',
    route: '/provider-screening',
  },
  {
    id: 'certificates',
    label: 'Certificate Generation',
    trigger: 'Runs when an internship outcome is completed',
    status: 'implemented',
    detail: 'A verifiable certificate with a public verification link is generated automatically.',
    route: '/provider-certificates',
  },
  {
    id: 'assessment-scoring',
    label: 'Assessment Auto-Scoring',
    trigger: 'Runs the moment a candidate submits an attempt',
    status: 'implemented',
    detail: 'Server-side scoring with skill breakdown; the frontend never fabricates scores.',
    route: '/provider-assessments',
  },
  {
    id: 'skill-evidence',
    label: 'Skill Evidence Recording',
    trigger: 'Runs after interviews and assessments',
    status: 'implemented',
    detail: 'Interview scorecards and assessment results feed each candidate\'s skill passport.',
    route: '/provider-applications',
  },
  {
    id: 'email-notifications',
    label: 'Candidate Email Notifications',
    trigger: 'Planned — status changes by email',
    status: 'not_implemented',
    detail: 'The backend does not send automated emails yet. Status changes are visible in-app only.',
  },
  {
    id: 'interview-reminders',
    label: 'Interview Reminders',
    trigger: 'Planned — reminders before interviews',
    status: 'not_implemented',
    detail: 'No scheduler exists in the backend. Candidates see interview details on their interview page.',
  },
  {
    id: 'weekly-reports',
    label: 'Weekly Reports',
    trigger: 'Planned — scheduled reporting',
    status: 'not_implemented',
    detail: 'No report scheduler exists in the backend yet.',
  },
];

function Automation({ onNavigate }) {
  return (
    <>
      <SectionHeader
        eyebrow="Workflow orchestration"
        title="Automation Center"
        description="What the platform actually automates today — and what is not implemented yet. No simulated runs, no fake toggles."
      />

      <div className="provider-automation-cards">
        {AUTOMATION_CAPABILITIES.map((rule) => {
          const implemented = rule.status === 'implemented';
          return (
            <article className="provider-automation-card" key={rule.id} style={implemented ? undefined : { opacity: 0.75 }}>
              <div className="provider-automation-card-top">
                <span className="provider-automation-icon"><Zap size={17} /></span>
                <StatusPill tone={implemented ? 'success' : 'muted'}>{implemented ? 'Implemented' : 'Not implemented'}</StatusPill>
              </div>
              <h2>{rule.label}</h2>
              <p>{rule.trigger}</p>
              <div>
                <small>Status</small>
                <strong>{rule.detail}</strong>
              </div>
              {implemented && rule.route && onNavigate && (
                <button className="provider-quiet-button" type="button" onClick={() => onNavigate(rule.route)}>
                  Open related workspace
                </button>
              )}
            </article>
          );
        })
      }
      </div>
    </>
  );
}

// ============ Provider → Mentor → Intern hierarchy (Part 2) ============
// Derived entirely from the provider-scoped assignments endpoint, so a
// mentor only appears if the provider's own internship links them.

function Mentors({ onNavigate }) {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const loadMentors = () => {
    setIsLoading(true);
    setError('');
    fetchProviderAssignments()
      .then((result) => setAssignments(result.items || []))
      .catch((requestError) => setError(requestError?.message || 'Could not load mentors.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadMentors);
  }, []);

  // Group assignments by mentor.
  const mentorMap = new Map();
  for (const a of assignments) {
    if (!mentorMap.has(a.mentor_id)) {
      mentorMap.set(a.mentor_id, { mentor_id: a.mentor_id, mentor_name: a.mentor_name, mentees: [] });
    }
    mentorMap.get(a.mentor_id).mentees.push(a);
  }
  const mentors = [...mentorMap.values()];

  const filtered = mentors.filter((m) =>
    !query
    || (m.mentor_name || '').toLowerCase().includes(query.toLowerCase())
    || m.mentees.some((a) => (a.internship_title || '').toLowerCase().includes(query.toLowerCase())));

  return (
    <>
      <SectionHeader
        eyebrow="Delivery team"
        title="Mentors"
        description="Mentors delivering your internships, with their assigned interns. Mentor identity is limited to name and assignment data."
        actions={
          <button className="provider-quiet-button" type="button" onClick={loadMentors} disabled={isLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <StatStrip
        items={[
          ['Mentors engaged', String(mentors.length), 'On your programs'],
          ['Intern assignments', String(assignments.length), 'Mentor ↔ intern links'],
          ['Active assignments', String(assignments.filter((a) => (a.status || '') === 'active').length), 'Currently running'],
        ]}
      />

      {error ? (
        <ErrorPanel message={error} onRetry={loadMentors} />
      ) : isLoading ? (
        <LoadingPanel label="Loading mentors…" />
      ) : mentors.length === 0 ? (
        <EmptyPanel
          title="No mentors assigned yet"
          message="Assign a mentor to an intern from an internship's Applications view — mentors will appear here grouped with their interns."
        />
      ) : (
        <>
          <div className="provider-workspace-toolbar">
            <div className="provider-search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mentors or programs..." />
            </div>
          </div>

          <div className="provider-automation-cards">
            {filtered.map((mentor) => (
              <article className="provider-automation-card" key={mentor.mentor_id}>
                <div className="provider-automation-card-top">
                  <span className="provider-automation-icon"><Users size={17} /></span>
                  <StatusPill tone="info">{mentor.mentees.filter((a) => (a.status || '') === 'active').length} active</StatusPill>
                </div>
                <h2>{mentor.mentor_name || 'Mentor'}</h2>
                <p>{mentor.mentees.length} assigned intern{mentor.mentees.length === 1 ? '' : 's'}</p>
                <div>
                  <small>Internships</small>
                  <strong>{[...new Set(mentor.mentees.map((a) => a.internship_title).filter(Boolean))].join(', ') || '—'}</strong>
                </div>
                <button
                  className="provider-quiet-button"
                  type="button"
                  onClick={() => {
                    try { sessionStorage.setItem('internflow_selected_mentor', String(mentor.mentor_id)); } catch { /* private mode */ }
                    onNavigate('/provider-mentor-details');
                  }}
                >
                  View mentor details
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MentorDetail({ onNavigate }) {
  const [selectedMentorId] = useState(() => {
    try { return sessionStorage.getItem('internflow_selected_mentor'); } catch { return null; }
  });
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDetail = () => {
    setIsLoading(true);
    setError('');
    fetchProviderAssignments()
      .then((result) => setAssignments(result.items || []))
      .catch((requestError) => setError(requestError?.message || 'Could not load mentor details.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadDetail);
  }, []);

  const mentor = assignments.find((a) => String(a.mentor_id) === String(selectedMentorId));
  const mentees = assignments.filter((a) => String(a.mentor_id) === String(selectedMentorId));

  if (!selectedMentorId) {
    return (
      <>
        <SectionHeader eyebrow="Delivery team" title="Mentor details" description="Select a mentor from the Mentors page to see their assigned interns." />
        <EmptyPanel title="No mentor selected" message="Open Mentors and choose “View mentor details” on a mentor card." />
      </>
    );
  }

  return (
    <>
      <div className="details-nav-row" style={{ marginBottom: '1rem' }}>
        <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-mentors')}>
          <ArrowLeft size={14} /> Back to Mentors
        </button>
      </div>

      {error ? (
        <ErrorPanel message={error} onRetry={loadDetail} />
      ) : isLoading ? (
        <LoadingPanel label="Loading mentor…" />
      ) : !mentor ? (
        <EmptyPanel title="Mentor not found" message="This mentor has no assignments under your internships." />
      ) : (
        <>
          <SectionHeader
            eyebrow="Mentor profile"
            title={mentor.mentor_name || 'Mentor'}
            description={`${mentees.length} assigned intern${mentees.length === 1 ? '' : 's'} across ${new Set(mentees.map((a) => a.internship_title)).size} program${mentees.length === 1 ? '' : 's'}.`}
          />

          <section className="provider-workspace-panel">
            <div className="provider-panel-heading">
              <div>
                <span className="provider-panel-kicker">Assigned interns</span>
                <h2>Interns under this mentor</h2>
              </div>
            </div>
            <div className="provider-table-wrap">
              <table className="provider-data-table">
                <thead>
                  <tr>
                    <th>Intern</th>
                    <th>Program</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mentees.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.intern_name || 'Intern'}</strong></td>
                      <td>{a.internship_title || '—'}</td>
                      <td>{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <StatusPill tone={(a.status || '') === 'active' ? 'info' : 'neutral'}>{a.status || 'unknown'}</StatusPill>
                      </td>
                      <td>
                        <button
                          className="provider-row-link"
                          type="button"
                          onClick={() => {
                            try { sessionStorage.setItem('internflow_selected_mentee', String(a.intern_id)); } catch { /* private mode */ }
                            onNavigate('/provider-intern-details');
                          }}
                        >
                          View intern <ChevronRight size={13} style={{ verticalAlign: '-2px' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function MenteeDetail({ onNavigate }) {
  const [selectedMenteeId] = useState(() => {
    try { return sessionStorage.getItem('internflow_selected_mentee'); } catch { return null; }
  });
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDetail = () => {
    if (!selectedMenteeId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    fetchProviderMenteeDetail(selectedMenteeId)
      .then((data) => setDetail(data))
      .catch((requestError) => setError(requestError?.message || 'Could not load intern details.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadDetail);
  }, [selectedMenteeId]);

  if (!selectedMenteeId) {
    return (
      <>
        <SectionHeader eyebrow="Program delivery" title="Intern details" description="Open an intern from Active Interns or from a mentor's profile." />
        <EmptyPanel title="No intern selected" message="Open Active Interns and choose an intern to see their assignments, projects, tasks, and attendance." />
      </>
    );
  }

  const assignment = detail?.assignments?.[0];
  const tasks = detail?.tasks || [];
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const taskProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <>
      <div className="details-nav-row" style={{ marginBottom: '1rem' }}>
        <button className="provider-quiet-button" type="button" onClick={() => onNavigate('/provider-interns')}>
          <ArrowLeft size={14} /> Back to Active Interns
        </button>
      </div>

      {error ? (
        <ErrorPanel message={error} onRetry={loadDetail} />
      ) : isLoading ? (
        <LoadingPanel label="Loading intern…" />
      ) : !detail ? (
        <EmptyPanel title="Intern not found" message="This intern could not be loaded." />
      ) : (
        <>
          <SectionHeader
            eyebrow="Intern profile"
            title={detail.intern?.full_name || 'Intern'}
            description={`${detail.intern?.email || ''}${assignment ? ` · ${assignment.internship_title || ''} · Mentor: ${assignment.mentor_name || '—'}` : ''}`}
          />

          <StatStrip
            items={[
              ['Assignment status', assignment?.status || '—', assignment?.internship_title || ''],
              ['Tasks', `${completedTasks}/${tasks.length}`, `${taskProgress}% completed`],
              ['Attendance sessions', String(detail.attendance?.sessions ?? 0), detail.attendance?.total_work_minutes ? `${Math.round(detail.attendance.total_work_minutes / 60)}h logged` : 'No hours logged yet'],
              ['Outcome', detail.outcome ? (detail.outcome.outcome_status || '—') : 'In progress', detail.outcome ? `Verified ${detail.outcome.verified_at ? new Date(detail.outcome.verified_at).toLocaleDateString() : ''}` : 'No completion record yet'],
            ]}
          />

          {detail.projects?.length > 0 && (
            <section className="provider-workspace-panel" style={{ marginBottom: '1rem' }}>
              <div className="provider-panel-heading">
                <div>
                  <span className="provider-panel-kicker">Projects</span>
                  <h2>Projects in this internship</h2>
                </div>
              </div>
              <div className="provider-table-wrap">
                <table className="provider-data-table">
                  <thead>
                    <tr><th>Project</th><th>Status</th><th>Tasks</th><th>Progress</th></tr>
                  </thead>
                  <tbody>
                    {detail.projects.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.title}</strong></td>
                        <td><StatusPill tone={p.status === 'completed' ? 'success' : 'info'}>{p.status}</StatusPill></td>
                        <td>{p.completed_tasks || 0}/{p.task_count || 0}</td>
                        <td>{p.task_count ? `${Math.round(((p.completed_tasks || 0) / p.task_count) * 100)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="provider-workspace-panel">
            <div className="provider-panel-heading">
              <div>
                <span className="provider-panel-kicker">Tasks</span>
                <h2>Assigned tasks</h2>
              </div>
            </div>
            {tasks.length === 0 ? (
              <p className="provider-body-copy">No tasks assigned yet. The mentor has not distributed tasks for this intern.</p>
            ) : (
              <div className="provider-table-wrap">
                <table className="provider-data-table">
                  <thead>
                    <tr><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th>Submission</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td><strong>{t.title}</strong></td>
                        <td><StatusPill tone={t.status === 'completed' ? 'success' : t.status === 'changes_requested' ? 'warning' : 'info'}>{t.status}</StatusPill></td>
                        <td>{t.priority}</td>
                        <td>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
                        <td>{t.submission_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Organization');
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <SectionHeader
        eyebrow="Workspace configuration"
        title="Settings"
        description="Manage organization profiles, user permissions, security, and integrations."
      />

      <div className="provider-settings-layout">
        <nav className="provider-settings-nav">
          {['Organization', 'Users', 'Integrations', 'Notifications', 'Security'].map((tab) => (
            <button
              className={activeTab === tab ? 'is-active' : ''}
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <form className="provider-workspace-panel provider-form-panel" onSubmit={handleSave}>
          <div className="provider-panel-heading">
            <div>
              <span className="provider-panel-kicker">{activeTab}</span>
              <h2>{activeTab} Configuration</h2>
            </div>
            <button className="provider-primary-btn" type="submit">
              Save Changes
            </button>
          </div>

          {saved && (
            <div className="provider-status-pill success" style={{ marginBottom: '14px', display: 'inline-flex' }}>
              <CheckCircle2 size={14} style={{ marginRight: '4px' }} /> Changes saved successfully.
            </div>
          )}

          {activeTab === 'Organization' && (
            <div className="provider-form-grid">
              <label>Company / Organization Name<input defaultValue="Acme Labs" /></label>
              <label>Official Website<input defaultValue="https://acmelabs.example.dev" /></label>
              <label className="wide">Organization Description<textarea rows="3" defaultValue="A technology organization building practical engineering and AI learning programs." /></label>
            </div>
          )}

          {activeTab === 'Users' && (
            <div style={{ padding: '12px 0' }}>
              <p className="provider-body-copy">Manage active workspace members and role authorizations.</p>
              <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid var(--provider-border)' }}>
                  <div><strong>Priya Menon</strong><small style={{ display: 'block' }}>priya.menon@acme.dev</small></div>
                  <StatusPill tone="info">Lead Mentor</StatusPill>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#fff', borderRadius: '8px', border: '1px solid var(--provider-border)' }}>
                  <div><strong>Admin User</strong><small style={{ display: 'block' }}>admin@acme.dev</small></div>
                  <StatusPill tone="success">Provider Admin</StatusPill>
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'Organization' && activeTab !== 'Users' && (
            <p className="provider-body-copy" style={{ padding: '12px 0' }}>
              {activeTab} settings configured and operating normally.
            </p>
          )}
        </form>
      </div>
    </>
  );
}

function Reports() {
  const [assignments, setAssignments] = useState([]);
  const [internships, setInternships] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = () => {
    setIsLoading(true);
    setError('');
    Promise.all([fetchProviderAssignments(), fetchInternships({ query: '', status: '' })])
      .then(([assignResult, shipResult]) => {
        setAssignments(assignResult.items || []);
        setInternships(shipResult.items || []);
      })
      .catch((requestError) => setError(requestError?.message || 'Could not load report data.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    Promise.resolve().then(loadReports);
  }, []);

  const completedAssignments = assignments.filter((a) => (a.status || '') === 'completed').length;
  const activeAssignments = assignments.filter((a) => (a.status || '') === 'active').length;
  const publishedInternships = internships.filter((i) => (i.status || '') === 'published').length;

  return (
    <>
      <SectionHeader
        eyebrow="Program insights"
        title="Reports"
        description="A live summary computed from your real program data. Scheduled/automated report generation is not available yet."
        actions={
          <button className="provider-quiet-button" type="button" onClick={loadReports} disabled={isLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error ? (
        <ErrorPanel message={error} onRetry={loadReports} />
      ) : isLoading ? (
        <LoadingPanel label="Loading report data…" />
      ) : (
        <>
          <StatStrip
            items={[
              ['Published internships', String(publishedInternships), 'Of your programs'],
              ['Active mentorships', String(activeAssignments), 'Interns in delivery'],
              ['Completed mentorships', String(completedAssignments), 'Finished assignments'],
            ]}
          />

          <section className="provider-workspace-panel">
            <div className="provider-panel-heading">
              <div>
                <span className="provider-panel-kicker">Mentorship assignments</span>
                <h2>Assignment breakdown</h2>
              </div>
            </div>
            {assignments.length === 0 ? (
              <p className="provider-body-copy">No mentor assignments yet — reports will fill in as interns are assigned to mentors.</p>
            ) : (
              <div className="provider-table-wrap">
                <table className="provider-data-table">
                  <thead>
                    <tr><th>Mentor</th><th>Intern</th><th>Program</th><th>Status</th><th>Assigned</th></tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.mentor_name || '—'}</strong></td>
                        <td>{a.intern_name || '—'}</td>
                        <td>{a.internship_title || '—'}</td>
                        <td><StatusPill tone={(a.status || '') === 'active' ? 'info' : 'success'}>{a.status || 'unknown'}</StatusPill></td>
                        <td>{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function renderWorkspace(path, onNavigate) {
  switch (path) {
    case '/provider-internships': return <InternshipList onNavigate={onNavigate} />;
    case '/provider-internship-new': return <CreateInternship onNavigate={onNavigate} />;
    case '/provider-internship-details': return <InternshipDetail onNavigate={onNavigate} />;
    case '/provider-applications': return <LiveApplications onNavigate={onNavigate} />;
    case '/provider-candidate': return <CandidateDetail onNavigate={onNavigate} />;
    case '/provider-screening': return <LiveApplications onNavigate={onNavigate} screening />;
    case '/provider-interviews': return <Interviews />;
    case '/provider-assessments': return <Assessments />;
    case '/provider-interns': return <Interns onNavigate={onNavigate} />;
    case '/provider-mentors': return <Mentors onNavigate={onNavigate} />;
    case '/provider-mentor-details': return <MentorDetail onNavigate={onNavigate} />;
    case '/provider-intern-details': return <MenteeDetail onNavigate={onNavigate} />;
    case '/provider-reports': return <Reports />;
    case '/provider-certificates': return <Certificates />;
    case '/provider-automation': return <Automation onNavigate={onNavigate} />;
    case '/provider-settings': return <SettingsPage />;
    default: return <InternshipList onNavigate={onNavigate} />;
  }
}

export default function ProviderWorkspacePage({ path, onNavigate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const session = getSession();

  const handleLogout = () => {
    clearSession();
    onNavigate('/login');
  };

  return (
    <div className="provider-app-shell provider-workspace-shell">
      <div className="provider-background-network" aria-hidden="true">
        <span className="provider-network-line provider-network-line-a" />
        <span className="provider-network-line provider-network-line-b" />
        <span className="provider-network-line provider-network-line-c" />
        <span className="provider-network-dot provider-network-dot-a" />
        <span className="provider-network-dot provider-network-dot-b" />
        <span className="provider-network-dot provider-network-dot-c" />
      </div>

      <aside className={`provider-workspace-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div>
          <a
            className="provider-brand"
            href="/provider-dashboard"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/provider-dashboard');
            }}
          >
            <img src={logoUrl} alt="InternFlow logo" className="provider-logo-img" />
            <span className="provider-brand-text">InternFlow</span>
          </a>

          <nav className="provider-nav">
            {PROVIDER_NAV.map(({ label, path: itemPath, icon: Icon }) => (
              <button
                className={`provider-nav-item ${path === itemPath ? 'is-active' : ''}`}
                type="button"
                key={itemPath}
                title={label}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate(itemPath);
                }}
              >
                <span className="provider-nav-icon"><Icon size={18} /></span>
                <span className="provider-nav-label">{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="provider-sidebar-footer">
          <button className="provider-nav-item" type="button" title="Logout" onClick={handleLogout}>
            <span className="provider-nav-icon"><LogOut size={18} /></span>
            <span className="provider-nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="provider-workspace-main">
        <header className="provider-workspace-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="provider-icon-button mobile-menu-toggle"
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              style={{ display: 'none' }}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="provider-search-field">
              <Search size={16} />
              <input placeholder="Search Provider workspace..." />
            </div>
          </div>

          <div className="provider-topbar-actions">
            <button className="provider-icon-button" type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="provider-profile-chip">
              <span className="provider-profile-avatar">
                {session?.user?.full_name?.slice(0, 2).toUpperCase() || 'AL'}
              </span>
            </div>
          </div>
        </header>

        {renderWorkspace(path, onNavigate)}
      </main>
    </div>
  );
}
