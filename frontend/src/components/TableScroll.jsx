import { useEffect, useRef } from 'react';

export default function TableScroll({ children, className = '', label = 'Scrollable item table' }) {
  const container = useRef(null);
  useEffect(() => {
    const region = container.current;
    const content = region.querySelector('.table-scroll__content');
    const decorate = () => {
      content.querySelectorAll('table').forEach(table => {
        if (table.classList.contains('user-returns-table')) return;
        const headings = [...(table.tHead?.rows || [])].at(-1);
        const labels = headings ? [...headings.cells].map(cell => cell.textContent.trim() || 'Actions') : [];
        const simple = labels.length && [...headings.cells].every(cell => cell.colSpan === 1) && !table.querySelector('tbody [rowspan]:not([rowspan="1"])');
        table.classList.toggle('table-responsive-cards', !!simple);
        if (!simple) return;
        table.setAttribute('role', 'table');
        [...table.tBodies].forEach(body => [...body.rows].forEach(row => {
          const isSummary = row.cells.length !== labels.length || [...row.cells].some(cell => cell.colSpan > 1);
          row.classList.toggle('table-responsive-summary', isSummary);
          row.setAttribute('role', 'row');
          [...row.cells].forEach((cell, index) => {
            cell.setAttribute('role', 'cell');
            if (!isSummary && !cell.dataset.label) cell.dataset.label = labels[index];
          });
        }));
      });
      const grids = [...content.querySelectorAll('.ris-table-grid')];
      const headingIndex = grids.findIndex(row => row.children.length >= 8 && !row.querySelector('input, select, textarea'));
      if (headingIndex >= 0) {
        const labels = [...grids[headingIndex].children].map(cell => cell.textContent.trim() || 'Actions');
        grids.forEach((row, index) => {
          if (index <= headingIndex) row.dataset.responsiveHeading = 'true';
          else {
            row.dataset.responsiveRow = 'true';
            row.setAttribute('role', 'group'); row.setAttribute('aria-label', `Item ${index - headingIndex}`);
            [...row.children].forEach((cell, i) => { cell.dataset.label = labels[i] || 'Actions'; });
          }
        });
      }
      region.dataset.overflow = content.scrollWidth > content.clientWidth + 1 ? 'true' : 'false';
    };
    decorate();
    const observer = new ResizeObserver(decorate);
    observer.observe(region); observer.observe(content);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div ref={container} className={`table-scroll ${className}`} role="region" aria-label={label} tabIndex={0}>
      <div className="table-scroll__hint" aria-hidden="true">Swipe horizontally to view all columns</div>
      <div className="table-scroll__content">{children}</div>
    </div>
  );
}
