const source = require('../../../shared/ppeReference.json');

const referenceReport = {
  referenceLayout: true,
  ...Object.fromEntries(Object.entries(source).filter(([key]) => !['entries', 'recapitulationEntries'].includes(key))),
  rows: source.entries.map(([item, unit, quantity, risNumber = '', responsibilityCenter = '']) => ({ item, unit, quantity, risNumber, responsibilityCenter, stockNumber: '', unitCost: null })),
  recapitulation: source.recapitulationEntries.map(([item, unit, quantity]) => ({ item, unit, quantity, stockNumber: '', unitCost: null, totalCost: null, accountCode: '' })),
};
module.exports = { referenceReport };
