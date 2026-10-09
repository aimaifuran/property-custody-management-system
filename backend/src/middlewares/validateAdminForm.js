const { errorResponse } = require('../utils/response');

const signatory = (section, titleKey = 'designation') => [`${section}.name`, `${section}.${titleKey}`, `${section}.date`];
const rules = {
  iar: {
    fields: ['entityName', 'fundCluster', 'supplierName', 'poNumber', 'poDate', 'responsibilityCenterCode', 'iarNumber', 'iarDate', 'invoiceNumber', 'invoiceDate', 'inspectionDate', 'inspectedBy', 'acceptanceDate', 'custodian'],
    items: ['stockPropertyNumber', 'description', 'unit', 'quantity'], positive: ['quantity'],
  },
  ics: {
    fields: ['entityName', 'fundCluster', 'office', ...signatory('receivedFrom', 'position'), ...signatory('receivedBy', 'position')],
    items: ['quantity', 'unit', 'unitCost', 'description', 'inventoryItemNo', 'estimatedUsefulLife'], positive: ['quantity'], nonnegative: ['unitCost'],
  },
  par: {
    fields: ['entityName', 'fundCluster', 'office', ...signatory('receivedBy', 'position'), ...signatory('issuedBy', 'position')],
    items: ['quantity', 'unit', 'description', 'propertyNumber', 'dateAcquired', 'amount'], positive: ['quantity'], nonnegative: ['amount'],
  },
  ptr: {
    fields: ['entityName', 'fundCluster', 'fromAccountableOfficer', 'toAccountableOfficer', 'date', 'transferType', 'reasonForTransfer', ...signatory('approvedBy'), ...signatory('issuedBy'), ...signatory('receivedBy')],
    items: ['dateAcquired', 'propertyNumber', 'description', 'amount', 'condition'], nonnegative: ['amount'],
  },
  prs: {
    fields: ['lguName', 'purpose', ...signatory('returnedBy'), ...signatory('returnedTo')],
    items: ['quantity', 'unit', 'description', 'mrNumber', 'unitValue'], positive: ['quantity'], nonnegative: ['unitValue'],
  },
  'returned-supply': {
    fields: ['lguName', 'purpose', 'quantity', 'unit', 'description', 'mrNumber', 'unitValue', ...signatory('returnedBy'), ...signatory('returnedTo')],
    positiveFields: ['quantity'], nonnegativeFields: ['unitValue'],
  },
  'property-cards': {
    fields: ['month', 'poNumber', 'entityName', 'fundCluster', 'propertyPlantAndEquipment', 'propertyNumber', 'description'],
    items: ['propertyNumber', 'description', 'date', 'receiptQuantity', 'amount'], positive: ['receiptQuantity'], nonnegative: ['amount'],
  },
  ris: {
    fields: ['entityName', 'fundCluster', 'division', 'responsibilityCenterCode', 'office', 'purpose', 'date', ...signatory('requestedBy'), ...signatory('approvedBy'), ...signatory('issuedBy'), ...signatory('receivedBy')],
    items: ['stockNumber', 'unit', 'description', 'quantityRequested', 'quantityIssued'], positive: ['quantityRequested'], nonnegative: ['quantityIssued'],
  },
  suppliers: { fields: ['name', 'address', 'contactNumber'] },
  properties: { fields: ['propertyName', 'category', 'acquisitionDate', 'acquisitionCost', 'supplier', 'purchaseOrderNumber', 'sourceOfFund', 'location', 'description', 'quantity'], positiveFields: ['quantity'], nonnegativeFields: ['acquisitionCost'] },
  settings: { fields: ['organizationName', 'governmentAgency', 'address', 'telephone', 'systemName', 'lguName'] },
  profile: { fields: ['firstName', 'lastName', 'office', 'division'] },
  users: { fields: ['firstName', 'lastName', 'email', 'username', 'office', 'division'] },
  'monthly-item-reports': { fields: ['lgu', 'fund', 'serialNumber', 'reportDate', 'custodian', 'accountingStaff', 'postedDate'] },
  'ppe-station-reports': {
    fields: ['governmentUnit', 'accountGroup', 'date', 'preparedBy', 'preparedDesignation', 'reviewedBy', 'reviewedDesignation'],
    array: 'rows', items: ['article', 'description', 'propertyNumber', 'accountablePerson', 'unitCost', 'totalCost'], nonnegative: ['unitCost', 'totalCost'],
  },
};

const valueAt = (body, path) => path.split('.').reduce((value, key) => value?.[key], body);
const missing = value => value == null || (typeof value === 'string' && !value.trim());
const labelFor = path => path.replace(/\.(\d+)\./g, (_, index) => ` row ${Number(index) + 1} `).replace(/\./g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

function getAdminFormErrors(type, body = {}, method = 'POST') {
  const rule = rules[type];
  if (!rule) return [];
  const errors = [];
  const add = (path, message) => errors.push({ path, msg: `${labelFor(path)}: ${message}` });
  // Completed return slips permit corrections to the receiver signatory alone.
  const signatoryOnly = type === 'prs' && method === 'PUT' && Object.keys(body).length === 1 && body.returnedTo;
  const fields = signatoryOnly ? signatory('returnedTo') : rule.fields;
  for (const path of fields) {
    const value = valueAt(body, path);
    if (missing(value)) add(path, 'This field is required.');
    else if (/date$/i.test(path) && Number.isNaN(Date.parse(value))) add(path, 'Enter a valid date.');
  }
  const checkNumbers = (entry, keys, prefix, positive) => {
    for (const key of keys || []) {
      if (missing(entry[key])) continue; // Already reported as required.
      const value = Number(entry[key]);
      if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)) add(`${prefix}${key}`, positive ? 'Enter a number greater than zero.' : 'Enter a nonnegative number.');
    }
  };
  checkNumbers(body, rule.positiveFields, '', true);
  checkNumbers(body, rule.nonnegativeFields, '', false);
  if (type === 'users' && method === 'POST' && missing(body.password)) add('password', 'This field is required.');
  if (type === 'iar' && body.acceptanceStatus === 'Partial') {
    if (missing(body.acceptanceQuantity)) add('acceptanceQuantity', 'This field is required.');
    else checkNumbers(body, ['acceptanceQuantity'], '', true);
  }
  if (rule.items && !signatoryOnly) {
    const array = rule.array || 'items';
    if (!Array.isArray(body[array]) || !body[array].length || body[array].length > 500) add(array, 'Enter between 1 and 500 items.');
    else body[array].forEach((entry, index) => {
      const prefix = `${array}.${index}.`;
      for (const key of rule.items) {
        if (missing(entry?.[key])) add(`${prefix}${key}`, 'This field is required.');
        else if (/date$/i.test(key) && Number.isNaN(Date.parse(entry[key]))) add(`${prefix}${key}`, 'Enter a valid date.');
      }
      if (entry) {
        checkNumbers(entry, rule.positive, prefix, true);
        checkNumbers(entry, rule.nonnegative, prefix, false);
      }
    });
  }
  return errors;
}

const validateAdminForm = type => (req, res, next) => {
  if (req.user?.role !== 'admin') return next();
  const errors = getAdminFormErrors(type, req.body, req.method);
  if (errors.length) return errorResponse(res, `Form was not saved. ${errors[0].msg}`, errors, 400);
  return next();
};

module.exports = { validateAdminForm, getAdminFormErrors };
