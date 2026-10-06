export default function TableScroll({ children, className = '', label = 'Scrollable item table' }) {
  return (
    <div className={`table-scroll ${className}`} role="region" aria-label={label} tabIndex={0}>
      <div className="table-scroll__hint" aria-hidden="true">Swipe horizontally to view all columns</div>
      {children}
    </div>
  );
}
