import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({
  currentPage = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 25, 50],
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, safeCurrentPage - 1);
      let end = Math.min(totalPages - 1, safeCurrentPage + 1);

      if (safeCurrentPage <= 3) {
        end = 4;
      } else if (safeCurrentPage >= totalPages - 2) {
        start = totalPages - 3;
      }

      if (start > 2) pages.push('ellipsis-start');
      for (let i = start; i <= end; i += 1) pages.push(i);
      if (end < totalPages - 1) pages.push('ellipsis-end');
      pages.push(totalPages);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className={`pagination-container ${className}`} aria-label="Pagination Navigation">
      <div className="pagination-info">
        <span>
          Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of <strong>{totalItems}</strong> entries
        </span>

        {onPageSizeChange && (
          <div className="pagination-size-selector">
            <label htmlFor="items-per-page-select">Per page:</label>
            <select
              id="items-per-page-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="pagination-select"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-nav-btn"
          disabled={safeCurrentPage === 1}
          onClick={() => onPageChange(1)}
          title="First Page"
          aria-label="First Page"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          type="button"
          className="pagination-nav-btn"
          disabled={safeCurrentPage === 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft size={16} />
          <span className="pagination-btn-label">Prev</span>
        </button>

        <div className="pagination-pages">
          {pages.map((p, idx) => {
            if (p === 'ellipsis-start' || p === 'ellipsis-end') {
              return (
                <span key={`${p}-${idx}`} className="pagination-ellipsis">
                  …
                </span>
              );
            }

            return (
              <button
                key={p}
                type="button"
                className={`pagination-num-btn ${safeCurrentPage === p ? 'is-active' : ''}`}
                onClick={() => onPageChange(p)}
                aria-current={safeCurrentPage === p ? 'page' : undefined}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="pagination-nav-btn"
          disabled={safeCurrentPage === totalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
          title="Next Page"
          aria-label="Next Page"
        >
          <span className="pagination-btn-label">Next</span>
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          className="pagination-nav-btn"
          disabled={safeCurrentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Last Page"
          aria-label="Last Page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
