export const roundAmount = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const lineAmount = (quantity, unitCost) => roundAmount(Number(quantity || 0) * Number(unitCost || 0));
export const sumAmounts = values => roundAmount(values.reduce((sum, value) => sum + Number(value || 0), 0));
