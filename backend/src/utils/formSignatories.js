const catalog = require('../config/formSignatories.json');
const accountRoles = new Set(['requestedBy', 'receivedBy', 'returnedBy']);
function formSignatories(settings = {}) {
  const configured = settings.formSignatories instanceof Map ? Object.fromEntries(settings.formSignatories) : settings.formSignatories || {};
  const remembered = settings.rememberedSignatories instanceof Map ? Object.fromEntries(settings.rememberedSignatories) : settings.rememberedSignatories || {};
  return Object.fromEntries(catalog.map(form => [form.key, Object.fromEntries(form.roles.map(role => {
    const saved = configured[form.key]?.[role.key];
    let legacy = accountRoles.has(role.key) ? {} : remembered[role.key] || settings.signatories?.[role.key] || {};
    if (form.key === 'ppe') legacy = { name: settings.ppeReportSignatories?.[role.key], designation: settings.ppeReportSignatories?.[role.designationKey] };
    return [role.key, { name: saved?.name ?? legacy.name ?? '', designation: saved?.designation ?? legacy.designation ?? legacy.position ?? '' }];
  }))]));
}
function validateFormSignatories(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid signatory settings');
  const result = {};
  for (const form of catalog) {
    result[form.key] = {};
    for (const role of form.roles) {
      const entry = input[form.key]?.[role.key];
      if (!entry || typeof entry !== 'object') throw new Error(`Missing signatory: ${form.title} / ${role.label}`);
      result[form.key][role.key] = {};
      for (const field of ['name', 'designation']) {
        if (typeof entry[field] !== 'string' || entry[field].trim().length > 200) throw new Error('Signatory names and designations must contain up to 200 characters');
        result[form.key][role.key][field] = entry[field].trim();
      }
    }
  }
  return result;
}
module.exports = { formSignatories, validateFormSignatories };
