const isDisposalReturn = slip => /\bdisposal\b/i.test(String(slip?.purpose || ''));

module.exports = { isDisposalReturn };
