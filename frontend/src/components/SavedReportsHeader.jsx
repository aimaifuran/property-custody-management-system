import { Search } from 'lucide-react';

export function filterReports(records, search) {
  const keyword = search.trim().toLocaleLowerCase();
  if (!keyword) return records;
  const values = value => {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    return Object.entries(value).filter(([key]) => !['_id', '__v'].includes(key)).map(([, entry]) => values(entry)).join(' ');
  };
  return records.filter(record => values(record).toLocaleLowerCase().includes(keyword));
}

export default function SavedReportsHeader({ children, search, onSearch, perPage, onPerPage, options = [5, 10, 25], title = 'Saved Reports' }) {
  return <div className="saved-reports-header">
    <div className="saved-reports-heading"><h2>{title}</h2>{children}</div>
    <div className="saved-reports-controls">
      <label className="saved-reports-search"><span className="sr-only">Search reports</span><Search size={16} aria-hidden="true" /><input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search reports" /></label>
      <label className="saved-reports-page-size">Per page<select value={perPage} onChange={event => onPerPage(Number(event.target.value))}>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
  </div>;
}
