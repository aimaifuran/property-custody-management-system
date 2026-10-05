import source from '../../../shared/ppeReference.json' with { type: 'json' };

export const suppliedPpeReport = {
  ...Object.fromEntries(Object.entries(source).filter(([key]) => !['entries', 'recapitulationEntries'].includes(key))),
  referenceLayout: true,
  rows: source.entries.map(([item, unit, quantity, risNumber = '', responsibilityCenter = '']) => ({ item, unit, quantity, risNumber, responsibilityCenter, stockNumber: '', unitCost: '' })),
  recapitulation: source.recapitulationEntries.map(([item, unit, quantity]) => ({ item, unit, quantity, stockNumber: '', unitCost: '', totalCost: '', accountCode: '' })),
};
