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

export function filterReportsByPoAndItem(records, search) {
  const keyword = search.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  if (!keyword) return records;
  const text = value => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ');
  return records.filter(record => {
    const poNumbers = [record.poNumber, record.iar?.poNumber, record.ris?.iar?.poNumber, record.item?.poNumber, record.prs?.items?.map(item => item.ris?.iar?.poNumber), record.inventory?.inspectionAcceptanceReport?.poNumber,
      ...(record.items || []).flatMap(item => [item.poNumber, item.iar?.poNumber, item.ris?.iar?.poNumber, item.inventory?.inspectionAcceptanceReport?.poNumber])];
    const names = [record.itemName, record.propertyPlantAndEquipment, record.description, record.name, record.item, ...(record.itemNames || []), ...(record.rows || []).flatMap(row => [row.article, row.description]), record.item?.itemName, record.item?.name, record.item?.description, ...(record.items || []).flatMap(item => [
      item.itemName, item.propertyPlantAndEquipment, item.name, item.description, item.item,
      item.inventory?.item?.name, item.inventory?.item?.category, item.inventory?.inspectionAcceptanceReport?.items?.map(received => received.propertyPlantAndEquipment || received.description || received.item)
    ])];
    return [...poNumbers, ...names.flat(Infinity)].some(value => text(value).includes(keyword));
  });
}

export default function SavedReportsHeader({ children, actions, search, onSearch, perPage, onPerPage, options = [5, 10, 25], title = 'Saved Reports', searchPlaceholder = 'Search reports' }) {
  return <div className="saved-reports-header">
    <div className="saved-reports-heading"><h2>{title}</h2>{children}</div>
    {(onSearch || actions || onPerPage) && <div className="saved-reports-controls">
      {onSearch && <label className="saved-reports-search"><span className="sr-only">{searchPlaceholder}</span><Search size={16} aria-hidden="true" /><input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={searchPlaceholder} /></label>}
      {actions}
      {onPerPage && <label className="saved-reports-page-size">Per page<select value={perPage} onChange={event => onPerPage(Number(event.target.value))}>{options.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    </div>}
  </div>;
}
