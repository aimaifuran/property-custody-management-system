import { buildHistoricalFormPdf } from './historicalFormPdf.js';

export function createFormPdfCache(build = buildHistoricalFormPdf, limit = 12) {
  const records = new Map();
  const inFlight = new Map();
  return function getPdf(record) {
    const key = JSON.stringify({ type: record.type, details: record.details || {} }, (_, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      return Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]]));
    });
    if (records.has(key)) {
      const pending = records.get(key); records.delete(key); records.set(key, pending);
      return pending;
    }
    if (inFlight.has(key)) return inFlight.get(key);
    // Build the same values that formed the cache key, even when an editor
    // changes its object while the asynchronous generation is starting.
    const snapshot = { ...record, ...JSON.parse(key) };
    const pending = Promise.resolve().then(() => build(snapshot)).then(bytes => {
      inFlight.delete(key);
      records.set(key, pending);
      while (records.size > limit) records.delete(records.keys().next().value);
      return bytes;
    }).catch(error => { inFlight.delete(key); throw error; });
    inFlight.set(key, pending);
    return pending;
  };
}
export const getOfficialFormPdf = createFormPdfCache();
