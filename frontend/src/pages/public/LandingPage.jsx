import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, ArrowRight, ShieldCheck, CheckCircle2, FileText,
  Users, BarChart3, Clock, Award, Cpu, Search, Zap, Building,
  UserCheck, User, Calendar, CheckSquare, QrCode, Bot, Workflow,
  Mail, FileSpreadsheet, ClipboardList, Activity, TrendingUp,
  Megaphone, BadgeCheck, Send, MessageSquare, Eye, Target, ListChecks,
  ArrowUpRight
} from 'lucide-react';
import {
  usePrefersReducedMotion, useRevealAll, useCursorGlow,
  useHeroParallax, useMagnetic, useWorkflowScroll
} from '../../hooks/useMotionHooks';
import '../../styles/LandingPage.css';

export default function LandingPage({ onNavigate }) {
  const [activeRoleTab, setActiveRoleTab] = useState('provider');
  const [roleTransitioning, setRoleTransitioning] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const revealRef = useRevealAll();
  const heroRef = useCursorGlow(reducedMotion);
  const mockupParallaxRef = useHeroParallax(reducedMotion, 14);
  const primaryCtaRef = useMagnetic(reducedMotion, 5);
  const {
    sectionRef: workflowSectionRef,
    activeNodeCount,
    pathFraction,
    pulseFraction,
    activeIndex,
    progress: workflowProgress
  } = useWorkflowScroll(reducedMotion, 7);

  const handleNav = (path) => {
    if (onNavigate) onNavigate(path);
  };

  const switchRole = (role) => {
    if (role === activeRoleTab) return;
    setRoleTransitioning(true);
    const delay = reducedMotion ? 0 : 220;
    window.setTimeout(() => {
      setActiveRoleTab(role);
      setRoleTransitioning(false);
    }, delay);
  };

  return (
    <div className="landing-root" ref={revealRef}>
      {/* GLOBAL SCROLL PROGRESS */}
      <ScrollProgressBar />

      {/* ============ HERO ============ */}
      <section className="landing-hero" ref={heroRef}>
        <div className="landing-hero-bg" aria-hidden="true">
          <div className="landing-hero-grid" />
          <div className="landing-hero-glow" />
          <div className="landing-hero-cursor-glow" />
          <HeroParticles reducedMotion={reducedMotion} />
        </div>

        <div className="container landing-hero-inner">
          <div className="landing-hero-eyebrow reveal-item" data-reveal style={{ '--reveal-delay': '0ms' }}>
            <span className="badge badge-primary">
              <Sparkles size={16} /> AI-Powered Internship Operations Platform
            </span>
          </div>

          <h1 className="landing-hero-title hero-entrance" style={{ '--hero-delay': '80ms' }}>
            Run Internships with <span className="landing-hero-gradient">Less Manual Work.</span>
          </h1>

          <p className="landing-hero-desc hero-entrance" style={{ '--hero-delay': '180ms' }}>
            InternFlow automates your complete program lifecycle—from AI resume screening and candidate matching to onboarding, task tracking, weekly AI reports, evaluations, and verifiable certificates.
          </p>

          <div className="landing-hero-ctas hero-entrance" style={{ '--hero-delay': '280ms' }}>
            <button
              ref={primaryCtaRef}
              className="btn btn-primary btn-lg"
              onClick={() => handleNav('/register?role=provider')}
            >
              Create an Internship <ArrowRight size={18} />
            </button>
            <button
              className="btn btn-outline btn-lg"
              onClick={() => handleNav('/explore')}
            >
              Explore Internships <Search size={18} />
            </button>
          </div>

          {/* Floating product visualization */}
          <div className="landing-hero-visual hero-entrance" style={{ '--hero-delay': '400ms' }}>
            <div className="landing-hero-visual-inner" ref={mockupParallaxRef}>
              <div className="landing-hero-card-main">
                <div className="landing-hero-card-head">
                  <div className="landing-hero-dots">
                    <span className="dot-red" /><span className="dot-yellow" /><span className="dot-green" />
                  </div>
                  <span className="landing-hero-card-title">Operations Control Center</span>
                  <span className="badge badge-success">
                    <CheckCircle2 size={13} /> Live
                  </span>
                </div>
                <div className="landing-hero-stats">
                  <div className="landing-hero-stat">
                    <span className="landing-hero-stat-label">Applications</span>
                    <span className="landing-hero-stat-value">92</span>
                    <span className="landing-hero-stat-trend"><TrendingUp size={12} /> +18 this week</span>
                  </div>
                  <div className="landing-hero-stat">
                    <span className="landing-hero-stat-label">Shortlisted</span>
                    <span className="landing-hero-stat-value landing-text-primary">31</span>
                    <span className="landing-hero-stat-trend"><Bot size={12} /> AI screened</span>
                  </div>
                  <div className="landing-hero-stat">
                    <span className="landing-hero-stat-label">Interviews</span>
                    <span className="landing-hero-stat-value landing-text-success">12</span>
                    <span className="landing-hero-stat-trend"><Calendar size={12} /> 4 this week</span>
                  </div>
                </div>
                <div className="landing-hero-progress">
                  <div className="landing-hero-progress-head">
                    <span>Internship Progress</span>
                    <span>68%</span>
                  </div>
                  <div className="landing-hero-progress-track">
                    <div className="landing-hero-progress-fill" style={{ width: '68%' }} />
                  </div>
                </div>
              </div>

            </div>

            {/* Orbiting floating cards */}
            <FloatCard className="fc-1" reducedMotion={reducedMotion} depth={1}>
              <div className="landing-fc-icon landing-fc-icon-primary"><Bot size={16} /></div>
              <div>
                <div className="landing-fc-title">AI Match</div>
                <div className="landing-fc-meter">
                  <span className="landing-fc-meter-fill" style={{ '--meter': '94%' }} />
                </div>
                <div className="landing-fc-sub">94% match</div>
              </div>
            </FloatCard>

            <FloatCard className="fc-2" reducedMotion={reducedMotion} depth={2}>
              <div className="landing-fc-icon landing-fc-icon-success"><CheckCircle2 size={16} /></div>
              <div>
                <div className="landing-fc-title">Task Completed</div>
                <div className="landing-fc-sub">API integration module</div>
              </div>
            </FloatCard>

            <FloatCard className="fc-3" reducedMotion={reducedMotion} depth={1.5}>
              <div className="landing-fc-icon landing-fc-icon-info"><Calendar size={16} /></div>
              <div>
                <div className="landing-fc-title">Interview Scheduled</div>
                <div className="landing-fc-sub">Tomorrow · 10:30 AM</div>
              </div>
            </FloatCard>

            <FloatCard className="fc-4" reducedMotion={reducedMotion} depth={2.5}>
              <div className="landing-fc-icon landing-fc-icon-success"><QrCode size={16} /></div>
              <div>
                <div className="landing-fc-title">Certificate Verified</div>
                <div className="landing-fc-sub">ID: IF-2026-0042</div>
              </div>
            </FloatCard>
          </div>
        </div>
      </section>

      {/* ============ PROBLEM ============ */}
      <section className="landing-section-padding landing-problem">
        <div className="landing-problem-bg" aria-hidden="true">
          <div className="landing-dot-field" />
          <div className="landing-frag-lines">
            <span /><span /><span />
          </div>
        </div>

        <div className="container">
          <div className="landing-section-header reveal-item" data-reveal>
            <span className="badge badge-warning" style={{ marginBottom: '1rem' }}>Operational Gaps</span>
            <h2 className="landing-section-h2">THE PROBLEM</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.75rem', fontSize: '1.0625rem' }}>
              Traditional internship operations rely on fragmented tools and manual processes that waste hundreds of hours.
            </p>
          </div>

          {/* Fragmented → connected visual */}
          <div className="landing-frag-wrap reveal-item" data-reveal>
            <div className="landing-frag-row">
              <span className="landing-frag-chip landing-frag-1"><FileText size={14} /> Resume.pdf</span>
              <span className="landing-frag-chip landing-frag-2"><Mail size={14} /> Email thread</span>
              <span className="landing-frag-chip landing-frag-3"><FileSpreadsheet size={14} /> Tracker.xlsx</span>
              <span className="landing-frag-chip landing-frag-4"><ClipboardList size={14} /> Weekly report</span>
              <span className="landing-frag-chip landing-frag-5"><Award size={14} /> Certificate.pdf</span>
            </div>
            <div className="landing-frag-caption">
              <span className="landing-frag-arrow">scattered inputs</span>
              <span className="landing-frag-line" />
              <span className="landing-frag-arrow landing-frag-arrow-strong">one connected system →</span>
            </div>
          </div>

          <div className="landing-problem-grid-top">
            <ProblemCard icon={FileText} title="Manual Resume Screening" revealDelay={0} desc="Reviewing hundreds of static candidate resumes manually is tedious, slow, and prone to recruiter fatigue." />
            <ProblemCard icon={Users} title="Scattered Communication" revealDelay={90} desc="Applicant status, updates, and schedule notifications are lost across unorganized emails and messaging apps." />
            <ProblemCard icon={BarChart3} title="Spreadsheet-Based Tracking" revealDelay={180} desc="Managing candidates and active intern task progress in static spreadsheets provides no real-time visibility." />
          </div>

          <div className="landing-problem-grid-bottom">
            <ProblemCard icon={Clock} title="Manual Progress Reports" revealDelay={90} desc="Gathering weekly intern progress data and writing manual reports drains valuable mentor working hours." />
            <ProblemCard icon={Award} title="Manual Certificates" revealDelay={180} desc="Designing and emailing physical PDFs individually without an automated public verification proof." />
          </div>
        </div>
      </section>

      {/* ============ SOLUTION — WORKFLOW ============ */}
      <section className="landing-section-padding landing-solution" ref={workflowSectionRef}>
        <div className="landing-solution-bg" aria-hidden="true">
          <div className="landing-tech-grid" />
        </div>

        <div className="container">
          <div className="landing-section-header reveal-item" data-reveal>
            <span className="badge badge-primary" style={{ marginBottom: '1rem' }}>End-to-End Lifecycle</span>
            <h2 className="landing-section-h2">THE SOLUTION</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.75rem', fontSize: '1.0625rem' }}>
              One unified platform managing the complete internship journey seamlessly.
            </p>
          </div>

          <div className="landing-flow reveal-item" data-reveal>
            <div className="landing-flow-track">
              <svg className="landing-flow-svg" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
                <path className="landing-flow-path-base" d="M 60 60 H 1140" />
                <path
                  className="landing-flow-path-lit"
                  d="M 60 60 H 1140"
                  style={{ strokeDasharray: 1080, strokeDashoffset: 1080 * (1 - pathFraction) }}
                />
              </svg>

              <div className="landing-flow-nodes">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const active = idx < activeNodeCount;
                  const isCurrent = idx === activeIndex && workflowProgress > 0.02 && workflowProgress < 0.98;
                  return (
                    <div
                      key={step.title}
                      className={`landing-flow-node ${active ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}`}
                      style={{ '--node-delay': `${idx * 40}ms` }}
                    >
                      <div className="landing-flow-node-circle">
                        <step.icon size={18} strokeWidth={2} />
                      </div>
                      <span className="landing-flow-node-step">{step.num}</span>
                      <h4 className="landing-flow-node-title">{step.title}</h4>
                      <p className="landing-flow-node-desc">{step.desc}</p>
                    </div>
                  );
                })}
              </div>

              {!reducedMotion && (
                <span
                  className="landing-flow-pulse"
                  style={{ left: `${6 + pulseFraction * 88}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          <div className="landing-flow-caption reveal-item" data-reveal>
            <Workflow size={15} />
            <span>RECRUIT → SCREEN → SELECT → ONBOARD → MANAGE → EVALUATE → CERTIFY</span>
          </div>
        </div>
      </section>

      {/* ============ MENTOR EXPERIENCE ============ */}
      <section id="mentor-experience" className="landing-section-padding landing-mentor">
        <div className="landing-mentor-bg" aria-hidden="true">
          <div className="landing-mentor-grid" />
          <span className="landing-mentor-orbit landing-mentor-orbit-a" />
          <span className="landing-mentor-orbit landing-mentor-orbit-b" />
          <span className="landing-mentor-node landing-mentor-node-a" />
          <span className="landing-mentor-node landing-mentor-node-b" />
          <span className="landing-mentor-node landing-mentor-node-c" />
        </div>

        <div className="container">
          <div className="landing-mentor-intro">
            <div className="landing-mentor-copy reveal-item" data-reveal>
              <span className="landing-mentor-eyebrow">MENTOR EXPERIENCE</span>
              <h2>Guide Interns.<br />Track Progress.<br /><span>Build Better Outcomes.</span></h2>
              <p>
                InternFlow gives mentors one focused workspace to see assigned interns, manage tasks, review submissions, give feedback, and evaluate progress at the right moment.
              </p>
              <div className="landing-mentor-ctas">
                <button className="btn btn-primary" onClick={() => handleNav('/#how-it-works')}>
                  See How Mentorship Works <ArrowRight size={17} />
                </button>
                <button className="btn btn-outline" onClick={() => handleNav('/explore')}>
                  Explore InternFlow <ArrowUpRight size={16} />
                </button>
              </div>
            </div>

            <div className="landing-mentor-visual-wrap reveal-item" data-reveal style={{ '--reveal-delay': '120ms' }}>
              <MentorWorkspaceVisual reducedMotion={reducedMotion} />
            </div>
          </div>

          <div className="landing-mentor-workflow reveal-item" data-reveal style={{ '--reveal-delay': '180ms' }}>
            <span className="landing-mentor-workflow-label">THE MENTORSHIP LOOP</span>
            <div className="landing-mentor-workflow-track">
              {MENTOR_WORKFLOW.map((step, index) => {
                const Icon = step.icon;
                return (
                  <React.Fragment key={step.label}>
                    <div className="landing-mentor-workflow-step" style={{ '--step-delay': `${index * 100}ms` }}>
                      <span className="landing-mentor-workflow-icon"><Icon size={14} /></span>
                      <span>{step.label}</span>
                    </div>
                    {index < MENTOR_WORKFLOW.length - 1 && <span className="landing-mentor-workflow-line" aria-hidden="true" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="landing-mentor-capabilities">
            {MENTOR_CAPABILITIES.map((capability, index) => (
              <div key={capability.title} className="landing-mentor-capability reveal-item" data-reveal style={{ '--reveal-delay': `${220 + index * 70}ms` }}>
                <span className="landing-mentor-capability-number">0{index + 1}</span>
                <div className="landing-mentor-capability-icon"><capability.icon size={16} /></div>
                <div>
                  <h3>{capability.title}</h3>
                  <p>{capability.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ AI + AUTOMATION — DARK SYSTEM ============ */}
      <section className="landing-section-padding landing-ai">
        <div className="landing-ai-bg" aria-hidden="true">
          <div className="landing-ai-grid" />
          <div className="landing-ai-radial" />
        </div>

        <div className="container">
          <div className="landing-section-header reveal-item" data-reveal>
            <span className="badge badge-info" style={{ marginBottom: '1rem' }}><Cpu size={14} /> Intelligent Workflows</span>
            <h2 className="landing-section-h2">AI + AUTOMATION</h2>
            <p style={{ color: 'var(--color-ai-text-secondary)', marginTop: '0.75rem', fontSize: '1.0625rem' }}>
              AI assists with screening, drafting, and reporting—while providers and mentors retain control.
            </p>
          </div>

          <AiCoreVisualization reducedMotion={reducedMotion} />

          <div className="landing-ai-grid-cards">
            <AiCapabilityCard
              icon={Sparkles}
              badge="AI Screening"
              badgeClass="badge-primary"
              title="AI Screening"
              revealDelay={0}
              desc="Extracts skills, experience, and projects from candidate PDFs and calculates explainable match scores against internship requirements."
              visual={<MatchMeterVisual />}
            />
            <AiCapabilityCard
              icon={Zap}
              badge="Communication"
              badgeClass="badge-info"
              title="Automated Communication"
              revealDelay={90}
              desc="Triggers candidate shortlist emails, assessment invitations, and interview schedule slots automatically via Make.com webhooks."
              visual={<TriggerFlowVisual />}
            />
            <AiCapabilityCard
              icon={BarChart3}
              badge="Progress Summaries"
              badgeClass="badge-success"
              title="AI Reports"
              revealDelay={180}
              desc="Synthesizes weekly task submissions, attendance records, and mentor feedback into structured progress reports."
              visual={<ReportBarsVisual />}
            />
            <AiCapabilityCard
              icon={Workflow}
              badge="Workflow Automation"
              badgeClass="badge-primary"
              title="Workflow Automation"
              revealDelay={90}
              desc="Automates onboarding checklists, agreement tracking, task assignments, and evaluation reminders seamlessly."
              visual={<ChecklistVisual />}
            />
            <AiCapabilityCard
              icon={ShieldCheck}
              badge="QR Proof"
              badgeClass="badge-success"
              title="Certificate Generation"
              revealDelay={180}
              desc="Generates official certificate PDFs with unique IDs and QR codes verified against the application database."
              visual={<CertificateVisual />}
            />
          </div>
        </div>
      </section>

      {/* ============ FEATURE OVERVIEW — BENTO GRID ============ */}
      <section id="features" className="landing-section-padding landing-features">
        <div className="landing-features-bg" aria-hidden="true">
          <div className="landing-dot-field" />
        </div>

        <div className="container">
          <div className="landing-section-header reveal-item" data-reveal>
            <span className="badge badge-primary" style={{ marginBottom: '1rem' }}>Core Capabilities</span>
            <h2 className="landing-section-h2">FEATURE OVERVIEW</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.75rem', fontSize: '1.0625rem' }}>
              Major platform capabilities designed for internship operations.
            </p>
          </div>

          <div className="landing-bento">
            <BentoCard className="bento-a" revealDelay={0} icon={Building} kicker="FEATURE 01" title="Provider Dashboard" desc="Centralized control panel for managing active programs, application funnels, and active interns.">
              <FunnelVisual />
            </BentoCard>

            <BentoCard className="bento-b" revealDelay={80} icon={Sparkles} kicker="FEATURE 02" title="AI Screening & Matching" desc="Structured resume data extraction with transparent skill matching and evidence explanations.">
              <MatchMeterVisual label="Top candidate" meter="94%" />
            </BentoCard>

            <BentoCard className="bento-c" revealDelay={160} icon={Calendar} kicker="FEATURE 03" title="Interview Scheduling" desc="Friction-free interview slot booking with conflict prevention and AI-assisted questions.">
              <SlotGridVisual />
            </BentoCard>

            <BentoCard className="bento-d" revealDelay={0} icon={CheckSquare} kicker="FEATURE 04" title="Task Management" desc="Operational workspace for assigning tasks, reviewing intern work submissions, and adding mentor feedback.">
              <TaskRowsVisual />
            </BentoCard>

            <BentoCard className="bento-e" revealDelay={80} icon={Clock} kicker="FEATURE 05" title="Daily Attendance & Hours" desc="Simple check-in/check-out tracking to monitor daily intern attendance and calculated working hours.">
              <AttendanceVisual />
            </BentoCard>

            <BentoCard className="bento-f" revealDelay={160} icon={ShieldCheck} kicker="FEATURE 06" title="Public QR Verification" desc="Instant verification of issued internship certificates via unique Certificate ID or QR code lookup.">
              <QrVerifyVisual />
            </BentoCard>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS — ROLE SELECTOR ============ */}
      <section id="how-it-works" className="landing-section-padding landing-how">
        <div className="container">
          <div className="landing-section-header reveal-item" data-reveal>
            <span className="badge badge-info" style={{ marginBottom: '1rem' }}>Role Workflows</span>
            <h2 className="landing-section-h2">HOW IT WORKS</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.75rem', fontSize: '1.0625rem' }}>
              Separate explanations tailored for Providers, Mentors, and Interns.
            </p>
          </div>

          <div className="landing-how-tabs reveal-item" data-reveal>
            <div className="landing-how-tabs-indicator" data-role={activeRoleTab} aria-hidden="true" />
            {[
              { id: 'provider', label: 'Provider', icon: Building },
              { id: 'mentor', label: 'Mentor', icon: UserCheck },
              { id: 'intern', label: 'Intern', icon: User }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchRole(tab.id)}
                  className={`landing-how-tab ${activeRoleTab === tab.id ? 'is-active' : ''}`}
                  aria-pressed={activeRoleTab === tab.id}
                >
                  <Icon size={15} /> {tab.label}
                </button>
              );
            })}
          </div>

          <div className={`landing-how-stage ${roleTransitioning ? 'is-transitioning' : ''}`}>
            <RoleFlowVisualization role={activeRoleTab} reducedMotion={reducedMotion} />

            <div className="landing-how-steps" key={activeRoleTab}>
              {(activeRoleTab === 'provider'
                ? [
                  { num: '01', title: 'Creates Program', desc: 'Defines internship title, stipend, work mode, skills, assessment criteria, and mentor assignments.' },
                  { num: '02', title: 'Reviews Applications', desc: 'Inspects AI match scores, candidate evidence, and shortlists top applicants for assessment/interviews.' },
                  { num: '03', title: 'Monitors & Certifies', desc: 'Tracks intern progress, approves final evaluations, and generates verifiable QR certificates.' }
                ]
                : activeRoleTab === 'mentor'
                  ? [
                    { num: '01', title: 'Manages Interns', desc: 'Views assigned interns, active tasks, submissions, and attendance records on a dedicated dashboard.' },
                    { num: '02', title: 'Reviews Submissions', desc: 'Assigns tasks with deadlines, reviews intern work submissions, and delivers actionable feedback.' },
                    { num: '03', title: 'Approves AI Reports', desc: 'Reviews AI-generated weekly progress reports and contributes to final program evaluations.' }
                  ]
                  : [
                    { num: '01', title: 'Applies & Works', desc: 'Browses internships, submits applications, completes assessments, and checks in daily.' },
                    { num: '02', title: 'Submits Tasks', desc: 'Performs assigned tasks, submits work links/files, and receives mentor feedback.' },
                    { num: '03', title: 'Obtains Certificate', desc: 'Completes internship milestones and receives an official verifiable QR certificate.' }
                  ]
              ).map((step, i) => (
                <div key={step.num} className="landing-how-step-card card" style={{ '--step-delay': `${i * 90}ms` }}>
                  <span className={`landing-how-step-num landing-how-step-num-${activeRoleTab}`}>{step.num}</span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-how-explanation reveal-item" data-reveal>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              💡 <strong>Simple Explanation:</strong> Providers control program configuration and certificates, Mentors oversee daily execution and feedback, and Interns perform work and track milestones—all connected seamlessly by AI and event automation.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ================= Shared data ================= */

const WORKFLOW_STEPS = [
  { num: '01', title: 'RECRUIT', desc: 'Publish & attract talent', icon: Megaphone },
  { num: '02', title: 'SCREEN', desc: 'AI resume analysis', icon: Bot },
  { num: '03', title: 'SELECT', desc: 'Assess & interview', icon: UserCheck },
  { num: '04', title: 'ONBOARD', desc: 'Automated setup', icon: ClipboardList },
  { num: '05', title: 'MANAGE', desc: 'Tasks & attendance', icon: CheckSquare },
  { num: '06', title: 'EVALUATE', desc: 'AI weekly reports', icon: BarChart3 },
  { num: '07', title: 'CERTIFY', desc: 'QR certificate', icon: Award }
];

const MENTOR_WORKFLOW = [
  { label: 'ASSIGN', icon: ClipboardList },
  { label: 'GUIDE', icon: Target },
  { label: 'REVIEW', icon: Eye },
  { label: 'FEEDBACK', icon: MessageSquare },
  { label: 'EVALUATE', icon: BarChart3 },
  { label: 'PROGRESS', icon: TrendingUp }
];

const MENTOR_CAPABILITIES = [
  { title: 'Track Progress', desc: 'See where each assigned intern stands.', icon: TrendingUp },
  { title: 'Review Work', desc: 'Review submissions and internship activity.', icon: Eye },
  { title: 'Give Feedback', desc: 'Provide guidance at the right stage.', icon: MessageSquare },
  { title: 'Evaluate', desc: 'Record structured evaluations and outcomes.', icon: ListChecks }
];

function MentorWorkspaceVisual({ reducedMotion }) {
  const interns = [
    { name: 'Maya Chen', track: 'Full Stack', progress: 78, note: 'Next review: Tomorrow', accent: 'primary' },
    { name: 'Jordan Lee', track: 'AI / ML', progress: 62, note: 'Needs feedback', accent: 'info' }
  ];

  return (
    <div className={`landing-mentor-stage ${reducedMotion ? 'reduced' : ''}`}>
      <div className="landing-mentor-float landing-mentor-float-a"><CheckCircle2 size={14} /><span><strong>Task submitted</strong><small>Ready for review</small></span></div>
      <div className="landing-mentor-float landing-mentor-float-b"><MessageSquare size={14} /><span><strong>Feedback requested</strong><small>Intern · 2m ago</small></span></div>
      <div className="landing-mentor-float landing-mentor-float-c"><TrendingUp size={14} /><span><strong>Progress updated</strong><small>72% → 78%</small></span></div>

      <div className="landing-mentor-window">
        <div className="landing-mentor-window-head">
          <div className="landing-mentor-window-title"><span className="landing-mentor-window-mark"><UserCheck size={14} /></span><span>Mentor Workspace</span></div>
          <span className="landing-mentor-live"><i /> Active</span>
        </div>

        <div className="landing-mentor-metrics">
          <div><span>Assigned interns</span><strong>12</strong><small><UserCheck size={11} /> 3 need attention</small></div>
          <div><span>Open tasks</span><strong>08</strong><small><CheckSquare size={11} /> 5 due this week</small></div>
          <div><span>Team progress</span><strong>72%</strong><small><TrendingUp size={11} /> +6% this month</small></div>
        </div>

        <div className="landing-mentor-panel">
          <div className="landing-mentor-panel-head"><span>Assigned interns</span><button type="button">View all <ArrowRight size={12} /></button></div>
          <div className="landing-mentor-interns">
            {interns.map((intern) => (
              <div className="landing-mentor-intern" key={intern.name}>
                <div className={`landing-mentor-avatar landing-mentor-avatar-${intern.accent}`}>{intern.name.split(' ').map((part) => part[0]).join('')}</div>
                <div className="landing-mentor-intern-main">
                  <div className="landing-mentor-intern-top"><strong>{intern.name}</strong><span>{intern.track}</span></div>
                  <div className="landing-mentor-progress-row"><span>Task progress</span><strong>{intern.progress}%</strong></div>
                  <div className="landing-mentor-progress-track"><span style={{ '--progress': `${intern.progress}%` }} /></div>
                  <small className={intern.progress < 70 ? 'is-attention' : ''}>{intern.progress < 70 ? <MessageSquare size={11} /> : <Calendar size={11} />} {intern.note}</small>
                </div>
                <ArrowRight size={15} className="landing-mentor-intern-arrow" />
              </div>
            ))}
          </div>
        </div>

        <div className="landing-mentor-activity">
          <span className="landing-mentor-activity-label">Recent activity</span>
          <div><CheckCircle2 size={13} /> Task submitted <time>2m</time></div>
          <div><MessageSquare size={13} /> Feedback requested <time>18m</time></div>
          <div><BarChart3 size={13} /> Weekly review completed <time>1h</time></div>
        </div>
      </div>
    </div>
  );
}

/* ================= Scroll progress bar ================= */

function ScrollProgressBar() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setP(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return (
    <div className="landing-scroll-progress" aria-hidden="true">
      <div className="landing-scroll-progress-fill" style={{ transform: `scaleX(${p})` }} />
    </div>
  );
}

/* ================= Hero particles ================= */

function HeroParticles({ reducedMotion }) {
  const dots = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: (i * 37 + 13) % 100,
      top: (i * 53 + 29) % 100,
      size: 2 + (i % 3),
      delay: (i % 7) * 1.3,
      duration: 7 + (i % 5) * 2.5
    })),
    []
  );

  if (reducedMotion) {
    return (
      <div className="landing-hero-particles" aria-hidden="true">
        {dots.slice(0, 8).map((d) => (
          <span key={d.id} className="landing-particle landing-particle-static" style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size }} />
        ))}
      </div>
    );
  }

  return (
    <div className="landing-hero-particles" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.id}
          className="landing-particle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`
          }}
        />
      ))}
    </div>
  );
}

/* ================= Hero floating card ================= */

function FloatCard({ className, reducedMotion, depth = 1, children }) {
  return (
    <div
      className={`landing-float-card ${className} ${reducedMotion ? '' : 'is-floating'}`}
      style={{ '--float-depth': depth, '--float-duration': `${7 + depth * 2}s` }}
    >
      {children}
    </div>
  );
}

/* ================= Problem card ================= */

function ProblemCard({ icon: Icon, title, desc, revealDelay }) {
  return (
    <div className="card card-hover landing-problem-card reveal-item" data-reveal style={{ '--reveal-delay': `${revealDelay}ms` }}>
      <div className="landing-problem-icon-wrapper">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

/* ================= AI core visualization ================= */

const AI_NODES = [
  { label: 'AI Screening', icon: Sparkles },
  { label: 'Automated Communication', icon: Mail },
  { label: 'AI Reports', icon: BarChart3 },
  { label: 'Workflow Automation', icon: Workflow },
  { label: 'Certificate Generation', icon: ShieldCheck }
];

function AiCoreVisualization({ reducedMotion }) {
  const [litNode, setLitNode] = useState(-1);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let i = 0;
    const interval = window.setInterval(() => {
      setLitNode(i % AI_NODES.length);
      i += 1;
    }, 2600);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);
  return (
    <div className={`landing-ai-core-wrap reveal-item ${reducedMotion ? 'reduced' : ''}`} data-reveal>
      <div className="landing-ai-core-stage">
        {/* Connection lines (SVG) — base + traveling data dash */}
        <svg className="landing-ai-lines" viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
          <path className="landing-ai-line" d="M 180 120 C 300 140, 360 200, 470 235" />
          <path className="landing-ai-line" d="M 150 260 H 455" />
          <path className="landing-ai-line" d="M 180 400 C 300 380, 360 320, 470 285" />
          <path className="landing-ai-line" d="M 820 120 C 700 140, 640 200, 530 235" />
          <path className="landing-ai-line" d="M 820 400 C 700 380, 640 320, 530 285" />
          {!reducedMotion && (
            <>
              <path className="landing-ai-line-flow" pathLength="100" style={{ '--flow-delay': '0s' }} d="M 180 120 C 300 140, 360 200, 470 235" />
              <path className="landing-ai-line-flow" pathLength="100" style={{ '--flow-delay': '0.5s' }} d="M 150 260 H 455" />
              <path className="landing-ai-line-flow" pathLength="100" style={{ '--flow-delay': '1s' }} d="M 180 400 C 300 380, 360 320, 470 285" />
              <path className="landing-ai-line-flow" pathLength="100" style={{ '--flow-delay': '0.75s' }} d="M 820 120 C 700 140, 640 200, 530 235" />
              <path className="landing-ai-line-flow" pathLength="100" style={{ '--flow-delay': '1.25s' }} d="M 820 400 C 700 380, 640 320, 530 285" />
            </>
          )}
        </svg>

        {/* Central AI core */}
        <div className="landing-ai-core">
          <div className="landing-ai-core-ring" />
          <div className="landing-ai-core-ring landing-ai-core-ring-2" />
          <div className="landing-ai-core-circle">
            <Bot size={30} />
            <span>AI CORE</span>
          </div>
        </div>

        {/* Capability nodes */}
        {AI_NODES.map((node, i) => {
          const NodeIcon = node.icon;
          return (
            <div
              key={node.label}
              className={`landing-ai-node landing-ai-node-${i + 1} ${litNode === i && !reducedMotion ? 'is-lit' : ''}`}
            >
              <span className="landing-ai-node-dot" />
              <NodeIcon size={15} /> {node.label}
            </div>
          );
        })}
      </div>

      {/* Animated data path activity strip */}
      <div className="landing-ai-activity" aria-hidden="true">
        <Activity size={13} />
        <span>data → automation → action → result</span>
        <div className="landing-ai-activity-track">
          <span className="landing-ai-activity-dot" />
        </div>
      </div>
    </div>
  );
}

function AiCapabilityCard({ icon: Icon, badge, badgeClass, title, desc, visual, revealDelay }) {
  return (
    <div className="card card-hover landing-ai-card reveal-item" data-reveal style={{ '--reveal-delay': `${revealDelay}ms` }}>
      <div className="landing-ai-card-head">
        <span className={`badge ${badgeClass}`}>
          <Icon size={12} /> {badge}
        </span>
        <div className="landing-ai-card-icon"><Icon size={18} /></div>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="landing-ai-card-visual">{visual}</div>
    </div>
  );
}

/* ================= AI card mini-visuals ================= */

function MatchMeterVisual({ meter = '94%' }) {
  return (
    <div className="landing-mini-viz">
      <div className="landing-mini-viz-row">
        <span className="landing-mini-chip"><FileText size={11} /> Candidate</span>
        <ArrowRight size={11} className="landing-mini-arrow" />
        <span className="landing-mini-chip landing-mini-chip-primary"><Bot size={11} /> AI Match</span>
      </div>
      <div className="landing-mini-meter">
        <span className="landing-mini-meter-fill" style={{ '--meter': meter }} />
      </div>
      <div className="landing-mini-viz-caption">{meter} skill alignment</div>
    </div>
  );
}

function TriggerFlowVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-mini-viz-row">
        <span className="landing-mini-chip"><Zap size={11} /> Trigger</span>
        <ArrowRight size={11} className="landing-mini-arrow" />
        <span className="landing-mini-chip"><Send size={11} /> Action</span>
        <ArrowRight size={11} className="landing-mini-arrow" />
        <span className="landing-mini-chip landing-mini-chip-success"><CheckCircle2 size={11} /> Result</span>
      </div>
      <div className="landing-mini-viz-caption">Shortlist → invite → interview slot</div>
    </div>
  );
}

function ReportBarsVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-mini-bars">
        {[42, 68, 55, 82, 74, 90].map((h, i) => (
          <span key={i} className="landing-mini-bar" style={{ '--bar-h': `${h}%`, '--bar-delay': `${i * 90}ms` }} />
        ))}
      </div>
      <div className="landing-mini-viz-caption">Weekly progress trend</div>
    </div>
  );
}

function ChecklistVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-mini-checklist">
        {['Onboarding checklist', 'Agreement signed', 'Task assigned'].map((item, i) => (
          <span key={item} className="landing-mini-check" style={{ '--check-delay': `${i * 160}ms` }}>
            <CheckCircle2 size={12} /> {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function CertificateVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-mini-cert">
        <div className="landing-mini-cert-body">
          <span className="landing-mini-cert-title">Certificate of Completion</span>
          <span className="landing-mini-cert-id">ID: IF-2026-0042</span>
        </div>
        <div className="landing-mini-cert-qr"><QrCode size={22} /></div>
      </div>
    </div>
  );
}

/* ================= Bento visuals ================= */

function BentoCard({ className, icon: Icon, kicker, title, desc, children, revealDelay }) {
  return (
    <div className={`landing-bento-card reveal-item ${className}`} data-reveal style={{ '--reveal-delay': `${revealDelay}ms` }}>
      <div className="landing-bento-head">
        <div className="landing-bento-icon"><Icon size={20} /></div>
        <span className="landing-bento-kicker">{kicker}</span>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="landing-bento-visual">{children}</div>
    </div>
  );
}

function FunnelVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-funnel">
        <span className="landing-funnel-bar" style={{ '--w': '100%' }}><Users size={11} /> 92 Applications</span>
        <span className="landing-funnel-bar" style={{ '--w': '66%' }}><Bot size={11} /> 31 AI shortlisted</span>
        <span className="landing-funnel-bar" style={{ '--w': '36%' }}><Calendar size={11} /> 12 Interviews</span>
        <span className="landing-funnel-bar" style={{ '--w': '18%' }}><Award size={11} /> 6 Hired</span>
      </div>
    </div>
  );
}

function SlotGridVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-slot-grid">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`landing-slot ${i === 3 || i === 6 ? 'is-taken' : i === 4 ? 'is-selected' : ''}`} />
        ))}
      </div>
      <div className="landing-mini-viz-caption">Thu 10:30 selected · no conflicts</div>
    </div>
  );
}

function TaskRowsVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-task-rows">
        <span className="landing-task-row"><CheckCircle2 size={12} className="landing-text-success" /> Build auth flow</span>
        <span className="landing-task-row"><Clock size={12} className="landing-text-warning" /> API integration</span>
        <span className="landing-task-row"><CheckCircle2 size={12} className="landing-text-success" /> Write weekly report</span>
      </div>
    </div>
  );
}

function AttendanceVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-attend">
        <div className="landing-attend-head"><span>Check-in</span><span>Hours this week</span></div>
        <div className="landing-attend-row"><span className="landing-attend-dot" /> 09:02 AM <span className="landing-attend-hours">32.5 h</span></div>
      </div>
    </div>
  );
}

function QrVerifyVisual() {
  return (
    <div className="landing-mini-viz">
      <div className="landing-qr-verify">
        <div className="landing-qr-verify-box"><QrCode size={26} /></div>
        <div className="landing-qr-verify-text">
          <span className="landing-qr-verify-scan">Scan QR</span>
          <span className="landing-qr-verify-ok"><BadgeCheck size={13} /> Verified</span>
        </div>
      </div>
    </div>
  );
}

/* ================= Role flow visualization ================= */

const ROLE_FLOWS = {
  provider: {
    accent: 'var(--color-primary)',
    label: 'Provider World',
    steps: [
      { title: 'Create', desc: 'Define program, stipend, skills & criteria', icon: Building },
      { title: 'Recruit', desc: 'Attract applicants; AI ranks fits', icon: Megaphone },
      { title: 'Select', desc: 'Shortlist, assess & interview', icon: UserCheck },
      { title: 'Manage', desc: 'Track interns, tasks & milestones', icon: CheckSquare }
    ]
  },
  mentor: {
    accent: 'var(--color-info)',
    label: 'Mentor World',
    steps: [
      { title: 'Assign', desc: 'Hand out tasks with deadlines', icon: ClipboardList },
      { title: 'Review', desc: 'Inspect submissions & give notes', icon: FileText },
      { title: 'Feedback', desc: 'Deliver actionable feedback', icon: Mail },
      { title: 'Evaluate', desc: 'Score progress for AI reports', icon: BarChart3 }
    ]
  },
  intern: {
    accent: 'var(--color-success)',
    label: 'Intern World',
    steps: [
      { title: 'Apply', desc: 'Browse & apply with AI matching', icon: Search },
      { title: 'Work', desc: 'Complete tasks & check in daily', icon: CheckSquare },
      { title: 'Report', desc: 'Submit progress for review', icon: FileText },
      { title: 'Complete', desc: 'Earn verified QR certificate', icon: Award }
    ]
  }
};

function RoleFlowVisualization({ role, reducedMotion }) {
  const flow = ROLE_FLOWS[role];
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    if (reducedMotion) {
      const settle = window.setTimeout(() => setActiveIdx(flow.steps.length - 1), 0);
      return () => window.clearTimeout(settle);
    }
    const interval = window.setInterval(() => {
      setActiveIdx((prev) => {
        const next = prev + 1;
        return next >= flow.steps.length ? 0 : next;
      });
    }, 2200);
    return () => window.clearInterval(interval);
  }, [role, flow.steps.length, reducedMotion]);

  return (
    <div className="landing-role-flow" style={{ '--role-accent': flow.accent }} key={role}>
      <span className="landing-role-flow-label">{flow.label}</span>
      <div className="landing-role-flow-track">
        {flow.steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={step.title}>
              <div className={`landing-role-step ${i <= activeIdx ? 'is-active' : ''}`}>
                <div className="landing-role-step-circle"><Icon size={17} /></div>
                <span className="landing-role-step-title">{step.title}</span>
                <span className="landing-role-step-desc">{step.desc}</span>
              </div>
              {i < flow.steps.length - 1 && (
                <span className={`landing-role-connector ${i < activeIdx ? 'is-lit' : ''}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
