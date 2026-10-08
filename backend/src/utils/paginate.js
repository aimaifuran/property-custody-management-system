const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { recordSort } = require('./savedReportOrder');

/**
 * Applies a case-insensitive substring search across a fixed set of fields
 * (dot paths allowed for nested subdocuments) plus offset/limit pagination.
 * Callers must restrict searchFields to header-level string fields only —
 * items[] table rows and Date-typed fields are intentionally never searched.
 */
const paginateAndSearch = async (Model, req, { searchFields = [], baseFilter = {}, populate } = {}) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
  const search = (req.query.search || '').toString().trim();

  const filter = { ...baseFilter };
  if (search && searchFields.length) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$and = [...(filter.$and || []), { $or: searchFields.map((field) => ({ [field]: regex })) }];
  }

  let query = Model.find(filter).sort(recordSort(Model));
  if (populate) query = query.populate(populate);

  const [data, total] = await Promise.all([
    query.skip((page - 1) * limit).limit(limit),
    Model.countDocuments(filter),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
};

// Existing pages expect an array. Clients opt into the newer response by
// sending pagination or search parameters.
const listRecords = async (Model, req, options = {}) => {
  if (['page', 'limit', 'search'].some(key => Object.hasOwn(req.query, key))) {
    const { data, pagination } = await paginateAndSearch(Model, req, options);
    return { items: data, pagination };
  }
  let query = Model.find(options.baseFilter || {}).sort(recordSort(Model));
  if (options.populate) query = query.populate(options.populate);
  return query;
};

module.exports = { paginateAndSearch, listRecords };
