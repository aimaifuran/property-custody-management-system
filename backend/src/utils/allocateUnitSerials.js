// A serial identifies one unit. Save the entered value without generated suffixes.
module.exports = async function allocateUnitSerials(value, quantity) {
  const serial = String(value || '').trim();
  if (!serial || !quantity) return [];
  if (Number(quantity) !== 1) throw new Error('Only 1 Qty. per Serial Number');
  return [serial];
};
