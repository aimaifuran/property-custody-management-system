import { buildHistoricalFormPdf } from './historicalFormPdf.js';

export function createFormPdfCache(build = buildHistoricalFormPdf, limit = 12) {
  const records = new Map();
  return function getPdf(record) {
    const key = JSON.stringify({ type: record.type, details: record.details || {} });
    if (records.has(key)) {
      const pending = records.get(key); records.delete(key); records.set(key, pending);
      return pending;
    }
    const pending = Promise.resolve().then(() => build(record)).catch(error => { if (records.get(key) === pending) records.delete(key); throw error; });
    records.set(key, pending);
    while (records.size > limit) records.delete(records.keys().next().value);
    return pending;
  };
}
export const getOfficialFormPdf = createFormPdfCache();
