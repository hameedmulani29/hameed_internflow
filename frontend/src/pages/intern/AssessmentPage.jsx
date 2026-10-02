import { useState, useEffect, useRef } from 'react';
import {
  BrainCircuit,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Award,
  Loader2,
  Clock3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { fetchMyApplication, fetchMyApplications } from '../../services/internService';
import {
  getAvailableAssessment,
  fetchAssessmentDetail,
  startAssessmentAttempt,
  submitAssessmentAttempt,
  fetchAssessmentAttemptResult
} from '../../services/phase20Service';
import '../../styles/InternWorkspace.css';

function getDraftKey(attemptId) {
  return `internflow_assessment_responses_${attemptId}`;
}

function getSavedResponses(attemptId) {
  if (!attemptId) return {};
  try {
    const raw = localStorage.getItem(getDraftKey(attemptId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function AssessmentPage({ applicationId, onNavigate }) {
  const [app, setApp] = useState(null);
  const [assessmentData, setAssessmentData] = useState(null);
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState({});
  const [completedResult, setCompletedResult] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [questionCount, setQuestionCount] = useState(null);
  const autoSubmitRef = useRef(false);

  const durationMinutes = Number(assessmentData?.duration_minutes ?? assessmentData?.duration ?? 0) || 0;
  const currentQuestion = questions[currentQuestionIndex] || null;
  const answeredCount = Object.values(responses).filter((value) => String(value ?? '').trim() !== '').length;

  const persistResponses = (nextAttemptId, nextResponses) => {
    if (!nextAttemptId) return;
    try {
      localStorage.setItem(getDraftKey(nextAttemptId), JSON.stringify(nextResponses));
    } catch {
      // Ignore draft persistence errors while keeping the live in-memory state.
    }
  };

  const loadAttemptQuestions = async (assessmentId, appId) => {
    const res = await startAssessmentAttempt(assessmentId, appId);
    const loadedQuestions = res.questions || [];
    setAttemptId(res.attempt_id);
    // Server-derived remaining time: reloading the page resumes the backend's
    // attempt clock instead of restarting a local countdown.
    setRemainingSeconds(typeof res.remaining_seconds === 'number' ? res.remaining_seconds : null);
    setQuestionCount(loadedQuestions.length);
    setQuestions(loadedQuestions);
    setCurrentQuestionIndex(0);

    const saved = getSavedResponses(res.attempt_id);
    if (Object.keys(saved).length > 0) {
      setResponses(saved);
    } else {
      setResponses({});
    }
  };

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    autoSubmitRef.current = false;
    try {
      let targetId = applicationId;
      if (!targetId || targetId === 'null' || targetId === 'undefined') {
        const apps = await fetchMyApplications();
        if (Array.isArray(apps) && apps.length > 0) {
          targetId = apps[0].id;
        } else {
          setApp(null);
          setIsLoading(false);
          return;
        }
      }

      const appData = await fetchMyApplication(targetId);
      setApp(appData);

      const avail = await getAvailableAssessment(targetId);
      setAssessmentData(avail.assessment);

      if (avail.assessment?.id) {
        // Real question count for the instructions screen (no attempt created).
        try {
          const detail = await fetchAssessmentDetail(avail.assessment.id);
          setQuestionCount(Array.isArray(detail.questions) ? detail.questions.length : null);
        } catch {
          setQuestionCount(null);
        }
      }

      if (avail.existing_attempt) {
        if (avail.existing_attempt.status === 'completed') {
          const res = await fetchAssessmentAttemptResult(avail.existing_attempt.id);
          setCompletedResult(res);
          setQuestions([]);
          setResponses({});
          setAttemptId(avail.existing_attempt.id);
          return;
        }

        if (avail.existing_attempt.status === 'in_progress') {
          // Resume the existing attempt: reload server-derived remaining time
          // so a refresh can never reset or extend the attempt clock.
          const res = await startAssessmentAttempt(avail.assessment.id, targetId);
          const loadedQuestions = res.questions || [];
          // Restore the local draft BEFORE committing attemptId, otherwise the
          // persistence effect would overwrite the draft with empty responses.
          const saved = getSavedResponses(avail.existing_attempt.id);
          setResponses(saved && Object.keys(saved).length ? saved : {});
          setAttemptId(res.attempt_id);
          setRemainingSeconds(typeof res.remaining_seconds === 'number' ? res.remaining_seconds : null);
          setQuestions(loadedQuestions);
          setCurrentQuestionIndex(0);
          return;
        }
      }

      setQuestions([]);
      setResponses({});
      setCompletedResult(null);
    } catch (err) {
      setError(err?.message || 'Could not load assessment details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(loadAll);
  }, [applicationId]);

  useEffect(() => {
    if (!attemptId) return;
    persistResponses(attemptId, responses);
  }, [attemptId, responses]);

  // Countdown starts only from the server-provided remaining time (set when
  // the attempt loads/resumes). It is never re-seeded from the frontend, so a
  // refresh cannot grant extra time.
  useEffect(() => {
    if (!attemptId || completedResult) return undefined;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        const next = Math.max(0, prev - 1);
        if (next === 0 && !autoSubmitRef.current) {
          autoSubmitRef.current = true;
          handleSubmit(true);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [attemptId, completedResult]);

  const handleStart = async () => {
    if (!assessmentData) return;
    setIsSubmitting(true);
    setError('');
    try {
      await loadAttemptQuestions(assessmentData.id, applicationId);
    } catch (err) {
      setError(err?.message || 'Failed to start assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnswerSelect = (qid, val) => {
    setResponses((prev) => ({ ...prev, [qid]: val }));
  };

  // Hoisted so the countdown effect above can safely trigger auto-submit.
  async function handleSubmit(autoSubmit = false) {
    if (!attemptId || isSubmitting) return;
    // Duplicate-submission guard: once a submit is in flight or the backend
    // already owns a completed result, no further submissions may start.
    if (autoSubmitRef.current && !autoSubmit) return;
    setIsSubmitting(true);
    setError('');

    const unanswered = questions.filter((q) => !String(responses[q.id] ?? '').trim()).length;
    if (!autoSubmit && unanswered > 0) {
      const confirmSubmit = window.confirm(`You still have ${unanswered} unanswered question(s). Submit anyway?`);
      if (!confirmSubmit) {
        setIsSubmitting(false);
        return;
      }
    }
    autoSubmitRef.current = true;

    try {
      const respPayload = questions.map((q) => ({
        question_id: Number(q.id),
        response: String(responses[q.id] ?? ''),
      }));

      const res = await submitAssessmentAttempt(attemptId, respPayload);
      setCompletedResult({ attempt: res, skill_evidence: res.skill_breakdown || [] });
      setQuestions([]);
      setResponses({});
      localStorage.removeItem(getDraftKey(attemptId));
    } catch (err) {
      setError(err?.message || 'Failed to submit assessment.');
      // Allow the candidate to retry after a transient network failure — the
      // backend still rejects any submission after the first one lands.
      autoSubmitRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }

  const navigateQuestion = (direction) => {
    if (!questions.length) return;
    setCurrentQuestionIndex((prev) => {
      const nextIndex = prev + direction;
      if (nextIndex < 0) return 0;
      if (nextIndex >= questions.length) return questions.length - 1;
      return nextIndex;
    });
  };

  const timedAssessment = durationMinutes > 0;
  const attemptExpired = timedAssessment && attemptId !== null && !completedResult && remainingSeconds === 0;
  const formattedProgress = remainingSeconds === null ? 'No time limit' : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  if (isLoading) {
    return (
      <div className="intern-page-container container">
        <div className="glass-card empty-state-card animate-fade-in">
          <Loader2 size={32} className="spin text-cyan" />
          <p style={{ marginTop: '1rem' }}>Loading assessment engine…</p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="intern-page-container container">
        <div className="details-nav-row animate-fade-in">
          <button className="btn-back-link" onClick={() => onNavigate('/intern/dashboard')}>
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>
        <div
          className="floating-info-popup animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.15)',
            borderRadius: '16px',
            padding: '18px 22px',
            marginBottom: '24px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              flexShrink: 0,
            }}
          >
            <BrainCircuit size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 600, color: '#f8fafc' }}>
              No Technical Assessment Available
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: '#94a3b8' }}>
              You have not applied to any internships yet. Explore opportunities and apply to get shortlisted for technical assessments.
            </p>
          </div>
        </div>
        <div className="glass-card empty-state-card animate-fade-in">
          <BrainCircuit size={44} className="empty-icon text-indigo" />
          <h3>Technical Assessment Stage</h3>
          <p>When you apply to an internship and get shortlisted by the provider, your technical test will appear here automatically.</p>
          <button className="btn btn-primary glass-btn-primary" onClick={() => onNavigate('/intern/explore')}>
            <Sparkles size={16} />
            <span>Explore Internships</span>
          </button>
        </div>
      </div>
    );
  }

  const internship = app?.internship || {};

  return (
    <div className="intern-page-container container animate-fade-in">
      <div className="details-nav-row">
        <button className="btn-back-link" onClick={() => onNavigate(`/intern/applications/${app?.id || applicationId}/track`)}>
          <ArrowLeft size={16} />
          <span>Back to Application Tracker</span>
        </button>
      </div>

      <div className="glass-card assessment-hero-card" style={{ padding: '2rem' }}>
        <div className="hero-badge-sm">
          <BrainCircuit size={12} />
          <span>Server-Evaluated Assessment</span>
        </div>
        <h1 className="assessment-page-title">{internship.title || assessmentData?.title || 'Technical Assessment'}</h1>
        <span className="assessment-company-sub">
          {internship.provider_name || 'Verified Provider'} · Required Pass Score: {assessmentData?.pass_score || 70}%
        </span>

        {error && (
          <div className="my-skills-alert error" style={{ marginTop: '1rem' }} role="alert">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {completedResult ? (
          <div className="glass-card animate-fade-in" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
              <Award size={32} style={{ color: completedResult.attempt?.passed ? '#10b981' : '#f59e0b' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>
                  Assessment {completedResult.attempt?.passed ? 'Passed ✓' : 'Completed'}
                </h3>
                <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
                  Overall Server Score: <strong>{completedResult.attempt?.overall_score}%</strong> (Passing threshold: {assessmentData?.pass_score || 70}%)
                </span>
              </div>
            </div>

            {completedResult.attempt?.skill_breakdown?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '0.95rem', color: '#cbd5e1', marginBottom: '8px' }}>Evaluated Skill Breakdown</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  {completedResult.attempt.skill_breakdown.map((sb, idx) => (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '0.8rem', textTransform: 'capitalize', color: '#38bdf8', fontWeight: 600 }}>{sb.skill_name}</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginTop: '2px' }}>{sb.score}%</div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sb.correct}/{sb.total} correct</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary glass-btn-primary" onClick={() => onNavigate(`/intern/applications/${app?.id || applicationId}/track`)}>
                <CheckCircle2 size={16} /> Return to Application Tracker
              </button>
            </div>
          </div>
        ) : questions.length > 0 && currentQuestion && !attemptExpired ? (
          <div className="glass-card animate-fade-in" style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.6)', padding: '1.5rem', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#67e8f9', fontWeight: 700 }}>Question {currentQuestionIndex + 1} / {questions.length}</div>
                <div style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>{answeredCount} answered</div>
              </div>

              {durationMinutes > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(14,116,144,0.15)', border: '1px solid rgba(103,232,249,0.25)', borderRadius: '999px', padding: '8px 12px', color: '#dbeafe', fontWeight: 700 }}>
                  <Clock3 size={16} />
                  <span>{formattedProgress}</span>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ height: '8px', background: 'rgba(148, 163, 184, 0.18)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #22d3ee, #38bdf8)', borderRadius: '999px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
              {questions.map((question, index) => {
                const selected = responses[question.id] !== undefined && String(responses[question.id]).trim() !== '';
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => setCurrentQuestionIndex(index)}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      border: index === currentQuestionIndex ? '1px solid #67e8f9' : '1px solid rgba(255,255,255,0.12)',
                      background: selected ? 'rgba(34, 211, 238, 0.12)' : 'rgba(255,255,255,0.04)',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div style={{ marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#67e8f9', fontWeight: 700 }}>
                {currentQuestion.skill_name || 'General Skill'} · {currentQuestion.difficulty}
              </div>
              <p style={{ color: '#f8fafc', fontSize: '1.05rem', marginTop: '0.75rem', lineHeight: '1.6', fontWeight: 600 }}>
                {currentQuestion.question_text}
              </p>
            </div>

            {currentQuestion.type === 'mcq' && Array.isArray(currentQuestion.options) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentQuestion.options.map((option, optionIndex) => (
                  <label key={`${currentQuestion.id}-${optionIndex}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', background: responses[currentQuestion.id] === option ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.04)', border: responses[currentQuestion.id] === option ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#e2e8f0' }}>
                    <input type="radio" name={`q-${currentQuestion.id}`} value={option} checked={responses[currentQuestion.id] === option} onChange={() => handleAnswerSelect(currentQuestion.id, option)} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                rows={5}
                value={responses[currentQuestion.id] || ''}
                onChange={(event) => handleAnswerSelect(currentQuestion.id, event.target.value)}
                placeholder="Type your answer here..."
                style={{ width: '100%', background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(148, 163, 184, 0.25)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#f8fafc', resize: 'vertical' }}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '1.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => navigateQuestion(-1)} disabled={currentQuestionIndex === 0}>
                <ChevronLeft size={16} /> Previous
              </button>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary glass-btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? <><Loader2 size={16} className="spin" /> Submitting…</> : <><CheckCircle2 size={16} /> Submit</>}
                </button>
                <button className="btn btn-outline" onClick={() => navigateQuestion(1)} disabled={currentQuestionIndex === questions.length - 1}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card empty-state-card animate-fade-in" style={{ marginTop: '1.5rem', background: 'transparent', boxShadow: 'none' }}>
            {assessmentData && attemptExpired ? (
              <>
                <AlertCircle size={40} className="empty-icon text-cyan" />
                <h3>Time limit reached</h3>
                <p>The time limit for this assessment has passed. Your in-progress attempt can no longer be submitted — reload the page to check its final state.</p>
                <div style={{ marginTop: '1.25rem' }}>
                  <button className="btn btn-primary glass-btn-primary" onClick={loadAll} disabled={isLoading}>
                    <RefreshCw size={16} /> <span>Reload attempt state</span>
                  </button>
                </div>
              </>
            ) : assessmentData ? (
              <>
                <Sparkles size={40} className="empty-icon text-indigo" />
                <h3>{assessmentData.title}</h3>
                <p>{assessmentData.description || 'Complete this assessment to evaluate your technical fit for the internship.'}</p>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                  {questionCount !== null ? `${questionCount} question${questionCount === 1 ? '' : 's'} · ` : ''}
                  {timedAssessment
                    ? `${durationMinutes} minute time limit — enforced on the server, reloading will not reset it`
                    : 'No time limit'}
                  {' '}· Pass score: {assessmentData?.pass_score ?? 70}%
                </p>
                <div style={{ marginTop: '1.25rem' }}>
                  <button className="btn btn-primary glass-btn-primary" onClick={handleStart} disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 size={16} className="spin" /> Preparing...</> : <><BrainCircuit size={16} /> Start Technical Assessment</>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <ShieldCheck size={40} className="empty-icon text-cyan" />
                <h3>No assessment assigned yet</h3>
                <p>When the provider assigns a technical assessment, it will open here automatically.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
