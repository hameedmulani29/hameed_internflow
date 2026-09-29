import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, Clock, ArrowRight, X, CheckCircle2, Bot, Briefcase, ChevronLeft, ChevronRight } from 'lucide-react';
import { EXPLORE_CATEGORIES, getSession, searchInternships, submitApplication } from '../../services/publicExperience';
import { subscribeToInternships } from '../../services/realtimeService';
import { formatBackendInternship } from '../../services/internService';
import { usePrefersReducedMotion, useRevealAll } from '../../hooks/useMotionHooks';
import '../../styles/ExploreInternshipsPage.css';

/* ============ Filter option sets ============ */

const WORK_MODES = ['All', 'Remote', 'Hybrid', 'On-site'];
const DURATIONS = ['All', '2 Months', '3 Months', '4 Months', '6 Months'];
const STIPENDS = [
  { value: 'All', label: 'All' },
  { value: '12000', label: '₹12,000+' },
  { value: '15000', label: '₹15,000+' },
  { value: '18000', label: '₹18,000+' },
  { value: '20000', label: '₹20,000+' }
];
const LOCATIONS = ['All', 'Remote', 'Hybrid', 'On-site'];

/* ============ Small helpers ============ */

function FilterGroup({ title, options, selected, onSelect, name }) {
  return (
    <div className="explore-filter-group">
      <h4 className="explore-filter-title">{title}</h4>
      <div className="explore-filter-options">
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          return (
            <label key={value} className="explore-filter-option">
              <input
                type="radio"
                name={name}
                checked={selected === value}
                onChange={() => onSelect(value)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function stipendNumber(stipend) {
  const n = parseInt(stipend.replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

/* ============ Page ============ */

export default function ExploreInternshipsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchNonce, setSearchNonce] = useState(0);

  const [selectedWorkMode, setSelectedWorkMode] = useState('All');
  const [selectedDuration, setSelectedDuration] = useState('All');
  const [selectedStipend, setSelectedStipend] = useState('All');
  const [selectedMode2, setSelectedMode2] = useState('All');

  // Pagination state (6 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;
  const cardsPanelRef = useRef(null);

  const [selectedInternship, setSelectedInternship] = useState(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applyError, setApplyError] = useState('');

  const searchRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const revealRef = useRevealAll();

  // Debounced search through the service layer
  useEffect(() => {
    let cancelled = false;
    const kick = window.setTimeout(() => setIsSearching(true), 0);
    const t = window.setTimeout(async () => {
      const res = await searchInternships({ query, category });
      if (!cancelled) {
        if (res.ok) {
          setResults(res.results || []);
          setSearchError('');
        } else {
          // Distinguish "no matches" from "the API failed" — never show an
          // empty state for a network/backend failure.
          setSearchError(res.error || 'Could not load internships right now.');
        }
        setIsSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      window.clearTimeout(t);
    };
  }, [query, category, searchNonce]);

  useEffect(() => {
    const unsubscribe = subscribeToInternships({
      onInternshipPublished: (incoming) => {
        const formatted = formatBackendInternship(incoming);
        if (!formatted) return;

        setResults((prev) => {
          const exists = prev.some((item) => String(item.id) === String(formatted.id));
          if (exists) {
            return prev.map((item) => (String(item.id) === String(formatted.id) ? { ...item, ...formatted } : item));
          }
          return [formatted, ...prev];
        });
      },
      onReconnect: async () => {
        const res = await searchInternships({ query, category });
        setResults(res.results || []);
      },
    });

    return () => unsubscribe();
  }, [query, category]);

  // Reset page number on filter changes (deferred to avoid sync setState in effect)
  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [query, category, selectedWorkMode, selectedDuration, selectedStipend, selectedMode2]);

  // Keyboard shortcut: "/" focuses the search bar
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          searchRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sidebar filters refine the service results client-side
  const filteredInternships = useMemo(() => results.filter((item) => {
    const matchesMode = selectedWorkMode === 'All' || item.workMode === selectedWorkMode;
    const matchesDuration = selectedDuration === 'All' || item.duration === selectedDuration;
    const matchesStipend = stipendNumber(item.stipend) >= (selectedStipend === 'All' ? 0 : parseInt(selectedStipend, 10));
    const matchesMode2 = selectedMode2 === 'All' || item.workMode === selectedMode2;
    return matchesMode && matchesDuration && matchesStipend && matchesMode2;
  }), [results, selectedWorkMode, selectedDuration, selectedStipend, selectedMode2]);

  // Calculate paginated slice
  const totalPages = Math.ceil(filteredInternships.length / ITEMS_PER_PAGE) || 1;
  const paginatedInternships = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInternships.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInternships, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      if (cardsPanelRef.current) {
        cardsPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const resetFilters = () => {
    setQuery('');
    setCategory('all');
    setSelectedWorkMode('All');
    setSelectedDuration('All');
    setSelectedStipend('All');
    setSelectedMode2('All');
  };

  const hasActiveFilters =
    query !== '' || category !== 'all' || selectedWorkMode !== 'All' ||
    selectedDuration !== 'All' || selectedStipend !== 'All' || selectedMode2 !== 'All';

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    setApplyError('');
    const session = getSession();
    if (!session?.token || session.user?.role !== 'intern') {
      setApplyError('Please sign in with an Intern account before applying.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitApplication(selectedInternship.id);
      setSubmittedSuccess(true);
      window.setTimeout(() => {
        setSubmittedSuccess(false);
        setApplyModalOpen(false);
        setSelectedInternship(null);
      }, 1600);
    } catch (error) {
      setApplyError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="opps-page" ref={revealRef}>
      {/* Product-oriented background: technical grid + spotlight + faint nodes (NOT the hero background) */}
      <div className="opps-bg" aria-hidden="true">
        <div className="opps-bg-grid" />
        <div className="opps-bg-spotlight" />
        <div className="opps-bg-nodes">
          <span /><span /><span /><span />
        </div>
      </div>

      <div className="container">
        {/* Header */}
        <div className="opps-header reveal-item" data-reveal>
          <span className="badge badge-primary opps-eyebrow"><Briefcase size={13} /> Opportunities</span>
          <h1 className="opps-title">
            Find where your next <span className="opps-title-accent">chapter begins.</span>
          </h1>
          <p className="opps-subtitle">Discover internships built for growth.</p>
        </div>

        {/* Premium search with keyboard hint */}
        <div className="opps-search-wrap reveal-item" data-reveal style={{ '--reveal-delay': '80ms' }}>
          <div className="opps-search">
            <Search size={18} className="opps-search-icon" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search internships, skills or companies..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search internships"
            />
            <kbd className="opps-search-kbd" aria-hidden="true">/</kbd>
          </div>
        </div>

        {/* Category pills */}
        <div className="opps-pills reveal-item" data-reveal style={{ '--reveal-delay': '140ms' }} role="tablist" aria-label="Internship categories">
          {EXPLORE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              className={`opps-pill ${category === cat.id ? 'is-active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Sidebar filters + cards */}
        <div className="opps-layout">

          {/* Filters */}
          <aside className="opps-filters reveal-item" data-reveal style={{ '--reveal-delay': '180ms' }}>
            <div className="opps-filters-head">
              <h3>Filters</h3>
              {hasActiveFilters && (
                <button type="button" className="opps-filters-reset" onClick={resetFilters}>
                  Reset
                </button>
              )}
            </div>
            <FilterGroup
              name="workmode"
              title="Work Mode"
              options={WORK_MODES}
              selected={selectedWorkMode}
              onSelect={setSelectedWorkMode}
            />
            <FilterGroup
              name="location"
              title="Location"
              options={LOCATIONS}
              selected={selectedMode2}
              onSelect={setSelectedMode2}
            />
            <FilterGroup
              name="duration"
              title="Duration"
              options={DURATIONS}
              selected={selectedDuration}
              onSelect={setSelectedDuration}
            />
            <FilterGroup
              name="stipend"
              title="Stipend"
              options={STIPENDS}
              selected={selectedStipend}
              onSelect={setSelectedStipend}
            />
          </aside>

          {/* Cards */}
          <section className="opps-cards-panel" ref={cardsPanelRef}>
            <div className="opps-results-count" aria-live="polite">
              Showing {filteredInternships.length} opportunit{filteredInternships.length === 1 ? 'y' : 'ies'}
              {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
            </div>

            {searchError ? (
              <div className="opps-empty reveal-item" data-reveal role="alert">
                <Search size={28} />
                <h3>Could not load internships</h3>
                <p>{searchError}</p>
                <button type="button" className="opps-pill" onClick={() => setSearchNonce((n) => n + 1)}>
                  Retry
                </button>
              </div>
            ) : (
            <div className={`opps-grid ${isSearching ? 'is-searching' : ''}`}>
              {paginatedInternships.length === 0 ? (
                <div className="opps-empty reveal-item" data-reveal>
                  <Search size={28} />
                  <h3>No matches found</h3>
                  <p>Try a different keyword, category, or clear the filters.</p>
                  <button type="button" className="opps-pill" onClick={resetFilters}>
                    Clear search &amp; filters
                  </button>
                </div>
              ) : (
                paginatedInternships.map((item, i) => (
                  <article
                    key={item.id}
                    className={`opps-card ${reducedMotion ? '' : 'opps-card-anim'}`}
                    style={{ '--reveal-delay': `${Math.min(i, 8) * 70}ms`, '--sweep-origin': i % 2 === 0 ? '-40%' : '120%' }}
                  >
                    {item.aiMatch && <AiMatchCard item={item} onView={() => setSelectedInternship(item)} />}
                    {!item.aiMatch && (
                      <>
                        <div className="opps-card-head">
                          <span className="opps-card-company">{item.company}</span>
                          {item.workMode === 'Remote' && <span className="opps-badge-remote"><MapPin size={11} /> Remote</span>}
                        </div>
                        <h3 className="opps-card-title">{item.title}</h3>
                        <p className="opps-card-desc">{item.description}</p>
                        <div className="opps-card-skills">
                          {item.skills.map((s) => <span key={s} className="opps-skill">{s}</span>)}
                        </div>
                        <div className="opps-card-foot">
                          <span className="opps-card-meta"><Clock size={12} /> {item.duration}</span>
                          <span className="opps-card-stipend">{item.stipend}</span>
                          <button type="button" className="opps-card-cta" onClick={() => setSelectedInternship(item)}>
                            View <ArrowRight size={14} className="opps-cta-arrow" />
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))
              )}
            </div>
            )}

            {/* Pagination Controls */}
            {!searchError && totalPages > 1 && (
              <div className="opps-pagination">
                <button
                  type="button"
                  className="opps-pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                <div className="opps-pagination-nums">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`opps-pagination-num ${currentPage === pageNum ? 'is-active' : ''}`}
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="opps-pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Details Modal */}
      {selectedInternship && (
        <div className="opps-modal-backdrop" onClick={() => setSelectedInternship(null)}>
          <div className="opps-modal-card" role="dialog" aria-modal="true" aria-label={`${selectedInternship.title} details`} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedInternship(null)}
              className="opps-modal-close"
              aria-label="Close details"
            >
              <X size={22} />
            </button>

            <div className="opps-modal-head">
              <div>
                <span className="opps-card-company">{selectedInternship.company}</span>
                <h3 className="opps-modal-title">{selectedInternship.title}</h3>
              </div>
              {selectedInternship.workMode === 'Remote' && (
                <span className="opps-badge-remote"><MapPin size={11} /> Remote</span>
              )}
            </div>

            <p className="opps-modal-desc">{selectedInternship.description}</p>

            <div className="opps-modal-meta">
              <span><MapPin size={13} /> {selectedInternship.workMode}</span>
              <span><Clock size={13} /> {selectedInternship.duration}</span>
              <span className="opps-modal-stipend">{selectedInternship.stipend}</span>
            </div>

            <div className="opps-card-skills">
              {selectedInternship.skills.map((s) => <span key={s} className="opps-skill">{s}</span>)}
            </div>

            <div className="opps-modal-section">
              <h4>About the Internship</h4>
              <p>{selectedInternship.description}</p>
            </div>

            <div className="opps-modal-section">
              <h4>Selection Process</h4>
              <div className="opps-modal-process">
                {['Resume AI Screening', 'Technical Assessment', 'Interview', 'Selection'].map((pr, i) => (
                  <span key={pr} className="opps-process-step">{i + 1}. {pr}</span>
                ))}
              </div>
            </div>

            <div className="opps-modal-actions">
              <button type="button" className="opps-modal-secondary" onClick={() => setSelectedInternship(null)}>
                Close
              </button>
              <button type="button" className="opps-modal-primary" onClick={() => setApplyModalOpen(true)}>
                Apply Now <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Application Modal */}
      {applyModalOpen && selectedInternship && (
        <div className="opps-modal-backdrop" onClick={() => setApplyModalOpen(false)}>
          <div className="opps-modal-card opps-modal-card-narrow" role="dialog" aria-modal="true" aria-label="Apply" onClick={(e) => e.stopPropagation()}>
            {submittedSuccess ? (
              <div className="opps-apply-success">
                <CheckCircle2 size={44} />
                <h3>Application Submitted!</h3>
                <p>AI Resume Screening initialized. Redirecting to sign in...</p>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit}>
                <h3 className="opps-modal-title">Apply for {selectedInternship.title}</h3>
                <p className="opps-modal-company-line">{selectedInternship.company}</p>

                <div className="opps-apply-field">
                  <label htmlFor="applicant-name">Full Name</label>
                  <input
                    id="applicant-name"
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>

                <div className="opps-apply-field">
                  <label htmlFor="applicant-email">Email Address</label>
                  <input
                    id="applicant-email"
                    type="email"
                    required
                    value={applicantEmail}
                    onChange={(e) => setApplicantEmail(e.target.value)}
                    placeholder="rahul@example.com"
                  />
                </div>

                <div className="opps-apply-field">
                  <label htmlFor="applicant-resume">Upload Resume (PDF/DOCX)</label>
                  <input id="applicant-resume" type="file" accept=".pdf,.docx" required className="opps-apply-file" />
                </div>

                {applyError && <p className="opps-apply-error" role="alert">{applyError}</p>}

                <div className="opps-modal-actions">
                  <button type="button" className="opps-modal-secondary" onClick={() => setApplyModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="opps-modal-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* AI match card variant — demonstrates the platform's screening capability */
function AiMatchCard({ item, onView }) {
  const wrapRef = useRef(null);
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      const settle = window.setTimeout(() => setDisplayScore(AI_MATCH_TARGET), 0);
      return () => window.clearTimeout(settle);
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 1100);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayScore(Math.round(AI_MATCH_TARGET * eased));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef}>
      <div className="opps-card-head">
        <span className="opps-card-company">{item.company}</span>
        <span className="opps-ai-badge"><Bot size={12} /> AI MATCH</span>
      </div>
      <div className="opps-ai-row">
        <span className="opps-ai-score">{displayScore}%</span>
        <div className="opps-ai-meter">
          <span className="opps-ai-meter-fill" style={{ '--meter': `${displayScore}%` }} />
        </div>
      </div>
      <h3 className="opps-card-title">{item.title}</h3>
      <p className="opps-card-desc">Strong match for: {item.aiMatch.strengths.join(' · ')}</p>
      <div className="opps-card-skills">
        {item.skills.map((s) => <span key={s} className="opps-skill">{s}</span>)}
      </div>
      <div className="opps-card-foot">
        <span className="opps-card-meta"><Clock size={12} /> {item.duration}</span>
        <span className="opps-card-stipend">{item.stipend}</span>
        <button type="button" className="opps-card-cta" onClick={onView}>
          View <ArrowRight size={14} className="opps-cta-arrow" />
        </button>
      </div>
    </div>
  );
}

const AI_MATCH_TARGET = 94;
