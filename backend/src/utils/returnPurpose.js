const isDisposalReturn = slip => /\bdisposal\b/i.test(String(slip?.purpose || ''));
const isRepairReturn = slip => /\brepair\b/i.test(String(slip?.purpose || ''));

module.exports = { isDisposalReturn, isRepairReturn };
