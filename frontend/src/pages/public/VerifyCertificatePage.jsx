import { useEffect, useRef, useState } from 'react';
import { ScanLine, BadgeCheck, ShieldCheck, AlertCircle, Loader, KeyRound, Globe, FileCheck } from 'lucide-react';
import { CERTIFICATE_PREVIEW, verifyCertificate } from '../../services/publicExperience';
import { usePrefersReducedMotion } from '../../hooks/useMotionHooks';
import '../../styles/VerifyCertificatePage.css';

const VERIFY_STEPS = ['Checking certificate ID...', 'Authenticating record...'];

export default function VerifyCertificatePage() {
  const [certificateId, setCertificateId] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | verifying | verified | not-found
  const [stepIndex, setStepIndex] = useState(0);
  const [record, setRecord] = useState(null);
  const reducedMotion = usePrefersReducedMotion();
  const resultRef = useRef(null);

  const preview = CERTIFICATE_PREVIEW;
  const inputInvalid = phase === 'not-found';

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!certificateId.trim() || phase === 'verifying') return;

    setPhase('verifying');
    setStepIndex(0);

    // Advance step labels while "checking"
    const stepTimer = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, VERIFY_STEPS.length - 1));
    }, 450);

    const result = await verifyCertificate(certificateId);
    window.clearInterval(stepTimer);

    if (result.ok) {
      setRecord(result.record);
      setPhase('verified');
    } else {
      setRecord(null);
      setPhase('not-found');
    }
  };

  useEffect(() => {
    if (phase === 'verified' || phase === 'not-found') {
      resultRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
  }, [phase, reducedMotion]);

  return (
    <div className={`cert-page ${phase === 'verified' ? 'is-verified' : ''}`}>
      {/* Calm verification background: blueprint grid + glow + faint scan lines (distinct from Explore) */}
      <div className="cert-bg" aria-hidden="true">
        <div className="cert-bg-blueprint" />
        <div className="cert-bg-glow" />
        <div className="cert-bg-lines"><span /><span /></div>
      </div>

      <div className="container cert-inner">
        {/* LEFT — verification panel */}
        <div className="cert-left">
          <span className="badge badge-success cert-eyebrow">
            <ShieldCheck size={13} /> Certificate Verification
          </span>
          <h1 className="cert-title">Proof of experience,<br />verified.</h1>
          <p className="cert-sub">
            Every InternFlow certificate carries a unique identity that can be verified publicly.
          </p>

          <form className="cert-form" onSubmit={handleVerify}>
            <label className="cert-label" htmlFor="cert-id">Certificate ID</label>
            <div className={`cert-input-wrap ${inputInvalid ? 'is-error' : ''} ${phase === 'verified' ? 'is-success' : ''}`}>
              <KeyRound size={17} className="cert-input-icon" />
              <input
                id="cert-id"
                type="text"
                placeholder="CERT-2026-00142"
                value={certificateId}
                onChange={(e) => { setCertificateId(e.target.value); if (phase === 'not-found') setPhase('idle'); }}
                aria-invalid={inputInvalid}
                aria-describedby="cert-input-hint"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
            <span id="cert-input-hint" className="cert-hint">
              {phase === 'not-found'
                ? 'No verified record found. Check the ID and try again.'
                : 'Enter the certificate ID exactly as printed on the certificate.'}
            </span>

            <button type="submit" className="cert-btn" disabled={phase === 'verifying' || !certificateId.trim()}>
              {phase === 'verifying' ? (
                <><Loader size={16} className="cert-btn-spinner" /> Verifying...</>
              ) : phase === 'verified' ? (
                <><BadgeCheck size={16} /> Verified — verify another</>
              ) : (
                <><ShieldCheck size={16} /> Verify Certificate</>
              )}
            </button>

            {/* Verification progress states */}
            {phase === 'verifying' && (
              <div className="cert-progress" role="status" aria-live="polite">
                {VERIFY_STEPS.map((step, i) => (
                  <span key={step} className={`cert-progress-step ${i <= stepIndex ? 'is-done' : ''}`}>
                    <span className="cert-progress-dot" /> {step}
                  </span>
                ))}
              </div>
            )}
          </form>

          {/* Verification results */}
          {phase === 'verified' && record && (
            <div className="cert-result cert-result-ok" role="status" ref={resultRef}>
              <div className="cert-result-head">
                <BadgeCheck size={18} />
                <span>Certificate Verified</span>
              </div>
              <dl className="cert-result-grid">
                <div><dt>Recipient</dt><dd>{record.recipient}</dd></div>
                <div><dt>Internship</dt><dd>{record.internship}</dd></div>
                <div><dt>Organization</dt><dd>{record.organization}</dd></div>
                <div><dt>Duration</dt><dd>{record.duration}</dd></div>
                <div><dt>Issue Date</dt><dd>{record.issueDate}</dd></div>
                <div><dt>Certificate ID</dt><dd className="cert-mono">{record.certificateId}</dd></div>
              </dl>
              <span className="cert-result-issuer">{record.issuer}</span>
            </div>
          )}

          {phase === 'not-found' && (
            <div className="cert-result cert-result-bad" role="alert" ref={resultRef}>
              <div className="cert-result-head">
                <AlertCircle size={18} />
                <span>Not Verified</span>
              </div>
              <p>The provided certificate ID could not be verified against public records.</p>
            </div>
          )}

          <p className="cert-qr-hint">
            <ScanLine size={14} /> Or scan the QR code on your certificate
          </p>

          {/* Trust indicators */}
          <ul className="cert-trust-row">
            <li><FileCheck size={13} /> Unique Certificate ID</li>
            <li><Globe size={13} /> Public Verification</li>
            <li><ShieldCheck size={13} /> Tamper-Aware Record</li>
          </ul>
        </div>

        {/* RIGHT — live certificate preview */}
        <div className="cert-right">
          <div className="cert-preview" role="img" aria-label="Preview of a verified InternFlow certificate">
            <div className="cert-preview-border" />
            <div className="cert-preview-head">
              <span className="cert-preview-logo">Intern<span>Flow</span></span>
              <span className="cert-preview-label">CERTIFICATE</span>
            </div>
            <span className="cert-preview-sub">of Completion</span>
            <h3 className="cert-preview-name">{preview.recipient}</h3>
            <p className="cert-preview-role">
              has successfully completed the internship
            </p>
            <span className="cert-preview-title">{preview.title}</span>
            <div className="cert-preview-meta">
              <div><dt>Organization</dt><dd>{preview.organization}</dd></div>
              <div><dt>Duration</dt><dd>{preview.duration}</dd></div>
              <div><dt>Issue Date</dt><dd>{preview.issueDate}</dd></div>
            </div>
            <div className="cert-preview-foot">
              <span className="cert-preview-id cert-mono">ID: {preview.certificateId}</span>
              <div className="cert-preview-qr" aria-hidden="true">
                <div className="cert-qr-pattern">
                  {Array.from({ length: 25 }, (_, i) => (
                    <span key={i} className={`cert-qr-cell ${(i * 7 + 3) % 3 === 0 ? 'on' : ''}`} />
                  ))}
                </div>
                <span className="cert-qr-scanline" />
              </div>
            </div>
            <div className="cert-preview-verified">
              <BadgeCheck size={15} /> VERIFIED
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
