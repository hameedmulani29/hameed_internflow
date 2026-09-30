import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Sparkles, X, ShieldCheck, Globe, Lock, Award, CheckCircle2, RefreshCw, AlertCircle, Download, Eye } from 'lucide-react';
import { fetchMySkills, updateMySkills } from '../../services/skillService';
import { fetchMySkillPassport, togglePassportVisibility, fetchMyEvidence, fetchMyCertificates, downloadCertificateFile, viewCertificateFile } from '../../services/phase20Service';
import '../../styles/MySkillsPage.css';

export default function MySkillsPage() {
  const [skills, setSkills] = useState([]);
  const [passport, setPassport] = useState(null);
  const [evidenceList, setEvidenceList] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isToggling, setIsToggling] = useState(false);

  // Declared-skills editor state
  const [declared, setDeclared] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const declaredDirtyRef = useRef(false);

  const loadAll = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const skillData = await fetchMySkills();
      setSkills(Array.isArray(skillData?.items) ? skillData.items : []);

      const passData = await fetchMySkillPassport();
      setPassport(passData);

      const evData = await fetchMyEvidence();
      setEvidenceList(evData);

      const certs = await fetchMyCertificates();
      setCertificates(certs);
    } catch (requestError) {
      setLoadError(requestError?.message || 'Unable to load your skills and passport.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadAll);
  }, []);

  // Re-seed the declared-skills editor only while the user has no local edits,
  // so a background refetch never clobbers what they are typing.
  useEffect(() => {
    if (declaredDirtyRef.current) return;
    setDeclared(skills.filter((s) => s.source === 'candidate_profile').map((s) => s.name));
  }, [skills]);

  const declaredSet = new Set(declared.map((s) => s.toLowerCase()));

  const addSkill = () => {
    declaredDirtyRef.current = true;
    const name = skillInput.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (declaredSet.has(name.toLowerCase())) {
      setSaveError(`"${name}" is already in your list.`);
      return;
    }
    setSaveError('');
    setDeclared((prev) => [...prev, name]);
    setSkillInput('');
  };

  const removeSkill = (name) => {
    declaredDirtyRef.current = true;
    setSaveError('');
    setDeclared((prev) => prev.filter((s) => s.toLowerCase() !== name.toLowerCase()));
  };

  const hasEdits = () => {
    const before = skills
      .filter((s) => s.source === 'candidate_profile')
      .map((s) => s.name)
      .sort()
      .join('|')
      .toLowerCase();
    const after = [...declared].sort().join('|').toLowerCase();
    return before !== after;
  };

  const saveSkills = () => {
    if (!hasEdits() || isSaving) return;
    setIsSaving(true);
    setSaveError('');
    updateMySkills([...declared].sort())
      .then((data) => {
        setSkills(Array.isArray(data?.items) ? data.items : []);
        setSavedAt(new Date());
        declaredDirtyRef.current = false;
      })
      .catch((requestError) => {
        setSaveError(requestError?.message || 'Could not save your skills. Please try again.');
      })
      .finally(() => setIsSaving(false));
  };

  const handleTogglePassportPublic = async () => {
    if (!passport || isToggling) return;
    setIsToggling(true);
    try {
      const nextPublic = !passport.passport.is_public;
      await togglePassportVisibility(nextPublic);
      await loadAll();
    } catch (err) {
      setSaveError(err?.message || 'Could not update passport visibility.');
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card my-skills-card">
          <div className="my-skills-skeleton">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-w60" />
            <div className="skeleton-line skeleton-w40" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <AlertCircle size={40} className="empty-icon text-cyan" />
          <h3>Could not load your skill passport</h3>
          <p>{loadError}</p>
          <button className="btn btn-primary glass-btn-primary" onClick={loadAll}>
            <RefreshCw size={16} />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  const verifiedSkills = passport?.verified_skills || [];
  const publicCode = passport?.passport?.passport_code;
  const isPublic = Boolean(passport?.passport?.is_public);

  return (
    <div className="intern-page-container container animate-fade-in">
      <div className="intern-glass-hero">
        <span className="hero-badge"><ShieldCheck size={12} /> Skill Passport & Evidence</span>
        <h1 className="hero-title">Skill Passport & Evidence</h1>
        <p className="hero-subtitle">
          Every skill you build on InternFlow is backed by real server evidence — assessments, tasks,
          interviews, and mentor evaluations. Your Skill Passport is your verified record.
        </p>
      </div>

      {/* ISSUED CERTIFICATES CARD */}
      {certificates && certificates.length > 0 && (
        <div className="glass-card my-skills-card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))', border: '1px solid rgba(14, 165, 233, 0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Award size={26} className="text-cyan" />
              <div>
                <h2 className="section-heading" style={{ margin: 0, color: '#fff' }}>Issued Internship Certificates</h2>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Official Verified Proof of Completion</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {certificates.map((cert) => (
              <div key={cert.id} style={{ background: 'rgba(30, 41, 59, 0.7)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span className="badge badge-success"><CheckCircle2 size={12} /> Verified Certificate</span>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>ID: <strong className="cert-mono" style={{ color: '#38bdf8' }}>{cert.certificate_id}</strong></span>
                </div>

                <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: '6px 0 2px', fontWeight: 700 }}>{cert.internship_title}</h3>
                <p style={{ fontSize: '0.88rem', color: '#38bdf8', margin: '0 0 10px', fontWeight: 600 }}>{cert.provider_name}</p>

                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '14px', display: 'flex', gap: '16px' }}>
                  <span><strong>Recipient:</strong> {cert.candidate_name}</span>
                  <span><strong>Issued:</strong> {cert.issue_date?.split('T')[0] || cert.issue_date}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    onClick={() => viewCertificateFile(cert.certificate_id)}
                  >
                    <Eye size={14} /> View Certificate
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary glass-btn-primary"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    onClick={() => downloadCertificateFile(cert.certificate_id)}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                    onClick={() => window.open(`/verify?id=${encodeURIComponent(cert.certificate_id)}`, '_blank')}
                  >
                    <ShieldCheck size={14} /> Verify
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SKILL PASSPORT CARD */}
      <div className="glass-card my-skills-card" style={{ marginBottom: '1.5rem', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={22} className="text-cyan" />
              <h2 className="section-heading" style={{ margin: 0 }}>Verified Skill Passport</h2>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Code: <strong className="cert-mono">{publicCode || 'SP-2026-PENDING'}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className={`btn ${isPublic ? 'btn-primary glass-btn-primary' : 'btn-outline'}`}
              onClick={handleTogglePassportPublic}
              disabled={isToggling}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              {isToggling ? <Loader2 size={14} className="spin" /> : isPublic ? <Globe size={14} /> : <Lock size={14} />}
              {isPublic ? 'Passport Public ✓' : 'Make Passport Public'}
            </button>
          </div>
        </div>

        {savedAt && (
          <div className="provider-status-pill success" role="status" style={{ display: 'inline-flex', marginBottom: '0.75rem' }}>
            <CheckCircle2 size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
            Skills saved at {savedAt.toLocaleTimeString()}
          </div>
        )}

        {verifiedSkills.length === 0 ? (
          <div className="my-skills-empty">
            <Sparkles size={24} className="text-cyan" />
            <p>
              No verified skills on record yet. Complete assigned assessments or receive mentor observations to verify your skills.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px', marginTop: '1rem' }}>
            {verifiedSkills.map((vs) => (
              <div key={vs.skill_id} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{vs.skill_name}</span>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}><CheckCircle2 size={10} /> Verified</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '4px 0 8px' }}>{vs.verification_rule}</p>
                {vs.evidence?.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <strong>Supporting Evidence ({vs.evidence.length}):</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '14px' }}>
                      {vs.evidence.slice(0, 2).map((ev, i) => (
                        <li key={i}>{ev.title} ({ev.score ? `${ev.score}%` : ev.level})</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DECLARED SKILLS CARD */}
      <div className="glass-card my-skills-card" style={{ marginBottom: '1.5rem' }}>
        <div className="my-skills-section-head">
          <h2 className="section-heading">Declared Skills</h2>
          <span className="my-skills-count">{declared.length} declared</span>
        </div>
        <p className="my-skills-hint">
          Skills you declare on your profile. These feed internship matching algorithms — add what you can stand behind.
        </p>

        <div className="skills-tag-input-box">
          <div className="skills-chips-wrapper">
            {declared.map((skill) => (
              <span key={skill} className="skill-chip declared removable">
                {skill}
                <button
                  type="button"
                  className="chip-remove-btn"
                  onClick={() => removeSkill(skill)}
                  disabled={isSaving}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="skill-add-row">
            <input
              type="text"
              className="skill-input"
              placeholder="e.g. Python, FastAPI, SQL…"
              value={skillInput}
              maxLength={60}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill();
                }
              }}
            />
            <button type="button" className="btn glass-btn-secondary" onClick={addSkill} disabled={isSaving}>
              <Plus size={15} /> Add
            </button>
          </div>
        </div>

        {saveError && <p className="my-skills-alert error">{saveError}</p>}

        <div className="my-skills-actions">
          <button
            type="button"
            className="btn btn-primary glass-btn-primary"
            onClick={saveSkills}
            disabled={isSaving || !hasEdits()}
          >
            {isSaving ? <Loader2 size={16} className="spin" /> : 'Save Skills'}
          </button>
        </div>
      </div>

      {/* EVIDENCE LOG CARD */}
      <div className="glass-card my-skills-card">
        <div className="my-skills-section-head">
          <h2 className="section-heading">Evidence Log</h2>
          <span className="my-skills-count">{evidenceList.length} evidence records</span>
        </div>
        {evidenceList.length === 0 ? (
          <div className="my-skills-empty">
            <Sparkles size={22} />
            <p>
              No evidence records yet. When you complete assessments, interviews, or tasks, evidence entries are recorded here automatically.
            </p>
          </div>
        ) : (
          <div className="evidence-skills-grid">
            {evidenceList.map((item) => (
              <div key={item.id} className="evidence-skill-row">
                <div className="evidence-skill-main">
                  <span className="skill-chip observed">{item.skill_name}</span>
                  <span className="evidence-source" style={{ fontWeight: 600 }}>{item.title}</span>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{item.details}</span>
                </div>
                <span className="evidence-date">{new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
