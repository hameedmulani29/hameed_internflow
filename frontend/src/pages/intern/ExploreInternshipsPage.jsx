import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Zap,
  Building2,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Briefcase,
  Award,
  TrendingUp,
  SlidersHorizontal,
  Calendar
} from 'lucide-react';
import { fetchLiveInternships, formatBackendInternship } from '../../services/internService';
import { subscribeToInternships } from '../../services/realtimeService';
import '../../styles/InternWorkspace.css';

/* Filter Constants Tailored for Candidates */
const CATEGORIES = [
  { id: 'all', label: 'All Opportunities' },
  { id: 'aiml', label: 'AI & Machine Learning' },
  { id: 'web', label: 'Web Development' },
  { id: 'data', label: 'Data Science' },
  { id: 'backend', label: 'Backend Systems' },
  { id: 'design', label: 'Product Design' }
];

const WORK_MODES = ['All Modes', 'Remote', 'Hybrid', 'On-site'];
const DURATION_OPTIONS = ['All Durations', '3 Months', '4 Months', '5 Months', '6 Months'];
const MIN_STIPENDS = [
  { value: 0, label: 'Any Stipend' },
  { value: 14000, label: '₹14,000+ / mo' },
  { value: 17000, label: '₹17,000+ / mo' },
  { value: 20000, label: '₹20,000+ / mo' }
];

function stipendNumber(stipendStr) {
  const n = parseInt((stipendStr || '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

export default function ExploreInternshipsPage({ onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedWorkMode, setSelectedWorkMode] = useState('All Modes');
  const [selectedDuration, setSelectedDuration] = useState('All Durations');
  const [selectedMinStipend, setSelectedMinStipend] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  // Pagination state (6 internships per page)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  // Selected Internship Modal Preview State
  const [previewItem, setPreviewItem] = useState(null);

  const searchInputRef = useRef(null);
  const gridTopRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const items = await fetchLiveInternships();
        if (isMounted) {
          setCatalog(Array.isArray(items) ? items : []);
          setCatalogError('');
        }
      } catch (requestError) {
        if (isMounted) {
          setCatalogError(requestError?.message || 'Could not load internships right now.');
          setCatalog([]);
        }
      } finally {
        if (isMounted) setIsCatalogLoading(false);
      }
    }

    loadData();

    const unsubscribe = subscribeToInternships({
      onInternshipPublished: (incoming) => {
        const formatted = formatBackendInternship(incoming);
        if (!formatted) return;

        setCatalog((prev) => {
          const exists = prev.some((item) => String(item.id) === String(formatted.id));
          if (exists) {
            return prev.map((item) => (String(item.id) === String(formatted.id) ? { ...item, ...formatted } : item));
          }
          return [formatted, ...prev];
        });
      },
      onReconnect: () => {
        loadData();
      },
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Filter Logic
  const filteredInternships = useMemo(() => {
    return catalog.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q) ||
        item.skills.some((s) => s.toLowerCase().includes(q));

      const matchesCat =
        selectedCategory === 'all' ||
        (selectedCategory === 'aiml' && (item.department?.toLowerCase().includes('ai') || item.department?.toLowerCase().includes('ml'))) ||
        (selectedCategory === 'web' && item.department?.toLowerCase().includes('web')) ||
        (selectedCategory === 'data' && item.department?.toLowerCase().includes('data')) ||
        (selectedCategory === 'backend' && item.department?.toLowerCase().includes('backend')) ||
        (selectedCategory === 'design' && item.department?.toLowerCase().includes('design'));

      const matchesMode = selectedWorkMode === 'All Modes' || item.workMode === selectedWorkMode;
      const matchesDuration = selectedDuration === 'All Durations' || item.duration === selectedDuration;
      const matchesStipend = stipendNumber(item.stipend) >= selectedMinStipend;

      return matchesSearch && matchesCat && matchesMode && matchesDuration && matchesStipend;
    });
  }, [catalog, searchQuery, selectedCategory, selectedWorkMode, selectedDuration, selectedMinStipend]);

  // Reset page number on filter/search change (deferred to avoid sync setState in effect)
  useEffect(() => {
    const timer = setTimeout(() => setCurrentPage(1), 0);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, selectedWorkMode, selectedDuration, selectedMinStipend]);

  // Calculate paginated slice (10 per page)
  const totalPages = Math.ceil(filteredInternships.length / ITEMS_PER_PAGE) || 1;
  const paginatedInternships = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInternships.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInternships, currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      if (gridTopRef.current) {
        gridTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedWorkMode('All Modes');
    setSelectedDuration('All Durations');
    setSelectedMinStipend(0);
    setShowAdvancedFilters(false);
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedCategory !== 'all' ||
    selectedWorkMode !== 'All Modes' ||
    selectedDuration !== 'All Durations' ||
    selectedMinStipend > 0;

  return (
    <div className="intern-page-container explore-spacious-container">
      {/* Hero Atmosphere Header tailored for Intern Discovery */}
      <section className="explore-intern-hero glass-card animate-fade-in">
        <div className="explore-hero-left">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Internship Discovery Hub</span>
          </div>
          <h1 className="hero-title">
            Discover opportunities built for <span className="highlight-text">your future.</span>
          </h1>
          <p className="hero-subtitle">
            Explore verified engineering, AI, and design programs with 1-on-1 mentorship and competitive stipends.
          </p>

          {/* Quick Highlight Stats — real counts and product-level claims only */}
          <div className="explore-quick-stats">
            <div className="quick-stat">
              <Award size={16} className="text-cyan" />
              <span><strong>{catalog.length}</strong> Live Openings</span>
            </div>
            <div className="quick-stat">
              <CheckCircle2 size={16} className="text-mint" />
              <span><strong>Mentor-guided</strong> internships</span>
            </div>
            <div className="quick-stat">
              <TrendingUp size={16} className="text-indigo" />
              <span><strong>Verified</strong> outcomes</span>
            </div>
          </div>
        </div>
      </section>

      {/* Control Center: Search + Category Filter Bar */}
      <section className="explore-control-center glass-card animate-fade-in">
        {/* Search Bar Row */}
        <div className="explore-search-row">
          <div className="explore-search-input-box">
            <Search size={20} className="search-box-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="explore-search-input"
              placeholder="Search roles, companies, or skills (e.g. Python, React, PyTorch)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="btn-clear-search" onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <button
            className={`btn btn-outline filter-toggle-btn ${showAdvancedFilters ? 'active' : ''}`}
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            <SlidersHorizontal size={16} />
            <span>Refine Filters</span>
            {hasActiveFilters && <span className="filter-active-dot" />}
          </button>
        </div>

        {/* Category Glass Pills */}
        <div className="category-pills-scroll">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Advanced Filters Expandable Drawer */}
        {showAdvancedFilters && (
          <div className="advanced-filters-drawer animate-fade-in">
            <div className="drawer-grid">
              {/* Work Mode Filter */}
              <div className="drawer-filter-group">
                <label className="drawer-label">Work Mode</label>
                <div className="drawer-options">
                  {WORK_MODES.map((mode) => (
                    <button
                      key={mode}
                      className={`drawer-option-pill ${selectedWorkMode === mode ? 'active' : ''}`}
                      onClick={() => setSelectedWorkMode(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum Stipend Filter */}
              <div className="drawer-filter-group">
                <label className="drawer-label">Minimum Stipend</label>
                <div className="drawer-options">
                  {MIN_STIPENDS.map((stip) => (
                    <button
                      key={stip.value}
                      className={`drawer-option-pill ${selectedMinStipend === stip.value ? 'active' : ''}`}
                      onClick={() => setSelectedMinStipend(stip.value)}
                    >
                      {stip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Filter */}
              <div className="drawer-filter-group">
                <label className="drawer-label">Program Duration</label>
                <div className="drawer-options">
                  {DURATION_OPTIONS.map((dur) => (
                    <button
                      key={dur}
                      className={`drawer-option-pill ${selectedDuration === dur ? 'active' : ''}`}
                      onClick={() => setSelectedDuration(dur)}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="drawer-reset-row">
                <button className="btn-text-reset" onClick={resetAllFilters}>
                  Reset All Filters
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Grid Results Header */}
      <div className="explore-results-bar" ref={gridTopRef}>
        <span className="results-counter-text">
          Showing <strong>{filteredInternships.length}</strong> available program{filteredInternships.length === 1 ? '' : 's'}
          {hasActiveFilters ? ' (filtered)' : ''}
        </span>
        <span className="page-indicator-text">
          Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
        </span>
      </div>

      {/* Intern Opportunities Cards Grid */}
      <div className="internships-explore-grid">
        {isCatalogLoading ? (
          [0, 1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="glass-card internship-card explore-card-hover">
              <div className="skeleton-line" style={{ width: '65%' }} />
              <div className="skeleton-line" style={{ width: '40%' }} />
              <div className="skeleton-line" style={{ width: '90%' }} />
              <div className="skeleton-line" style={{ width: '75%' }} />
            </div>
          ))
        ) : catalogError ? (
          <div className="glass-card empty-state-card full-span">
            <Zap size={40} className="empty-icon text-cyan" />
            <h3>Could not load internships</h3>
            <p>{catalogError}</p>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setIsCatalogLoading(true);
                fetchLiveInternships()
                  .then((items) => {
                    setCatalog(Array.isArray(items) ? items : []);
                    setCatalogError('');
                  })
                  .catch((err) => setCatalogError(err?.message || 'Could not load internships right now.'))
                  .finally(() => setIsCatalogLoading(false));
              }}
            >
              Try Again
            </button>
          </div>
        ) : paginatedInternships.length > 0 ? (
          paginatedInternships.map((item) => (
            <div key={item.id} className="glass-card internship-card explore-card-hover animate-fade-in">
              {/* Card Header */}
              <div className="card-top">
                <div className="card-company-icon">
                  <Building2 size={24} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {item.formattedCreatedAt && (
                    <span className="tag-pill" title={item.createdAt ? `Posted: ${item.createdAt}` : ''}>
                      <Calendar size={12} className="text-cyan" /> {item.formattedCreatedAt}
                    </span>
                  )}
                  {item.status === 'published' ? (
                    <span className="tag-pill">
                      <CheckCircle2 size={12} className="text-mint" /> Live Opening
                    </span>
                  ) : (
                    <span className="tag-pill">
                      <Clock size={12} /> {item.status}
                    </span>
                  )}
                </div>
              </div>

              {/* Role Title & Company */}
              <div className="card-body-content">
                <h2 className="card-job-title">{item.title}</h2>
                <div className="company-meta-row">
                  <span className="company-name">{item.company}</span>
                  <span className="dot-sep">•</span>
                  <span className="dept-tag">{item.department}</span>
                </div>

                <p className="card-description">{item.description}</p>

                {/* Key Metadata Pills */}
                <div className="card-meta-tags">
                  <span className="tag-pill">
                    <MapPin size={12} />
                    {item.workMode}
                  </span>
                  <span className="tag-pill">
                    <Clock size={12} />
                    {item.duration}
                  </span>
                  <span className="tag-pill stipend-pill">{item.stipend}</span>
                </div>

                {/* Skills Cloud (only real published skills) */}
                {item.skills.length > 0 && (
                  <div className="card-skills-row">
                    {item.skills.map((skill) => (
                      <span key={skill} className="skill-chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="card-bottom-bar">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setPreviewItem(item)}
                >
                  Quick Preview
                </button>
                <button
                  className="btn btn-primary btn-sm glass-btn-primary"
                  onClick={() => onNavigate(`/intern/internships/${item.id}`)}
                >
                  <span>View Details</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))
        ) : catalog.length === 0 ? (
          <div className="glass-card empty-state-card full-span">
            <Briefcase size={40} className="empty-icon text-cyan" />
            <h3>No internships published yet</h3>
            <p>Providers publish new openings here the moment they go live — check back soon.</p>
          </div>
        ) : (
          <div className="glass-card empty-state-card full-span">
            <Search size={40} className="empty-icon text-cyan" />
            <h3>No matching internships found</h3>
            <p>Try adjusting your search terms or clearing active filters to see more programs.</p>
            <button className="btn btn-outline btn-sm" onClick={resetAllFilters}>
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Pagination Bar (10 per page) */}
      {totalPages > 1 && (
        <div className="pagination-bar glass-card animate-fade-in">
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => handlePageChange(currentPage - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>

          <div className="pagination-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                className={`pagination-num ${currentPage === pageNum ? 'active' : ''}`}
                onClick={() => handlePageChange(pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>

          <button
            className="pagination-btn"
            disabled={currentPage === totalPages}
            onClick={() => handlePageChange(currentPage + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Quick Preview Glass Modal Drawer */}
      {previewItem && (
        <div className="preview-modal-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="glass-card preview-modal-card animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div className="company-logo-large">
                <Building2 size={28} />
              </div>
              <div>
                <span className="hero-badge-sm">{previewItem.department}</span>
                <h2 className="preview-title">{previewItem.title}</h2>
                <span className="preview-company">{previewItem.company}</span>
              </div>
              <button className="preview-close-btn" onClick={() => setPreviewItem(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="preview-modal-body">
              <div className="preview-meta-row">
                <span className="tag-pill"><MapPin size={14} /> {previewItem.workMode}</span>
                <span className="tag-pill"><Clock size={14} /> {previewItem.duration}</span>
                <span className="tag-pill stipend-pill">{previewItem.stipend}</span>
                {previewItem.formattedCreatedAt && (
                  <span className="tag-pill"><Calendar size={14} /> Posted {previewItem.formattedCreatedAt}</span>
                )}
              </div>

              <div className="preview-section">
                <h4>About the Role</h4>
                <p>{previewItem.description}</p>
              </div>

              <div className="preview-section">
                <h4>Required Technical Skills</h4>
                <div className="skills-cloud">
                  {previewItem.skills.map((s) => (
                    <span key={s} className="skill-chip-large">{s}</span>
                  ))}
                </div>
              </div>

              <div className="preview-section">
                <h4>Selection Progression</h4>
                <div className="preview-flow-steps">
                  <span>1. Application</span>
                  <span>2. AI Screening</span>
                  <span>3. Provider Review</span>
                  <span>4. Selection</span>
                </div>
              </div>
            </div>

            <div className="preview-modal-footer">
              <button className="btn btn-outline" onClick={() => setPreviewItem(null)}>
                Close Preview
              </button>
              <button
                className="btn btn-primary glass-btn-primary"
                onClick={() => {
                  const id = previewItem.id;
                  setPreviewItem(null);
                  onNavigate(`/intern/applications/${id}/apply`);
                }}
              >
                <Send size={16} />
                <span>Apply Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
