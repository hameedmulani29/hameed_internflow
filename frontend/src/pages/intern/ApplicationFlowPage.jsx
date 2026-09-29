import { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  GraduationCap,
  Wrench,
  FolderGit2,
  Globe,
  Upload,
  FileText,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Send,
  AlertCircle,
  Trash2,
  Plus
} from 'lucide-react';
import { getSession, submitApplication } from '../../services/publicExperience';
import { fetchLiveInternships } from '../../services/internService';
import '../../styles/InternWorkspace.css';

export default function ApplicationFlowPage({ internshipId, onNavigate }) {
  const session = getSession('intern');
  const [internship, setInternship] = useState(null);
  const [isLoadingInternship, setIsLoadingInternship] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState({});

  // Form State — pre-filled only from the real session, never from fake personas.
  const [personalDetails, setPersonalDetails] = useState({
    fullName: session?.user?.full_name || '',
    email: session?.user?.email || '',
    phone: '',
    education: ''
  });

  // The candidate declares their own skills — none are invented for them.
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');

  const [projects, setProjects] = useState([]);
  const [newProject, setNewProject] = useState({ name: '', description: '', link: '' });

  const [links, setLinks] = useState({
    portfolio: '',
    github: '',
    linkedin: ''
  });

  const [resume, setResume] = useState({
    fileName: '',
    fileSize: '',
    uploadedAt: ''
  });

  // Load the live internship from the backend catalog.
  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      setIsLoadingInternship(true);
      return fetchLiveInternships();
    })
      .then((items) => {
        if (!isMounted) return;
        const found = items.find((item) => String(item.id) === String(internshipId));
        setInternship(found || null);
        setLoadError(found ? '' : 'This internship is no longer available.');
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setLoadError(requestError?.message || 'Could not load this internship.');
        setInternship(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingInternship(false);
      });
    return () => {
      isMounted = false;
    };
  }, [internshipId]);

  // Skill management
  const handleAddSkill = (e) => {
    e.preventDefault();
    if (skillInput.trim() && !skills.includes(skillInput.trim())) {
      const updated = [...skills, skillInput.trim()];
      setSkills(updated);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  // Project management
  const handleAddProject = (e) => {
    e.preventDefault();
    if (newProject.name.trim() && newProject.description.trim()) {
      setProjects([...projects, newProject]);
      setNewProject({ name: '', description: '', link: '' });
    }
  };

  const handleRemoveProject = (index) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  // Resume Upload Handler (Mock file reader for real client-side validation)
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrors({ ...errors, resume: 'File size must be less than 10MB.' });
        return;
      }
      setResume({
        fileName: file.name,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadedAt: new Date().toLocaleDateString()
      });
      setErrors({ ...errors, resume: null });
    }
  };

  // Step Validation
  const validateStep = (step) => {
    const errs = {};
    if (step === 1) {
      if (!personalDetails.fullName.trim()) errs.fullName = 'Full Name is required.';
      if (!personalDetails.email.trim()) errs.email = 'Email address is required.';
      if (!personalDetails.phone.trim()) errs.phone = 'Phone number is required.';
      if (!personalDetails.education.trim()) errs.education = 'Education details are required.';
    } else if (step === 2) {
      if (skills.length === 0) errs.skills = 'Please add at least one relevant skill.';
    } else if (step === 3) {
      if (!resume || !resume.fileName) errs.resume = 'Please upload your resume (PDF/DOCX).';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submission — the backend is the source of truth. On failure the form
  // state is preserved so nothing the candidate typed is lost.
  const handleSubmitApplication = async () => {
    if (!internship) return;
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    const constructedResumeText = `
Candidate Name: ${personalDetails.fullName}
Email: ${personalDetails.email}
Phone: ${personalDetails.phone}
Education: ${personalDetails.education}

Skills: ${skills.join(', ')}

Projects:
${projects.map((p) => `- ${p.name}: ${p.description} (${p.link})`).join('\n')}

Links: Portfolio: ${links.portfolio}, GitHub: ${links.github}, LinkedIn: ${links.linkedin}

Submitted Resume: ${resume.fileName} (${resume.fileSize})
    `.trim();

    const rawId = parseInt(String(internship.id), 10);
    if (Number.isNaN(rawId) || rawId <= 0) {
      setSubmitError('Invalid internship reference. Please reopen this page from the explorer.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await submitApplication({
        internship_id: rawId,
        resume_text: constructedResumeText,
        resume_file_name: resume.fileName || 'candidate_resume.pdf',
        resume_mime_type: 'application/pdf',
      });
      if (res && res.id) {
        onNavigate(`/intern/applications/app-${res.id}/submitted`);
      } else {
        setSubmitError('The application could not be completed. Please try again.');
      }
    } catch (requestError) {
      setSubmitError(requestError?.message || 'Could not submit your application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingInternship) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <div className="skeleton-line" style={{ width: '45%' }} />
          <div className="skeleton-line" style={{ width: '65%' }} />
          <p>Preparing your application…</p>
        </div>
      </div>
    );
  }

  if (!internship) {
    return (
      <div className="intern-page-container container">
        <div className="details-nav-row animate-fade-in">
          <button className="btn-back-link" onClick={() => onNavigate('/intern/explore')}>
            <ArrowLeft size={16} />
            <span>Back to Explore</span>
          </button>
        </div>
        <div className="glass-card empty-state-card animate-fade-in">
          <AlertCircle size={40} className="empty-icon text-cyan" />
          <h3>Internship unavailable</h3>
          <p>{loadError || 'This internship could not be found. It may have been closed by the provider.'}</p>
          <button className="btn btn-primary glass-btn-primary" onClick={() => onNavigate('/intern/explore')}>
            <span>Explore Internships</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="intern-page-container container">
      {/* Header Info */}
      <div className="flow-header-row animate-fade-in">
        <div>
          <button className="btn-back-link" onClick={() => onNavigate(`/intern/internships/${internship.id}`)}>
            <ArrowLeft size={16} />
            <span>Back to Internship Details</span>
          </button>
          <h1 className="page-title">Application Form</h1>
          <p className="page-subtitle">
            Applying for <strong>{internship.title}</strong> at <strong>{internship.company}</strong>
          </p>
        </div>
      </div>

      {/* Candidate Account Warning if not signed in as Intern */}
      {(!session || session?.user?.role !== 'intern') && (
        <div className="glass-card animate-fade-in" style={{ padding: '18px 22px', marginBottom: '20px', borderLeft: '4px solid var(--accent-cyan, #06b6d4)', background: 'rgba(6, 182, 212, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <AlertCircle size={22} className="text-cyan" />
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: '0.95rem' }}>Candidate Account Required</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.84rem', opacity: 0.9 }}>
                Applying for internships requires a Candidate/Intern account. Please log in or create a Candidate account to submit your application.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => onNavigate('/login')}>
                Sign In
              </button>
              <button type="button" className="btn btn-sm btn-primary glass-btn-primary" onClick={() => onNavigate('/register')}>
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-Step Progress Indicator */}
      <div className="glass-card flow-stepper-card">
        {[
          { step: 1, label: '1. Personal Details', icon: User },
          { step: 2, label: '2. Skills & Projects', icon: Wrench },
          { step: 3, label: '3. Resume Upload', icon: Upload },
          { step: 4, label: '4. Final Review', icon: Send }
        ].map((s) => {
          const IconComp = s.icon;
          const isDone = currentStep > s.step;
          const isCurrent = currentStep === s.step;
          return (
            <div key={s.step} className={`stepper-step ${isCurrent ? 'active' : isDone ? 'completed' : ''}`}>
              <div className="step-circle">
                {isDone ? <CheckCircle2 size={16} /> : <IconComp size={16} />}
              </div>
              <span className="step-label">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Step Content Card */}
      <div className="glass-card flow-form-card">
        {/* STEP 1: Personal Details */}
        {currentStep === 1 && (
          <div className="flow-step-body animate-fade-in">
            <h2 className="form-step-heading">Step 1 — Personal & Education Details</h2>

            <div className="form-group">
              <label className="form-label">
                <User size={14} /> Full Name <span className="req">*</span>
              </label>
              <input
                type="text"
                className={`form-input ${errors.fullName ? 'input-error' : ''}`}
                value={personalDetails.fullName}
                onChange={(e) => setPersonalDetails({ ...personalDetails, fullName: e.target.value })}
                placeholder="e.g. Aisha Patel"
              />
              {errors.fullName && <span className="error-text">{errors.fullName}</span>}
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  <Mail size={14} /> Email Address <span className="req">*</span>
                </label>
                <input
                  type="email"
                  className={`form-input ${errors.email ? 'input-error' : ''}`}
                  value={personalDetails.email}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, email: e.target.value })}
                  placeholder="name@example.com"
                />
                {errors.email && <span className="error-text">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">
                  <Phone size={14} /> Phone Number <span className="req">*</span>
                </label>
                <input
                  type="tel"
                  className={`form-input ${errors.phone ? 'input-error' : ''}`}
                  value={personalDetails.phone}
                  onChange={(e) => setPersonalDetails({ ...personalDetails, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
                {errors.phone && <span className="error-text">{errors.phone}</span>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                <GraduationCap size={14} /> Education & Degree Details <span className="req">*</span>
              </label>
              <input
                type="text"
                className={`form-input ${errors.education ? 'input-error' : ''}`}
                value={personalDetails.education}
                onChange={(e) => setPersonalDetails({ ...personalDetails, education: e.target.value })}
                placeholder="Degree, Field of Study, Institution, Graduation Year"
              />
              {errors.education && <span className="error-text">{errors.education}</span>}
            </div>
          </div>
        )}

        {/* STEP 2: Skills + Projects + Links */}
        {currentStep === 2 && (
          <div className="flow-step-body animate-fade-in">
            <h2 className="form-step-heading">Step 2 — Skills, Projects & Links</h2>

            {/* Skills Tag Input */}
            <div className="form-group">
              <label className="form-label">
                <Wrench size={14} /> Core Skills <span className="req">*</span>
              </label>
              <div className="skills-tag-input-box">
                <div className="skills-chips-wrapper">
                  {skills.map((skill) => (
                    <span key={skill} className="skill-tag">
                      {skill}
                      <button type="button" onClick={() => handleRemoveSkill(skill)}>
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className="add-skill-row">
                  <input
                    type="text"
                    className="form-input-sm"
                    placeholder="Add a skill (e.g. Python, React, FastAPI)..."
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                  />
                  <button className="btn btn-subtle btn-sm" onClick={handleAddSkill}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
              {errors.skills && <span className="error-text">{errors.skills}</span>}
            </div>

            {/* Projects List */}
            <div className="form-group">
              <label className="form-label">
                <FolderGit2 size={14} /> Projects & Demonstrations
              </label>
              {projects.map((proj, idx) => (
                <div key={idx} className="project-item-card">
                  <div className="proj-info">
                    <strong>{proj.name}</strong>
                    <p>{proj.description}</p>
                    {proj.link && <a href={proj.link} target="_blank" rel="noreferrer" className="proj-link">{proj.link}</a>}
                  </div>
                  <button className="btn-icon-danger" onClick={() => handleRemoveProject(idx)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {/* Add New Project Sub-form */}
              <div className="add-project-subform">
                <h4 className="subform-title">Add Project</h4>
                <div className="form-grid-2">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Project Name"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Project Repository or Demo Link"
                    value={newProject.link}
                    onChange={(e) => setNewProject({ ...newProject, link: e.target.value })}
                  />
                </div>
                <textarea
                  className="form-input textarea-sm"
                  placeholder="Brief description of tech stack & architecture"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                />
                <button className="btn btn-outline btn-sm" onClick={handleAddProject}>
                  <Plus size={14} /> Add Project
                </button>
              </div>
            </div>

            {/* Portfolio Links */}
            <div className="form-group">
              <label className="form-label">
                <Globe size={14} /> Professional Links
              </label>
              <div className="form-grid-3">
                <input
                  type="url"
                  className="form-input"
                  placeholder="GitHub URL"
                  value={links.github}
                  onChange={(e) => setLinks({ ...links, github: e.target.value })}
                />
                <input
                  type="url"
                  className="form-input"
                  placeholder="LinkedIn URL"
                  value={links.linkedin}
                  onChange={(e) => setLinks({ ...links, linkedin: e.target.value })}
                />
                <input
                  type="url"
                  className="form-input"
                  placeholder="Portfolio / Website URL"
                  value={links.portfolio}
                  onChange={(e) => setLinks({ ...links, portfolio: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Resume Upload */}
        {currentStep === 3 && (
          <div className="flow-step-body animate-fade-in">
            <h2 className="form-step-heading">Step 3 — Resume Upload & Preview</h2>

            <div className="resume-dropzone-container">
              <input
                type="file"
                id="resume-upload-input"
                accept=".pdf,.docx,.doc"
                onChange={handleFileChange}
                className="hidden-file-input"
              />
              <label htmlFor="resume-upload-input" className="resume-dropzone">
                <Upload size={36} className="dropzone-icon" />
                <span className="dropzone-title">Click to upload or drag & drop your resume</span>
                <span className="dropzone-sub">Supported formats: PDF, DOCX (Max size: 10MB)</span>
              </label>
            </div>
            {errors.resume && <span className="error-text">{errors.resume}</span>}

            {resume && (
              <div className="resume-preview-card">
                <FileText size={28} className="resume-icon" />
                <div className="resume-details">
                  <span className="resume-filename">{resume.fileName}</span>
                  <span className="resume-meta">Size: {resume.fileSize} • Uploaded: {resume.uploadedAt}</span>
                </div>
                <span className="badge badge-success">Ready</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review */}
        {currentStep === 4 && (
          <div className="flow-step-body animate-fade-in">
            <h2 className="form-step-heading">Step 4 — Verify Application Before Submitting</h2>

            <div className="review-summary-box">
              {/* Personal Details Summary */}
              <div className="review-section">
                <div className="review-section-header">
                  <h3>Personal Details</h3>
                  <button className="btn-link-sm" onClick={() => setCurrentStep(1)}>Edit</button>
                </div>
                <div className="review-grid-2">
                  <p><strong>Name:</strong> {personalDetails.fullName}</p>
                  <p><strong>Email:</strong> {personalDetails.email}</p>
                  <p><strong>Phone:</strong> {personalDetails.phone}</p>
                  <p><strong>Education:</strong> {personalDetails.education}</p>
                </div>
              </div>

              {/* Skills & Projects Summary */}
              <div className="review-section">
                <div className="review-section-header">
                  <h3>Skills & Projects</h3>
                  <button className="btn-link-sm" onClick={() => setCurrentStep(2)}>Edit</button>
                </div>
                <p><strong>Skills:</strong> {skills.join(', ')}</p>
                <div className="review-projects-list">
                  {projects.map((p, idx) => (
                    <div key={idx} className="review-proj">
                      <strong>{p.name}</strong> — {p.description}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resume Summary */}
              <div className="review-section">
                <div className="review-section-header">
                  <h3>Resume File</h3>
                  <button className="btn-link-sm" onClick={() => setCurrentStep(3)}>Edit</button>
                </div>
                <p><strong>File:</strong> {resume.fileName} ({resume.fileSize})</p>
              </div>
            </div>
          </div>
        )}

        {/* Submission errors keep all entered data intact for retry */}
        {submitError && (
          <p className="error-text" role="alert" style={{ marginTop: '1rem', display: 'block' }}>
            {submitError}
          </p>
        )}

        {/* Step Navigation Bar */}
        <div className="flow-actions-bar">
          {currentStep > 1 && (
            <button className="btn btn-outline" onClick={handlePrevStep}>
              <ArrowLeft size={16} />
              <span>Previous</span>
            </button>
          )}

          {currentStep < 4 ? (
            <button className="btn btn-primary glass-btn-primary ml-auto" onClick={handleNextStep}>
              <span>Next Step</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary glass-btn-primary ml-auto" onClick={handleSubmitApplication} disabled={isSubmitting}>
              <Send size={16} />
              <span>{isSubmitting ? 'Submitting…' : 'Submit Application'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
